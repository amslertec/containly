import type { WebSocket } from 'ws';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ServerLogMessage } from '@containly/shared';
import { DockerIdSchema, EndpointIdSchema } from '@containly/shared';
import { getDocker, getEndpoint } from '../docker/endpoints.js';

const QuerySchema = z.object({
  endpoint: EndpointIdSchema.default('local'),
  tail: z.coerce.number().int().min(0).max(5000).default(200),
});
const ParamsSchema = z.object({ id: DockerIdSchema });

function send(socket: WebSocket, msg: ServerLogMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
}

/** Zerlegt eine Docker-Log-Zeile „<ts> <text>" in Zeitstempel + Nachricht. */
function splitTimestamp(line: string): { timestamp: string | null; message: string } {
  const idx = line.indexOf(' ');
  if (idx > 0) {
    const maybeTs = line.slice(0, idx);
    if (/^\d{4}-\d{2}-\d{2}T/.test(maybeTs)) {
      return { timestamp: maybeTs, message: line.slice(idx + 1) };
    }
  }
  return { timestamp: null, message: line };
}

function emitLines(
  socket: WebSocket,
  stream: 'stdout' | 'stderr',
  buffer: string,
): string {
  const parts = buffer.split('\n');
  const rest = parts.pop() ?? '';
  for (const line of parts) {
    if (line.length === 0) continue;
    const { timestamp, message } = splitTimestamp(line);
    send(socket, { type: 'log', stream, message, timestamp });
  }
  return rest;
}

export async function registerLogsWs(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/containers/:id/logs/stream',
    { websocket: true },
    async (socket: WebSocket, req: FastifyRequest) => {
      // Auth: onRequest-Hook hat req.user bereits aus dem Cookie aufgelöst.
      if (!req.user) {
        send(socket, { type: 'error', message: 'Nicht authentifiziert' });
        socket.close(1008, 'unauthorized');
        return;
      }

      let query: z.infer<typeof QuerySchema>;
      let id: string;
      try {
        query = QuerySchema.parse(req.query);
        id = ParamsSchema.parse(req.params).id;
      } catch {
        send(socket, { type: 'error', message: 'Ungültige Parameter' });
        socket.close(1008, 'bad_request');
        return;
      }

      if (!getEndpoint(query.endpoint)) {
        send(socket, { type: 'error', message: 'Endpoint nicht gefunden' });
        socket.close(1008, 'not_found');
        return;
      }

      let logStream: NodeJS.ReadableStream | null = null;
      try {
        const container = getDocker(query.endpoint).getContainer(id);
        const info = await container.inspect();
        const tty = info.Config?.Tty ?? false;

        logStream = (await container.logs({
          follow: true,
          stdout: true,
          stderr: true,
          timestamps: true,
          tail: query.tail,
        })) as unknown as NodeJS.ReadableStream;

        send(socket, { type: 'ready' });

        let outBuf = '';
        let errBuf = '';

        if (tty) {
          // Kein Multiplexing bei TTY: alles ist stdout.
          logStream.on('data', (chunk: Buffer) => {
            outBuf = emitLines(socket, 'stdout', outBuf + chunk.toString('utf8'));
          });
        } else {
          // Multiplexed Stream: 8-Byte-Header [type,0,0,0,size(4 BE)] + payload.
          let acc = Buffer.alloc(0);
          logStream.on('data', (chunk: Buffer) => {
            acc = Buffer.concat([acc, chunk]);
            while (acc.length >= 8) {
              const type = acc[0];
              const size = acc.readUInt32BE(4);
              if (acc.length < 8 + size) break;
              const payload = acc.subarray(8, 8 + size).toString('utf8');
              acc = acc.subarray(8 + size);
              if (type === 2) {
                errBuf = emitLines(socket, 'stderr', errBuf + payload);
              } else {
                outBuf = emitLines(socket, 'stdout', outBuf + payload);
              }
            }
          });
        }

        logStream.on('end', () => {
          send(socket, { type: 'end', message: 'Log-Stream beendet' });
          socket.close(1000);
        });
        logStream.on('error', (err: Error) => {
          send(socket, { type: 'error', message: err.message });
          socket.close(1011);
        });
      } catch (err) {
        send(socket, {
          type: 'error',
          message: err instanceof Error ? err.message : 'Log-Stream fehlgeschlagen',
        });
        socket.close(1011);
        return;
      }

      const cleanup = (): void => {
        try {
          (logStream as unknown as { destroy?: () => void } | null)?.destroy?.();
        } catch {
          /* ignore */
        }
      };
      socket.on('close', cleanup);
      socket.on('error', cleanup);
    },
  );
}

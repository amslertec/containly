import type { WebSocket } from 'ws';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { DockerIdSchema, EndpointIdSchema, ExecClientMessageSchema } from '@containly/shared';
import { getEndpoint } from '../docker/endpoints.js';
import { createExec } from '../docker/containers.js';
import { audit } from '../services/audit.js';

const QuerySchema = z.object({
  endpoint: EndpointIdSchema.default('local'),
  // Kommando als wiederholter Query-Param oder Default-Shell.
  cmd: z.union([z.string(), z.array(z.string())]).optional(),
});
const ParamsSchema = z.object({ id: DockerIdSchema });

function send(socket: WebSocket, obj: unknown): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(obj));
}

/**
 * Terminal-/Exec-WebSocket. NUR für Admins — Exec ist Code-Ausführung auf dem Host.
 * Jede Session wird im Audit-Log festgehalten (wer, was, wann, wo).
 */
export async function registerExecWs(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/containers/:id/exec/stream',
    { websocket: true },
    async (socket: WebSocket, req: FastifyRequest) => {
      if (!req.user) {
        send(socket, { type: 'error', message: 'Nicht authentifiziert' });
        socket.close(1008, 'unauthorized');
        return;
      }
      if (req.user.role !== 'admin') {
        send(socket, { type: 'error', message: 'Exec erfordert Admin-Rechte' });
        socket.close(1008, 'forbidden');
        return;
      }

      let endpoint: string;
      let id: string;
      let cmd: string[];
      try {
        const q = QuerySchema.parse(req.query);
        endpoint = q.endpoint;
        id = ParamsSchema.parse(req.params).id;
        const rawCmd = q.cmd === undefined ? ['/bin/sh'] : Array.isArray(q.cmd) ? q.cmd : [q.cmd];
        cmd = rawCmd.slice(0, 20).map((c) => String(c).slice(0, 2000));
        if (cmd.length === 0) cmd = ['/bin/sh'];
      } catch {
        send(socket, { type: 'error', message: 'Ungültige Parameter' });
        socket.close(1008, 'bad_request');
        return;
      }
      if (!getEndpoint(endpoint)) {
        send(socket, { type: 'error', message: 'Endpoint nicht gefunden' });
        socket.close(1008, 'not_found');
        return;
      }

      audit({
        userId: req.user.userId,
        username: req.user.username,
        action: 'exec',
        endpointId: endpoint,
        target: id,
        detail: { cmd },
        ip: req.ip,
      });

      try {
        const { stream, resize } = await createExec(endpoint, id, cmd);
        send(socket, { type: 'ready' });

        stream.on('data', (chunk: Buffer) => {
          send(socket, { type: 'data', data: chunk.toString('utf8') });
        });
        stream.on('end', () => {
          send(socket, { type: 'end' });
          socket.close(1000);
        });
        stream.on('error', (err: Error) => {
          send(socket, { type: 'error', message: err.message });
          socket.close(1011);
        });

        socket.on('message', (raw: Buffer) => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(raw.toString('utf8'));
          } catch {
            return;
          }
          const result = ExecClientMessageSchema.safeParse(parsed);
          if (!result.success) return;
          const msg = result.data;
          if (msg.type === 'stdin') {
            stream.write(msg.data);
          } else {
            resize(msg.cols, msg.rows).catch(() => {
              /* Resize-Fehler sind nicht fatal */
            });
          }
        });

        const cleanup = (): void => {
          try {
            stream.end();
            (stream as unknown as { destroy?: () => void }).destroy?.();
          } catch {
            /* ignore */
          }
        };
        socket.on('close', cleanup);
        socket.on('error', cleanup);
      } catch (err) {
        send(socket, {
          type: 'error',
          message: err instanceof Error ? err.message : 'Exec fehlgeschlagen',
        });
        socket.close(1011);
      }
    },
  );
}

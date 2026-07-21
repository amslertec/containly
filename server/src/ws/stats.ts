import type { WebSocket } from 'ws';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { DockerIdSchema, EndpointIdSchema } from '@containly/shared';
import { getDocker, getEndpoint } from '../docker/endpoints.js';
import { parseStats } from '../docker/containers.js';

const QuerySchema = z.object({ endpoint: EndpointIdSchema.default('local') });
const ParamsSchema = z.object({ id: DockerIdSchema });

/** Streamt Live-Ressourcenstats (CPU/RAM/Netz/IO) eines Containers als JSON-Frames. */
export async function registerStatsWs(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/containers/:id/stats/stream',
    { websocket: true },
    async (socket: WebSocket, req: FastifyRequest) => {
      if (!req.user) {
        socket.close(1008, 'unauthorized');
        return;
      }

      let endpoint: string;
      let id: string;
      try {
        endpoint = QuerySchema.parse(req.query).endpoint;
        id = ParamsSchema.parse(req.params).id;
      } catch {
        socket.close(1008, 'bad_request');
        return;
      }
      if (!getEndpoint(endpoint)) {
        socket.close(1008, 'not_found');
        return;
      }

      let statsStream: NodeJS.ReadableStream | null = null;
      try {
        const container = getDocker(endpoint).getContainer(id);
        statsStream = (await container.stats({ stream: true })) as unknown as NodeJS.ReadableStream;

        let buf = '';
        statsStream.on('data', (chunk: Buffer) => {
          buf += chunk.toString('utf8');
          let nl = buf.indexOf('\n');
          while (nl !== -1) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            nl = buf.indexOf('\n');
            if (!line) continue;
            try {
              const raw = JSON.parse(line);
              if (socket.readyState === socket.OPEN) {
                socket.send(JSON.stringify({ type: 'stats', data: parseStats(id, raw) }));
              }
            } catch {
              /* unvollständige Zeile ignorieren */
            }
          }
        });
        statsStream.on('end', () => socket.close(1000));
        statsStream.on('error', () => socket.close(1011));
      } catch (err) {
        if (socket.readyState === socket.OPEN) {
          socket.send(
            JSON.stringify({
              type: 'error',
              message: err instanceof Error ? err.message : 'Stats fehlgeschlagen',
            }),
          );
        }
        socket.close(1011);
        return;
      }

      const cleanup = (): void => {
        try {
          (statsStream as unknown as { destroy?: () => void } | null)?.destroy?.();
        } catch {
          /* ignore */
        }
      };
      socket.on('close', cleanup);
      socket.on('error', cleanup);
    },
  );
}

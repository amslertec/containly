import type { WebSocket } from 'ws';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { StackIdSchema } from '@containly/shared';
import { streamStackOp, type StackStreamOp } from '../services/stacks.js';
import { audit } from '../services/audit.js';

const OPS = ['up', 'down', 'start', 'stop', 'restart', 'pause', 'unpause', 'kill'] as const;
const QuerySchema = z.object({ op: z.enum(OPS) });
const ParamsSchema = z.object({ id: StackIdSchema });

function send(socket: WebSocket, obj: unknown): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(obj));
}

function auditAction(op: StackStreamOp): string {
  if (op === 'up') return 'stack.deploy';
  if (op === 'down') return 'stack.down';
  return `stack.${op}`;
}

/**
 * Streamt die Ausgabe von `docker compose <op>` live über WebSocket (Terminal-
 * Ansicht im UI). NUR für Admins; jede Aktion wird auditiert.
 */
export async function registerStackDeployWs(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/stacks/:id/deploy/stream',
    { websocket: true },
    async (socket: WebSocket, req: FastifyRequest) => {
      if (!req.user) {
        send(socket, { type: 'error', message: 'Nicht authentifiziert' });
        socket.close(1008, 'unauthorized');
        return;
      }
      if (req.user.role !== 'admin') {
        send(socket, { type: 'error', message: 'Admin-Rechte erforderlich' });
        socket.close(1008, 'forbidden');
        return;
      }

      let id: string;
      let op: StackStreamOp;
      try {
        id = ParamsSchema.parse(req.params).id;
        op = QuerySchema.parse(req.query).op;
      } catch {
        send(socket, { type: 'error', message: 'Ungültige Parameter' });
        socket.close(1008, 'bad_request');
        return;
      }

      audit({ userId: req.user.userId, username: req.user.username, action: auditAction(op), ip: req.ip });
      send(socket, { type: 'start' });

      try {
        const code = await streamStackOp(id, op, (chunk) => send(socket, { type: 'data', data: chunk }));
        send(socket, { type: 'end', code });
        socket.close(1000);
      } catch (err) {
        send(socket, { type: 'error', message: err instanceof Error ? err.message : 'Operation fehlgeschlagen' });
        socket.close(1011);
      }
    },
  );
}

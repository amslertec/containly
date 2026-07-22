import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AddGitStackSchema } from '@containly/shared';
import { addGitStack, listGitStacks, removeGitStack, syncGitStack } from '../services/gitops.js';
import { currentUser, requireAdmin } from '../plugins/auth.js';
import { audit } from '../services/audit.js';
import { AppError, Errors, fromDockerError } from '../errors.js';

const IdParams = z.object({ id: z.coerce.number().int().positive() });

export async function gitopsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/gitops', { preHandler: requireAdmin }, async () => ({ stacks: listGitStacks() }));

  app.post('/api/gitops', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const body = AddGitStackSchema.parse(req.body);
    try {
      const stack = await addGitStack(body);
      audit({ userId: ctx.userId, username: ctx.username, action: 'gitops.add', target: body.repoUrl, endpointId: body.endpoint, ip: req.ip });
      return { stack };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw Errors.badRequest(err instanceof Error ? err.message : String(err));
    }
  });

  app.post('/api/gitops/:id/sync', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { id } = IdParams.parse(req.params);
    try {
      const stack = await syncGitStack(id);
      audit({ userId: ctx.userId, username: ctx.username, action: 'gitops.sync', target: stack.name, endpointId: stack.endpoint, ip: req.ip });
      return { stack };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw fromDockerError(err);
    }
  });

  app.delete('/api/gitops/:id', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { id } = IdParams.parse(req.params);
    removeGitStack(id);
    audit({ userId: ctx.userId, username: ctx.username, action: 'gitops.remove', target: String(id), ip: req.ip });
    return { ok: true as const };
  });
}

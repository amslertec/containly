import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listContainerFiles,
  readContainerFileBase64,
  writeContainerFileBase64,
  deleteContainerPath,
} from '../services/container-fs.js';
import { getEndpoint } from '../docker/endpoints.js';
import { currentUser, requireAdmin, requireAuth } from '../plugins/auth.js';
import { audit } from '../services/audit.js';
import { Errors, fromDockerError } from '../errors.js';

const Q = z.object({
  endpoint: z.string().min(1).max(64),
  id: z.string().min(1).max(160),
  path: z.string().max(4096).default(''),
});

function assertEp(id: string): void {
  if (!getEndpoint(id)) throw Errors.notFound(`Endpoint nicht gefunden: ${id}`);
}

export async function containerFileRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/containers/:id/files', { preHandler: requireAuth }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { endpoint, path } = Q.parse({ ...(req.query as object), id });
    assertEp(endpoint);
    try {
      return await listContainerFiles(endpoint, id, path);
    } catch (err) {
      throw fromDockerError(err);
    }
  });

  app.get('/api/containers/:id/files/download', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { endpoint, path } = Q.parse({ ...(req.query as object), id });
    assertEp(endpoint);
    const b64 = await readContainerFileBase64(endpoint, id, path).catch((e) => {
      throw fromDockerError(e);
    });
    const name = path.split('/').filter(Boolean).pop() ?? 'download';
    reply.header('Content-Disposition', `attachment; filename="${name}"`);
    reply.header('Content-Type', 'application/octet-stream');
    return reply.send(Buffer.from(b64, 'base64'));
  });

  app.post('/api/containers/:id/files/upload', { preHandler: requireAdmin }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { endpoint, path, contentBase64 } = z
      .object({ endpoint: z.string(), path: z.string().max(4096), contentBase64: z.string() })
      .parse(req.body);
    assertEp(endpoint);
    const ctx = currentUser(req);
    await writeContainerFileBase64(endpoint, id, path, contentBase64).catch((e) => {
      throw fromDockerError(e);
    });
    audit({ userId: ctx.userId, username: ctx.username, action: 'container.file.upload', endpointId: endpoint, target: id, ip: req.ip });
    return { ok: true as const };
  });

  app.delete('/api/containers/:id/files', { preHandler: requireAdmin }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { endpoint, path } = Q.parse({ ...(req.query as object), id });
    assertEp(endpoint);
    const ctx = currentUser(req);
    await deleteContainerPath(endpoint, id, path).catch((e) => {
      throw fromDockerError(e);
    });
    audit({ userId: ctx.userId, username: ctx.username, action: 'container.file.delete', endpointId: endpoint, target: id, ip: req.ip });
    return { ok: true as const };
  });
}

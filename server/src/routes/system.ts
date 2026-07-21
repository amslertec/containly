import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ListQuerySchema } from '@containly/shared';
import { getDocker, getEndpoint } from '../docker/endpoints.js';
import { requireAdmin, requireAuth } from '../plugins/auth.js';
import { listAudit } from '../services/audit.js';
import { AppError, Errors, fromDockerError } from '../errors.js';

async function docker<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw fromDockerError(err);
  }
}

const AuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/system/info', { preHandler: requireAuth }, async (req) => {
    const { endpoint } = ListQuerySchema.parse(req.query);
    if (!getEndpoint(endpoint)) throw Errors.notFound('Endpoint nicht gefunden');
    const client = getDocker(endpoint);
    const info = (await docker(() => client.info())) as Record<string, unknown>;
    return {
      info: {
        name: info.Name ?? null,
        serverVersion: info.ServerVersion ?? null,
        containers: info.Containers ?? 0,
        containersRunning: info.ContainersRunning ?? 0,
        containersPaused: info.ContainersPaused ?? 0,
        containersStopped: info.ContainersStopped ?? 0,
        images: info.Images ?? 0,
        ncpu: info.NCPU ?? 0,
        memTotal: info.MemTotal ?? 0,
        operatingSystem: info.OperatingSystem ?? null,
        architecture: info.Architecture ?? null,
        kernelVersion: info.KernelVersion ?? null,
      },
    };
  });

  app.get('/api/audit', { preHandler: requireAdmin }, async (req) => {
    const { limit, offset } = AuditQuerySchema.parse(req.query);
    return { entries: listAudit(limit, offset) };
  });
}

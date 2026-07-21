import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ContainerActionSchema,
  DockerIdSchema,
  ListQuerySchema,
  RemoveContainerQuerySchema,
} from '@containly/shared';
import {
  containerAction,
  inspectContainer,
  listContainers,
  removeContainer,
} from '../docker/containers.js';
import { getEndpoint } from '../docker/endpoints.js';
import { currentUser, requireAdmin, requireAuth } from '../plugins/auth.js';
import { audit } from '../services/audit.js';
import { AppError, Errors, fromDockerError } from '../errors.js';

const ParamsSchema = z.object({ id: DockerIdSchema });
const ActionParamsSchema = z.object({ id: DockerIdSchema, action: ContainerActionSchema });

function assertEndpoint(id: string): void {
  if (!getEndpoint(id)) throw Errors.notFound(`Endpoint nicht gefunden: ${id}`);
}

/** Führt einen Docker-Aufruf aus und übersetzt dockerode-Fehler einheitlich. */
async function docker<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw fromDockerError(err);
  }
}

export async function containerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/containers', { preHandler: requireAuth }, async (req) => {
    const { endpoint } = ListQuerySchema.parse(req.query);
    assertEndpoint(endpoint);
    const containers = await docker(() => listContainers(endpoint));
    return { containers };
  });

  app.get('/api/containers/:id', { preHandler: requireAuth }, async (req) => {
    const { endpoint } = ListQuerySchema.parse(req.query);
    const { id } = ParamsSchema.parse(req.params);
    assertEndpoint(endpoint);
    const container = await docker(() => inspectContainer(endpoint, id));
    return { container };
  });

  app.post('/api/containers/:id/:action', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { endpoint } = ListQuerySchema.parse(req.query);
    const { id, action } = ActionParamsSchema.parse(req.params);
    assertEndpoint(endpoint);
    try {
      await docker(() => containerAction(endpoint, id, action));
    } catch (err) {
      audit({
        userId: ctx.userId,
        username: ctx.username,
        action: `container.${action}`,
        endpointId: endpoint,
        target: id,
        outcome: 'error',
        ip: req.ip,
      });
      throw err;
    }
    audit({
      userId: ctx.userId,
      username: ctx.username,
      action: `container.${action}`,
      endpointId: endpoint,
      target: id,
      ip: req.ip,
    });
    return { ok: true as const };
  });

  app.delete('/api/containers/:id', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { endpoint } = ListQuerySchema.parse(req.query);
    const { id } = ParamsSchema.parse(req.params);
    const opts = RemoveContainerQuerySchema.parse(req.query);
    assertEndpoint(endpoint);
    await docker(() => removeContainer(endpoint, id, opts));
    audit({
      userId: ctx.userId,
      username: ctx.username,
      action: 'container.remove',
      endpointId: endpoint,
      target: id,
      detail: { force: opts.force, volumes: opts.volumes },
      ip: req.ip,
    });
    return { ok: true as const };
  });
}

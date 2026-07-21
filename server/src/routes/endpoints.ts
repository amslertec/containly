import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateEndpointSchema, EndpointIdSchema, UpdateEndpointSchema } from '@containly/shared';
import {
  checkHealth,
  createEndpoint,
  deleteEndpoint,
  getEndpoint,
  listEndpoints,
  updateEndpoint,
} from '../docker/endpoints.js';
import { currentUser, requireAdmin, requireAuth } from '../plugins/auth.js';
import { audit } from '../services/audit.js';
import { Errors } from '../errors.js';

const ParamsSchema = z.object({ id: EndpointIdSchema });

export async function endpointRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/endpoints', { preHandler: requireAuth }, async () => ({
    endpoints: listEndpoints(),
  }));

  app.post('/api/endpoints', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const body = CreateEndpointSchema.parse(req.body);
    const endpoint = createEndpoint(body);
    // Sofortiger Health-Check, damit das UI direkt Status zeigt.
    await checkHealth(endpoint.id);
    audit({
      userId: ctx.userId,
      username: ctx.username,
      action: 'endpoint.create',
      endpointId: endpoint.id,
      target: endpoint.name,
      detail: { type: endpoint.type },
      ip: req.ip,
    });
    return { endpoint: getEndpoint(endpoint.id) };
  });

  app.put('/api/endpoints/:id', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { id } = ParamsSchema.parse(req.params);
    const existing = getEndpoint(id);
    if (!existing) throw Errors.notFound('Endpoint nicht gefunden');
    const body = UpdateEndpointSchema.parse(req.body);
    let endpoint;
    try {
      endpoint = updateEndpoint(id, body);
    } catch (err) {
      throw Errors.badRequest(err instanceof Error ? err.message : 'Aktualisierung fehlgeschlagen');
    }
    await checkHealth(endpoint.id);
    audit({
      userId: ctx.userId,
      username: ctx.username,
      action: 'endpoint.update',
      endpointId: id,
      target: endpoint.name,
      ip: req.ip,
    });
    return { endpoint: getEndpoint(id) };
  });

  app.delete('/api/endpoints/:id', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { id } = ParamsSchema.parse(req.params);
    const endpoint = getEndpoint(id);
    if (!endpoint) throw Errors.notFound('Endpoint nicht gefunden');
    deleteEndpoint(id);
    audit({
      userId: ctx.userId,
      username: ctx.username,
      action: 'endpoint.delete',
      endpointId: id,
      target: endpoint.name,
      ip: req.ip,
    });
    return { ok: true as const };
  });

  app.post('/api/endpoints/:id/check', { preHandler: requireAuth }, async (req) => {
    const { id } = ParamsSchema.parse(req.params);
    if (!getEndpoint(id)) throw Errors.notFound('Endpoint nicht gefunden');
    const status = await checkHealth(id);
    return { endpoint: getEndpoint(id), status };
  });
}

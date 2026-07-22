import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DockerIdSchema, ListQuerySchema } from '@containly/shared';
import { getMetrics } from '../services/metrics.js';
import { getEndpoint } from '../docker/endpoints.js';
import { requireAuth } from '../plugins/auth.js';
import { Errors } from '../errors.js';

const QuerySchema = ListQuerySchema.extend({
  range: z.coerce.number().int().min(60_000).max(30 * 24 * 60 * 60 * 1000).default(3_600_000),
});

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/containers/:id/metrics', { preHandler: requireAuth }, async (req) => {
    const { endpoint, range } = QuerySchema.parse(req.query);
    const { id } = z.object({ id: DockerIdSchema }).parse(req.params);
    if (!getEndpoint(endpoint)) throw Errors.notFound(`Endpoint nicht gefunden: ${endpoint}`);
    return { points: getMetrics(endpoint, id, range) };
  });
}

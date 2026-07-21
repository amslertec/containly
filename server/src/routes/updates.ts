import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ListQuerySchema } from '@containly/shared';
import { checkUpdates } from '../docker/updates.js';
import { getBulkJob, startBulkUpdate } from '../services/update-jobs.js';
import { getEndpoint } from '../docker/endpoints.js';
import { currentUser, requireAdmin, requireAuth } from '../plugins/auth.js';
import { audit } from '../services/audit.js';
import { AppError, Errors, fromDockerError } from '../errors.js';

const QuerySchema = ListQuerySchema.extend({ refresh: z.coerce.boolean().default(false) });

export async function updateRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/updates', { preHandler: requireAuth }, async (req) => {
    const { endpoint, refresh } = QuerySchema.parse(req.query);
    if (!getEndpoint(endpoint)) throw Errors.notFound(`Endpoint nicht gefunden: ${endpoint}`);
    try {
      return await checkUpdates(endpoint, refresh);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw fromDockerError(err);
    }
  });

  // Status des Bulk-Update-Jobs (überlebt Reloads).
  app.get('/api/updates/bulk', { preHandler: requireAuth }, async (req) => {
    const { endpoint } = ListQuerySchema.parse(req.query);
    if (!getEndpoint(endpoint)) throw Errors.notFound(`Endpoint nicht gefunden: ${endpoint}`);
    return getBulkJob(endpoint);
  });

  // Bulk-Update starten (alle offenen Updates nacheinander, im Hintergrund).
  app.post('/api/updates/bulk', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { endpoint } = z.object({ endpoint: z.string().min(1).max(64) }).parse(req.body);
    if (!getEndpoint(endpoint)) throw Errors.notFound(`Endpoint nicht gefunden: ${endpoint}`);
    const job = await startBulkUpdate(endpoint);
    audit({ userId: ctx.userId, username: ctx.username, action: 'update.bulk', endpointId: endpoint, ip: req.ip });
    return job;
  });
}

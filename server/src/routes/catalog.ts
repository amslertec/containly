import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CatalogSourceInputSchema, DeployTemplateSchema } from '@containly/shared';
import {
  listSources,
  addSource,
  updateSource,
  deleteSource,
  fetchTemplates,
  deployTemplate,
} from '../services/catalog.js';
import { currentUser, requireAdmin, requireAuth } from '../plugins/auth.js';
import { audit } from '../services/audit.js';
import { Errors } from '../errors.js';

const IdParam = z.object({ id: z.coerce.number().int().positive() });

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  // ── Quellen ─────────────────────────────────────────────────────────────
  app.get('/api/catalog/sources', { preHandler: requireAdmin }, async () => ({
    sources: listSources(),
  }));

  app.post('/api/catalog/sources', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const body = CatalogSourceInputSchema.parse(req.body);
    const source = addSource(body);
    audit({ userId: ctx.userId, username: ctx.username, action: 'catalog.source.add', target: body.url, ip: req.ip });
    return { source };
  });

  app.put('/api/catalog/sources/:id', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { id } = IdParam.parse(req.params);
    const body = CatalogSourceInputSchema.parse(req.body);
    updateSource(id, body);
    audit({ userId: ctx.userId, username: ctx.username, action: 'catalog.source.update', target: String(id), ip: req.ip });
    return { ok: true as const };
  });

  app.delete('/api/catalog/sources/:id', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { id } = IdParam.parse(req.params);
    deleteSource(id);
    audit({ userId: ctx.userId, username: ctx.username, action: 'catalog.source.delete', target: String(id), ip: req.ip });
    return { ok: true as const };
  });

  // ── Templates ───────────────────────────────────────────────────────────
  app.get('/api/catalog/templates', { preHandler: requireAuth }, async () => ({
    templates: await fetchTemplates(),
  }));

  app.post('/api/catalog/deploy', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const body = DeployTemplateSchema.parse(req.body);
    try {
      const result = await deployTemplate(body);
      audit({ userId: ctx.userId, username: ctx.username, action: 'catalog.deploy', endpointId: body.endpoint, target: body.name, ip: req.ip });
      return { result };
    } catch (err) {
      audit({ userId: ctx.userId, username: ctx.username, action: 'catalog.deploy', outcome: 'error', endpointId: body.endpoint, target: body.name, ip: req.ip });
      throw Errors.badRequest(err instanceof Error ? err.message : 'Deploy fehlgeschlagen');
    }
  });
}

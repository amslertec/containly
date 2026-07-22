import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RegistryLoginSchema } from '@containly/shared';
import { deleteRegistry, listRegistries, setRegistry, verifyRegistryLogin } from '../services/registry.js';
import { repoTags, searchImages } from '../services/dockerhub.js';
import { getDocker, listEndpoints } from '../docker/endpoints.js';
import { currentUser, requireAdmin, requireAuth } from '../plugins/auth.js';
import { audit } from '../services/audit.js';
import { Errors } from '../errors.js';

export async function registryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/registries', { preHandler: requireAdmin }, async () => ({ registries: listRegistries() }));

  // Image-Autocomplete: eigene/private Repos + öffentliche Docker-Hub-Treffer.
  app.get('/api/registries/search', { preHandler: requireAuth }, async (req) => {
    const { q } = z.object({ q: z.string().max(255).default('') }).parse(req.query);
    if (q.trim().length < 1) return { own: [], hub: [] };
    return searchImages(q);
  });

  // Tags eines Repos (nach Auswahl in der Autocomplete).
  app.get('/api/registries/tags', { preHandler: requireAuth }, async (req) => {
    const { repo } = z.object({ repo: z.string().min(1).max(255) }).parse(req.query);
    return { tags: await repoTags(repo) };
  });

  app.put('/api/registries', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const body = RegistryLoginSchema.parse(req.body);
    // Anmeldung gegen einen erreichbaren Daemon verifizieren (nutzt einen Online-Endpoint).
    const online = listEndpoints().find((e) => e.status === 'online');
    if (online) {
      try {
        await verifyRegistryLogin(getDocker(online.id), body.registry, body.username, body.secret);
      } catch {
        throw Errors.badRequest('Anmeldung fehlgeschlagen — Benutzername/Passwort (oder Token) prüfen');
      }
    }
    setRegistry(body.registry, body.username, body.secret);
    audit({ userId: ctx.userId, username: ctx.username, action: 'registry.login', target: body.registry, ip: req.ip });
    return { ok: true as const };
  });

  app.delete('/api/registries/:registry', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { registry } = z.object({ registry: z.string().min(1).max(255) }).parse(req.params);
    deleteRegistry(registry);
    audit({ userId: ctx.userId, username: ctx.username, action: 'registry.logout', target: registry, ip: req.ip });
    return { ok: true as const };
  });
}

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CreateNetworkSchema,
  CreateVolumeSchema,
  DockerIdSchema,
  ListQuerySchema,
  PullImageSchema,
  RemoveImageQuerySchema,
  TagImageSchema,
} from '@containly/shared';
import {
  createNetwork,
  createVolume,
  imageHistory,
  listImages,
  listNetworks,
  listVolumes,
  pruneImages,
  pruneNetworks,
  pruneVolumes,
  pullImage,
  removeImage,
  removeNetwork,
  removeVolume,
  tagImage,
} from '../docker/resources.js';
import { getEndpoint } from '../docker/endpoints.js';
import { getVulnState, getVulnDetails, rescanEndpoint } from '../services/vuln-scanner.js';
import { currentUser, requireAdmin, requireAuth } from '../plugins/auth.js';
import { audit } from '../services/audit.js';
import { AppError, Errors, fromDockerError } from '../errors.js';

async function docker<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw fromDockerError(err);
  }
}

function assertEndpoint(id: string): void {
  if (!getEndpoint(id)) throw Errors.notFound(`Endpoint nicht gefunden: ${id}`);
}

const IdParams = z.object({ id: DockerIdSchema });
// Image-Referenzen (sha256:…, repo:tag, registry/name:tag) enthalten „:" und „/" — die
// dürfen NICHT im URL-Pfad stehen (Routing bricht am „/"). Daher als Query/Body-Feld.
const ImageRefSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_./:@-]*$/, 'Ungültige Image-Referenz');
const ImageRefQuery = ListQuerySchema.extend({ ref: ImageRefSchema });
const NameParams = z.object({ name: DockerIdSchema });

export async function resourceRoutes(app: FastifyInstance): Promise<void> {
  /* ── Images ───────────────────────────────────────────────────────────── */
  app.get('/api/images', { preHandler: requireAuth }, async (req) => {
    const { endpoint } = ListQuerySchema.parse(req.query);
    assertEndpoint(endpoint);
    return { images: await docker(() => listImages(endpoint)) };
  });

  app.post('/api/images/pull', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { endpoint } = ListQuerySchema.parse(req.query);
    const { image } = PullImageSchema.parse(req.body);
    assertEndpoint(endpoint);
    await docker(() => pullImage(endpoint, image));
    audit({ userId: ctx.userId, username: ctx.username, action: 'image.pull', endpointId: endpoint, target: image, ip: req.ip });
    return { ok: true as const };
  });

  // Image taggen (Referenz im Body, damit „:/" sauber funktionieren).
  app.post('/api/images/tag', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { endpoint } = ListQuerySchema.parse(req.query);
    const { ref, repo, tag } = z
      .object({ ref: ImageRefSchema })
      .and(TagImageSchema)
      .parse(req.body);
    assertEndpoint(endpoint);
    await docker(() => tagImage(endpoint, ref, repo, tag));
    audit({ userId: ctx.userId, username: ctx.username, action: 'image.tag', endpointId: endpoint, target: `${repo}:${tag}`, ip: req.ip });
    return { ok: true as const };
  });

  // Image entfernen (Referenz als Query-Feld).
  app.delete('/api/images', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { endpoint, ref } = ImageRefQuery.parse(req.query);
    const { force } = RemoveImageQuerySchema.parse(req.query);
    assertEndpoint(endpoint);
    await docker(() => removeImage(endpoint, ref, force));
    audit({ userId: ctx.userId, username: ctx.username, action: 'image.remove', endpointId: endpoint, target: ref, detail: { force }, ip: req.ip });
    return { ok: true as const };
  });

  app.post('/api/images/prune', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { endpoint } = ListQuerySchema.parse(req.query);
    assertEndpoint(endpoint);
    const result = await docker(() => pruneImages(endpoint));
    audit({ userId: ctx.userId, username: ctx.username, action: 'image.prune', endpointId: endpoint, detail: { count: result.deleted.length }, ip: req.ip });
    return { result };
  });

  // Gecachte Trivy-Vulnerability-Ergebnisse + Scan-Fortschritt für die Image-Liste.
  app.get('/api/images/vulnerabilities', { preHandler: requireAuth }, async (req) => {
    const { endpoint } = ListQuerySchema.parse(req.query);
    assertEndpoint(endpoint);
    return getVulnState(endpoint);
  });

  // Layer eines Images (docker history) für die Layer-Ansicht — Referenz als Query.
  app.get('/api/images/history', { preHandler: requireAuth }, async (req) => {
    const { endpoint, ref } = ImageRefQuery.parse(req.query);
    assertEndpoint(endpoint);
    return { layers: await docker(() => imageHistory(endpoint, ref)) };
  });

  // Detaillierte CVE-Liste eines Images (für das Detail-Modal).
  app.get('/api/images/vulnerabilities/details', { preHandler: requireAuth }, async (req) => {
    const { endpoint, imageId } = z
      .object({ endpoint: z.string().min(1).max(64), imageId: z.string().min(1).max(160) })
      .parse(req.query);
    assertEndpoint(endpoint);
    return getVulnDetails(endpoint, imageId);
  });

  // Sofortigen Neu-Scan aller Images eines Endpoints auslösen (im Hintergrund).
  app.post('/api/images/rescan', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { endpoint } = ListQuerySchema.parse(req.query);
    assertEndpoint(endpoint);
    void rescanEndpoint(endpoint);
    audit({ userId: ctx.userId, username: ctx.username, action: 'image.rescan', endpointId: endpoint, ip: req.ip });
    return { ok: true as const };
  });

  /* ── Volumes ──────────────────────────────────────────────────────────── */
  app.get('/api/volumes', { preHandler: requireAuth }, async (req) => {
    const { endpoint } = ListQuerySchema.parse(req.query);
    assertEndpoint(endpoint);
    return { volumes: await docker(() => listVolumes(endpoint)) };
  });

  app.post('/api/volumes', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { endpoint } = ListQuerySchema.parse(req.query);
    const body = CreateVolumeSchema.parse(req.body);
    assertEndpoint(endpoint);
    await docker(() => createVolume(endpoint, body.name, body.driver));
    audit({ userId: ctx.userId, username: ctx.username, action: 'volume.create', endpointId: endpoint, target: body.name, ip: req.ip });
    return { ok: true as const };
  });

  app.delete('/api/volumes/:name', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { endpoint } = ListQuerySchema.parse(req.query);
    const { name } = NameParams.parse(req.params);
    assertEndpoint(endpoint);
    await docker(() => removeVolume(endpoint, name));
    audit({ userId: ctx.userId, username: ctx.username, action: 'volume.remove', endpointId: endpoint, target: name, ip: req.ip });
    return { ok: true as const };
  });

  app.post('/api/volumes/prune', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { endpoint } = ListQuerySchema.parse(req.query);
    assertEndpoint(endpoint);
    const result = await docker(() => pruneVolumes(endpoint));
    audit({ userId: ctx.userId, username: ctx.username, action: 'volume.prune', endpointId: endpoint, detail: { count: result.deleted.length }, ip: req.ip });
    return { result };
  });

  /* ── Networks ─────────────────────────────────────────────────────────── */
  app.get('/api/networks', { preHandler: requireAuth }, async (req) => {
    const { endpoint } = ListQuerySchema.parse(req.query);
    assertEndpoint(endpoint);
    return { networks: await docker(() => listNetworks(endpoint)) };
  });

  app.post('/api/networks', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { endpoint } = ListQuerySchema.parse(req.query);
    const body = CreateNetworkSchema.parse(req.body);
    assertEndpoint(endpoint);
    await docker(() => createNetwork(endpoint, body));
    audit({ userId: ctx.userId, username: ctx.username, action: 'network.create', endpointId: endpoint, target: body.name, ip: req.ip });
    return { ok: true as const };
  });

  app.delete('/api/networks/:id', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { endpoint } = ListQuerySchema.parse(req.query);
    const { id } = IdParams.parse(req.params);
    assertEndpoint(endpoint);
    await docker(() => removeNetwork(endpoint, id));
    audit({ userId: ctx.userId, username: ctx.username, action: 'network.remove', endpointId: endpoint, target: id, ip: req.ip });
    return { ok: true as const };
  });

  app.post('/api/networks/prune', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { endpoint } = ListQuerySchema.parse(req.query);
    assertEndpoint(endpoint);
    const result = await docker(() => pruneNetworks(endpoint));
    audit({ userId: ctx.userId, username: ctx.username, action: 'network.prune', endpointId: endpoint, detail: { count: result.deleted.length }, ip: req.ip });
    return { result };
  });
}

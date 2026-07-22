import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listVolumeFiles,
  readVolumeFileBase64,
  writeVolumeFileBase64,
  deleteVolumePath,
} from '../services/volume-fs.js';
import { getEndpoint } from '../docker/endpoints.js';
import { currentUser, requireAdmin, requireAuth } from '../plugins/auth.js';
import { audit } from '../services/audit.js';
import { AppError, Errors } from '../errors.js';

function assertEndpoint(id: string): void {
  if (!getEndpoint(id)) throw Errors.notFound(`Endpoint nicht gefunden: ${id}`);
}

const VolumeName = z.string().min(1).max(255);
const RelPath = z.string().max(4096).optional();

export async function volumeBrowseRoutes(app: FastifyInstance): Promise<void> {
  // Verzeichnis auflisten.
  app.get('/api/volumes/browse', { preHandler: requireAuth }, async (req) => {
    const { endpoint, volume, path } = z
      .object({ endpoint: z.string().min(1).max(64), volume: VolumeName, path: RelPath })
      .parse(req.query);
    assertEndpoint(endpoint);
    try {
      return await listVolumeFiles(endpoint, volume, path ?? '');
    } catch (err) {
      throw Errors.badRequest(err instanceof Error ? err.message : String(err));
    }
  });

  // Datei herunterladen.
  app.get('/api/volumes/download', { preHandler: requireAuth }, async (req, reply) => {
    const { endpoint, volume, path } = z
      .object({ endpoint: z.string().min(1).max(64), volume: VolumeName, path: z.string().min(1).max(4096) })
      .parse(req.query);
    assertEndpoint(endpoint);
    let base64: string;
    try {
      base64 = await readVolumeFileBase64(endpoint, volume, path);
    } catch (err) {
      throw Errors.badRequest(err instanceof Error ? err.message : String(err));
    }
    const basename = path.split('/').filter(Boolean).pop() ?? 'download';
    reply.header('Content-Type', 'application/octet-stream');
    reply.header('Content-Disposition', `attachment; filename="${basename.replace(/"/g, '')}"`);
    return reply.send(Buffer.from(base64, 'base64'));
  });

  // Datei hochladen.
  app.post('/api/volumes/upload', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { endpoint, volume, path, contentBase64 } = z
      .object({
        endpoint: z.string().min(1).max(64),
        volume: VolumeName,
        path: z.string().min(1).max(4096),
        contentBase64: z.string().max(20 * 1024 * 1024),
      })
      .parse(req.body);
    assertEndpoint(endpoint);
    try {
      await writeVolumeFileBase64(endpoint, volume, path, contentBase64);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw Errors.badRequest(err instanceof Error ? err.message : String(err));
    }
    audit({ userId: ctx.userId, username: ctx.username, action: 'volume.upload', endpointId: endpoint, target: `${volume}:${path}`, ip: req.ip });
    return { ok: true as const };
  });

  // Datei/Ordner löschen.
  app.delete('/api/volumes/file', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { endpoint, volume, path } = z
      .object({ endpoint: z.string().min(1).max(64), volume: VolumeName, path: z.string().min(1).max(4096) })
      .parse(req.query);
    assertEndpoint(endpoint);
    try {
      await deleteVolumePath(endpoint, volume, path);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw Errors.badRequest(err instanceof Error ? err.message : String(err));
    }
    audit({ userId: ctx.userId, username: ctx.username, action: 'volume.delete', endpointId: endpoint, target: `${volume}:${path}`, ip: req.ip });
    return { ok: true as const };
  });
}

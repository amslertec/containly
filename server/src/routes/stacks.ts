import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CreateStackSchema,
  SaveContentSchema,
  StackActionSchema,
  StackDirSchema,
  StackPathSchema,
  StackIdSchema,
} from '@containly/shared';
import {
  archiveStack,
  createStack,
  deleteStack,
  deleteStackFile,
  deployStack,
  downStack,
  getStack,
  listArchivedStacks,
  listStackDir,
  listStacks,
  readComposeContent,
  unarchiveStack,
  readStackFile,
  saveStackContent,
  stackAction,
  writeStackFile,
} from '../services/stacks.js';
import { saveDeploySnapshot, getStackDiff } from '../services/stack-snapshot.js';
import { getEndpoint } from '../docker/endpoints.js';
import { currentUser, requireAdmin, requireAuth } from '../plugins/auth.js';
import { audit } from '../services/audit.js';
import { AppError, Errors } from '../errors.js';

const IdParams = z.object({ id: StackIdSchema });
const FileQuery = z.object({ file: StackPathSchema });
const DirQuery = z.object({ path: StackDirSchema });

function stackError(err: unknown): never {
  if (err instanceof AppError) throw err;
  const msg = err instanceof Error ? err.message : 'Stack-Operation fehlgeschlagen';
  throw new AppError(500, 'stack_error', msg);
}

export async function stackRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/stacks', { preHandler: requireAuth }, async () => {
    try {
      return { stacks: await listStacks() };
    } catch (err) {
      stackError(err);
    }
  });

  app.get('/api/stacks/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = IdParams.parse(req.params);
    try {
      const stack = await getStack(id);
      if (!stack) throw Errors.notFound('Stack nicht gefunden');
      return { stack };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw Errors.notFound('Stack nicht gefunden');
    }
  });

  app.post('/api/stacks', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const body = CreateStackSchema.parse(req.body);
    if (!getEndpoint(body.endpoint)) throw Errors.badRequest('Unbekannter Endpoint');
    let id: string;
    try {
      id = await createStack(body.endpoint, body.basePath, body.name, body.content);
    } catch (err) {
      throw Errors.badRequest(err instanceof Error ? err.message : 'Anlegen fehlgeschlagen');
    }
    audit({ userId: ctx.userId, username: ctx.username, action: 'stack.create', endpointId: body.endpoint, target: body.name, ip: req.ip });
    return { stack: await getStack(id) };
  });

  app.put('/api/stacks/:id', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { id } = IdParams.parse(req.params);
    const { content } = SaveContentSchema.parse(req.body);
    try {
      await saveStackContent(id, content);
    } catch (err) {
      throw Errors.badRequest(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    }
    audit({ userId: ctx.userId, username: ctx.username, action: 'stack.save', ip: req.ip });
    return { stack: await getStack(id) };
  });

  app.post('/api/stacks/:id/deploy', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { id } = IdParams.parse(req.params);
    try {
      const output = await deployStack(id);
      // Nach erfolgreichem Deploy den aktuellen Compose-Inhalt als Snapshot merken (für den Diff).
      try {
        const cur = await readComposeContent(id);
        if (cur) saveDeploySnapshot(cur.endpoint, id, cur.content);
      } catch {
        /* Snapshot ist best-effort */
      }
      audit({ userId: ctx.userId, username: ctx.username, action: 'stack.deploy', ip: req.ip });
      return { ok: true as const, output };
    } catch (err) {
      audit({ userId: ctx.userId, username: ctx.username, action: 'stack.deploy', outcome: 'error', ip: req.ip });
      stackError(err);
    }
  });

  // Diff des aktuellen Compose-Inhalts gegen den zuletzt deployten Snapshot.
  app.get('/api/stacks/:id/diff', { preHandler: requireAuth }, async (req) => {
    const { id } = IdParams.parse(req.params);
    const cur = await readComposeContent(id);
    if (!cur) return { hasPrevious: false, changed: false, lines: [] };
    return getStackDiff(cur.endpoint, id, cur.content);
  });

  app.post('/api/stacks/:id/down', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { id } = IdParams.parse(req.params);
    try {
      const output = await downStack(id);
      audit({ userId: ctx.userId, username: ctx.username, action: 'stack.down', ip: req.ip });
      return { ok: true as const, output };
    } catch (err) {
      audit({ userId: ctx.userId, username: ctx.username, action: 'stack.down', outcome: 'error', ip: req.ip });
      stackError(err);
    }
  });

  app.post('/api/stacks/:id/action', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { id } = IdParams.parse(req.params);
    const { action } = z.object({ action: StackActionSchema }).parse(req.body);
    try {
      const output = await stackAction(id, action);
      audit({ userId: ctx.userId, username: ctx.username, action: `stack.${action}`, ip: req.ip });
      return { ok: true as const, output };
    } catch (err) {
      audit({ userId: ctx.userId, username: ctx.username, action: `stack.${action}`, outcome: 'error', ip: req.ip });
      stackError(err);
    }
  });

  app.delete('/api/stacks/:id', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { id } = IdParams.parse(req.params);
    try {
      await deleteStack(id);
    } catch (err) {
      throw Errors.badRequest(err instanceof Error ? err.message : 'Löschen fehlgeschlagen');
    }
    audit({ userId: ctx.userId, username: ctx.username, action: 'stack.delete', ip: req.ip });
    return { ok: true as const };
  });

  /* ── Archiv ───────────────────────────────────────────────────────────── */
  // Archivierte Stacks (in `<stackPath>/ARCHIV/`).
  app.get('/api/stacks/archived', { preHandler: requireAuth }, async () => {
    try {
      return { stacks: await listArchivedStacks() };
    } catch (err) {
      stackError(err);
    }
  });

  // Stack ins Archiv verschieben.
  app.post('/api/stacks/:id/archive', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { id } = IdParams.parse(req.params);
    try {
      await archiveStack(id);
    } catch (err) {
      throw Errors.badRequest(err instanceof Error ? err.message : 'Archivieren fehlgeschlagen');
    }
    audit({ userId: ctx.userId, username: ctx.username, action: 'stack.archive', ip: req.ip });
    return { ok: true as const };
  });

  // Archivierten Stack zurück in den Stack-Pfad verschieben.
  app.post('/api/stacks/:id/unarchive', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { id } = IdParams.parse(req.params);
    try {
      await unarchiveStack(id);
    } catch (err) {
      throw Errors.badRequest(err instanceof Error ? err.message : 'Wiederherstellen fehlgeschlagen');
    }
    audit({ userId: ctx.userId, username: ctx.username, action: 'stack.unarchive', ip: req.ip });
    return { ok: true as const };
  });

  /* ── Dateien im Projektordner ─────────────────────────────────────────── */
  // Inhalt eines (Unter-)Ordners — path='' liefert die Projekt-Wurzel.
  app.get('/api/stacks/:id/ls', { preHandler: requireAuth }, async (req) => {
    const { id } = IdParams.parse(req.params);
    const { path } = DirQuery.parse(req.query);
    try {
      return { path, files: await listStackDir(id, path) };
    } catch (err) {
      throw Errors.notFound(err instanceof Error ? err.message : 'Ordner nicht gefunden');
    }
  });

  app.get('/api/stacks/:id/file', { preHandler: requireAuth }, async (req) => {
    const { id } = IdParams.parse(req.params);
    const { file } = FileQuery.parse(req.query);
    try {
      return { content: await readStackFile(id, file) };
    } catch (err) {
      throw Errors.notFound(err instanceof Error ? err.message : 'Datei nicht gefunden');
    }
  });

  app.put('/api/stacks/:id/file', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { id } = IdParams.parse(req.params);
    const { file } = FileQuery.parse(req.query);
    const { content } = SaveContentSchema.parse(req.body);
    try {
      await writeStackFile(id, file, content);
    } catch (err) {
      throw Errors.badRequest(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    }
    audit({ userId: ctx.userId, username: ctx.username, action: 'stack.file.save', target: file, ip: req.ip });
    return { ok: true as const };
  });

  app.delete('/api/stacks/:id/file', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { id } = IdParams.parse(req.params);
    const { file } = FileQuery.parse(req.query);
    try {
      await deleteStackFile(id, file);
    } catch (err) {
      throw Errors.badRequest(err instanceof Error ? err.message : 'Löschen fehlgeschlagen');
    }
    audit({ userId: ctx.userId, username: ctx.username, action: 'stack.file.delete', target: file, ip: req.ip });
    return { ok: true as const };
  });
}

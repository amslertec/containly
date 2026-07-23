import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { InviteCreateSchema, InviteAcceptSchema } from '@containly/shared';
import { currentUser, requireAdmin } from '../plugins/auth.js';
import {
  acceptInvite,
  createInvite,
  getValidInvite,
  InviteError,
  listPendingInvites,
  revokeInvite,
} from '../services/invites.js';
import { isSmtpConfigured, sendInviteEmail } from '../services/mailer.js';
import { issueSession } from './auth.js';
import { audit } from '../services/audit.js';
import { config } from '../config.js';
import { Errors } from '../errors.js';

/** InviteError → passender HTTP-Fehler. */
function toHttp(err: unknown): never {
  if (err instanceof InviteError) {
    if (err.code === 'not_found') throw Errors.notFound(err.message);
    throw Errors.conflict(err.message); // expired/accepted/email_taken/username_taken
  }
  throw err;
}

/** Basis-URL für den Annahme-Link: konfigurierte publicUrl, sonst aus der Anfrage ableiten. */
function baseUrl(req: { protocol: string; headers: { host?: string } }): string {
  // Host-Header inkl. Port als Fallback (req.hostname ließe den Port weg).
  return config.publicUrl || `${req.protocol}://${req.headers.host ?? 'localhost'}`;
}

export async function inviteRoutes(app: FastifyInstance): Promise<void> {
  // ── Admin: Einladung erstellen ──────────────────────────────────────────
  app.post('/api/users/invite', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { email, role, language } = InviteCreateSchema.parse(req.body);
    let created;
    try {
      created = createInvite(email, role, language, ctx.userId);
    } catch (err) {
      toHttp(err);
    }
    const url = `${baseUrl(req)}/invite/${created.token}`;
    // Mail in der beim Einladen gewählten Sprache (steuert auch die Annahme-Seite).
    let emailed = false;
    if (isSmtpConfigured()) {
      try {
        emailed = await sendInviteEmail(email, url, language);
      } catch {
        emailed = false; // Link steht trotzdem im UI zum Kopieren.
      }
    }
    audit({ userId: ctx.userId, username: ctx.username, action: 'user.invite', target: email, detail: { role, emailed }, ip: req.ip });
    return { url, emailed, expiresAt: created.expiresAt };
  });

  // ── Admin: offene Einladungen auflisten ─────────────────────────────────
  app.get('/api/users/invites', { preHandler: requireAdmin }, async () => {
    return { invites: listPendingInvites() };
  });

  // ── Admin: Einladung widerrufen ─────────────────────────────────────────
  app.delete('/api/users/invites/:id', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    revokeInvite(id);
    audit({ userId: ctx.userId, username: ctx.username, action: 'user.invite.revoke', target: String(id), ip: req.ip });
    return { ok: true as const };
  });

  // ── Public: Einladungs-Info (Vorausfüllung der Annahme-Seite) ────────────
  app.get('/api/invites/:token', async (req) => {
    const { token } = z.object({ token: z.string().min(1).max(512) }).parse(req.params);
    let invite;
    try {
      invite = getValidInvite(token);
    } catch (err) {
      toHttp(err);
    }
    return { email: invite.email, role: invite.role, language: invite.language };
  });

  // ── Public: Einladung annehmen → Benutzer anlegen + direkt einloggen ─────
  app.post('/api/invites/:token/accept', async (req, reply) => {
    const { token } = z.object({ token: z.string().min(1).max(512) }).parse(req.params);
    const { username, password } = InviteAcceptSchema.parse(req.body);
    let user;
    try {
      user = await acceptInvite(token, username, password);
    } catch (err) {
      toHttp(err);
    }
    audit({ userId: user.id, username: user.username, action: 'user.invite.accept', target: user.username, detail: { role: user.role }, ip: req.ip });
    return issueSession(reply, req, user.id);
  });
}

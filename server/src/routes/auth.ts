import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import QRCode from 'qrcode';
import {
  ChangePasswordSchema,
  LoginRequestSchema,
  LoginTwoFactorSchema,
  TwoFactorDisableSchema,
  TwoFactorEnableSchema,
  UpdateLanguageSchema,
  UpdateUserEmailSchema,
} from '@containly/shared';
import {
  disableTotp,
  enableTotp,
  getUserById,
  getUserRowById,
  getUserRowByLogin,
  getUserRowByUsername,
  getUserTotp,
  rehashPassword,
  setRecoveryHashes,
  setTotpPending,
  setUserEmail,
  setUserLanguage,
  setupComplete,
  updatePassword,
} from '../services/users.js';
import { hashPassword, needsRehash, verifyPassword } from '../services/password.js';
import {
  createSession,
  destroyOtherUserSessions,
  destroySession,
} from '../services/sessions.js';
import { getSessionSecret } from '../services/secrets.js';
import { encryptSecret, decryptSecret } from '../services/crypto.js';
import { generateRecoveryCodes, generateSecret, otpauthUrl, verifyTotp } from '../services/totp.js';
import {
  SESSION_COOKIE,
  clearSessionCookie,
  currentUser,
  requireAuth,
  setSessionCookie,
} from '../plugins/auth.js';
import { audit } from '../services/audit.js';
import { Errors } from '../errors.js';

/* ── Kurzlebiges 2FA-Ticket (stateless, HMAC-signiert) ─────────────────────── */
const TICKET_TTL_MS = 5 * 60_000;

function signTicket(userId: number): string {
  const exp = Date.now() + TICKET_TTL_MS;
  const sig = createHmac('sha256', getSessionSecret()).update(`2fa.${userId}.${exp}`).digest('base64url');
  return `${userId}.${exp}.${sig}`;
}

function verifyTicket(ticket: string): number | null {
  const parts = ticket.split('.');
  if (parts.length !== 3) return null;
  const [uid, exp, sig] = parts as [string, string, string];
  const expected = createHmac('sha256', getSessionSecret()).update(`2fa.${uid}.${exp}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Date.now() > Number(exp)) return null;
  const id = Number(uid);
  return Number.isInteger(id) ? id : null;
}

/** Prüft einen Login-Code gegen TOTP oder — falls kein Treffer — Recovery-Codes. */
async function verifySecondFactor(userId: number, code: string): Promise<boolean> {
  const totp = getUserTotp(userId);
  if (!totp || !totp.enabled || !totp.secretEnc) return false;
  const clean = code.replace(/\s/g, '');
  if (/^\d{6}$/.test(clean) && verifyTotp(decryptSecret(totp.secretEnc), clean)) return true;
  // Recovery-Code: gegen jeden verbleibenden Hash prüfen; bei Treffer verbrauchen.
  for (let i = 0; i < totp.recovery.length; i++) {
    if (await verifyPassword(totp.recovery[i]!, clean.toLowerCase())) {
      setRecoveryHashes(
        userId,
        totp.recovery.filter((_, idx) => idx !== i),
      );
      return true;
    }
  }
  return false;
}

function issueSession(reply: FastifyReply, req: FastifyRequest, userId: number) {
  const { token, csrfToken } = createSession(userId, {
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  });
  setSessionCookie(reply, token);
  return { user: getUserById(userId), csrfToken };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Login mit strengem Rate-Limit (siehe app.ts-Konfiguration via config).
  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = LoginRequestSchema.parse(req.body);
      // Anmeldung per Benutzername ODER E-Mail-Adresse.
      const row = getUserRowByLogin(body.username);

      // Konstante Kosten: auch bei unbekanntem User Hash prüfen (Timing-Angleichung).
      const dummyHash =
        '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$3g2Q1c8Yl3m7Xk9wq2Zt3Vv6Yc4Rf8Nn0Pp1Ll2Kk';
      const ok = await verifyPassword(row?.password_hash ?? dummyHash, body.password);

      if (!row || !ok) {
        audit({
          userId: row?.id ?? null,
          username: body.username,
          action: 'login',
          outcome: 'denied',
          ip: req.ip,
        });
        throw Errors.unauthorized('Benutzername oder Passwort falsch');
      }

      if (needsRehash(row.password_hash)) {
        rehashPassword(row.id, await hashPassword(body.password));
      }

      // 2FA aktiv → noch keine Session; zweiter Schritt via Ticket erforderlich.
      if (row.totp_enabled === 1) {
        return { twoFactorRequired: true as const, ticket: signTicket(row.id) };
      }

      audit({ userId: row.id, username: row.username, action: 'login', ip: req.ip });
      return issueSession(reply, req, row.id);
    },
  );

  // Zweiter Login-Schritt (2FA-Code oder Recovery-Code).
  app.post(
    '/api/auth/login/2fa',
    { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } },
    async (req, reply) => {
      const body = LoginTwoFactorSchema.parse(req.body);
      const userId = verifyTicket(body.ticket);
      if (userId === null) throw Errors.unauthorized('Sitzung abgelaufen — bitte erneut anmelden');
      const row = getUserRowById(userId);
      if (!row) throw Errors.unauthorized();

      if (!(await verifySecondFactor(userId, body.code))) {
        audit({ userId, username: row.username, action: 'login.2fa', outcome: 'denied', ip: req.ip });
        throw Errors.unauthorized('Code ungültig');
      }
      audit({ userId, username: row.username, action: 'login', ip: req.ip });
      return issueSession(reply, req, userId);
    },
  );

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) destroySession(token);
    clearSessionCookie(reply);
    return { ok: true as const };
  });

  // Auth-Zustand für Client-Bootstrapping (Setup + aktueller User + CSRF).
  app.get('/api/auth/me', async (req) => {
    if (!req.user) {
      return { setupComplete: setupComplete(), user: null, csrfToken: null };
    }
    return {
      setupComplete: true,
      user: getUserById(req.user.userId) ?? null,
      csrfToken: req.user.csrfToken,
    };
  });

  // Eigene E-Mail-Adresse setzen/entfernen (für Login + Benachrichtigungen).
  app.put('/api/auth/email', { preHandler: requireAuth }, async (req) => {
    const ctx = currentUser(req);
    const { email } = UpdateUserEmailSchema.parse(req.body);
    setUserEmail(ctx.userId, email);
    audit({ userId: ctx.userId, username: ctx.username, action: 'email.change', ip: req.ip });
    return { user: getUserById(ctx.userId) };
  });

  // Eigene Sprache persistieren (damit E-Mails in der Sprache des Nutzers kommen).
  app.put('/api/auth/language', { preHandler: requireAuth }, async (req) => {
    const ctx = currentUser(req);
    const { language } = UpdateLanguageSchema.parse(req.body);
    setUserLanguage(ctx.userId, language);
    return { user: getUserById(ctx.userId) };
  });

  app.post('/api/auth/password', { preHandler: requireAuth }, async (req) => {
    const ctx = currentUser(req);
    const body = ChangePasswordSchema.parse(req.body);
    const row = getUserRowById(ctx.userId);
    if (!row) throw Errors.unauthorized();

    const ok = await verifyPassword(row.password_hash, body.currentPassword);
    if (!ok) throw Errors.badRequest('Aktuelles Passwort ist falsch');

    await updatePassword(ctx.userId, body.newPassword);
    // Alle anderen Sitzungen invalidieren; die aktuelle bleibt bestehen.
    destroyOtherUserSessions(ctx.userId, ctx.sessionId);
    audit({ userId: ctx.userId, username: ctx.username, action: 'password.change', ip: req.ip });
    return { ok: true as const };
  });

  /* ── Zwei-Faktor-Verwaltung ─────────────────────────────────────────────── */

  // Setup starten: neues Secret erzeugen (noch nicht aktiv) + QR liefern.
  app.post('/api/auth/2fa/setup', { preHandler: requireAuth }, async (req) => {
    const ctx = currentUser(req);
    const totp = getUserTotp(ctx.userId);
    if (totp?.enabled) throw Errors.badRequest('2FA ist bereits aktiv');
    const secret = generateSecret();
    setTotpPending(ctx.userId, encryptSecret(secret));
    const url = otpauthUrl(secret, ctx.username);
    const qr = await QRCode.toDataURL(url, { margin: 1, width: 220, errorCorrectionLevel: 'M' });
    return { secret, otpauthUrl: url, qr };
  });

  // Aktivieren: Code gegen das ausstehende Secret prüfen → Recovery-Codes zurück.
  app.post('/api/auth/2fa/enable', { preHandler: requireAuth }, async (req) => {
    const ctx = currentUser(req);
    const body = TwoFactorEnableSchema.parse(req.body);
    const totp = getUserTotp(ctx.userId);
    if (totp?.enabled) throw Errors.badRequest('2FA ist bereits aktiv');
    if (!totp?.secretEnc) throw Errors.badRequest('Bitte zuerst die Einrichtung starten');
    if (!verifyTotp(decryptSecret(totp.secretEnc), body.code)) {
      throw Errors.badRequest('Code ungültig — bitte erneut versuchen');
    }
    const codes = generateRecoveryCodes(10);
    const hashes = await Promise.all(codes.map((c) => hashPassword(c)));
    enableTotp(ctx.userId, hashes);
    // Andere Sitzungen beenden — 2FA soll überall neu greifen.
    destroyOtherUserSessions(ctx.userId, ctx.sessionId);
    audit({ userId: ctx.userId, username: ctx.username, action: '2fa.enable', ip: req.ip });
    return { recoveryCodes: codes };
  });

  // Deaktivieren: Passwort + gültiger Code erforderlich.
  app.post('/api/auth/2fa/disable', { preHandler: requireAuth }, async (req) => {
    const ctx = currentUser(req);
    const body = TwoFactorDisableSchema.parse(req.body);
    const row = getUserRowById(ctx.userId);
    if (!row) throw Errors.unauthorized();
    if (row.totp_enabled !== 1) throw Errors.badRequest('2FA ist nicht aktiv');
    if (!(await verifyPassword(row.password_hash, body.password))) {
      throw Errors.badRequest('Passwort ist falsch');
    }
    if (!(await verifySecondFactor(ctx.userId, body.code))) {
      throw Errors.badRequest('Code ungültig');
    }
    disableTotp(ctx.userId);
    audit({ userId: ctx.userId, username: ctx.username, action: '2fa.disable', ip: req.ip });
    return { ok: true as const };
  });
}

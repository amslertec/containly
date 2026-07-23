import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import type { SessionContext } from '../services/sessions.js';
import { csrfMatches, validateSession } from '../services/sessions.js';
import { config } from '../config.js';
import { Errors } from '../errors.js';

export const SESSION_COOKIE = 'containly_session';
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionContext | null;
  }
}

/** Setzt das Session-Cookie mit sicheren Flags. `remember` = lange, persistente Gültigkeit. */
export function setSessionCookie(reply: FastifyReply, token: string, remember = false): void {
  const ttlMs = remember ? config.sessionRememberMs : config.sessionTtlMs;
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'strict',
    path: '/',
    maxAge: Math.floor(ttlMs / 1000),
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  await app.register(fastifyCookie);

  // Session bei jeder Anfrage auflösen (nicht erzwingen) + CSRF für Mutationen prüfen.
  app.decorateRequest('user', null);
  app.addHook('onRequest', async (req) => {
    const token = req.cookies[SESSION_COOKIE];
    req.user = token ? validateSession(token) : null;
  });

  app.addHook('preHandler', async (req) => {
    // CSRF nur relevant, wenn eine Session existiert und die Methode mutierend ist.
    if (req.user && UNSAFE.has(req.method)) {
      // WebSocket-Upgrades und Login/Logout haben eigene Behandlung; hier globaler Schutz.
      const provided = req.headers['x-csrf-token'];
      const header = Array.isArray(provided) ? provided[0] : provided;
      if (!csrfMatches(req.user.csrfToken, header)) {
        throw Errors.csrf();
      }
    }
  });
}

/** preHandler: verlangt eine gültige Session. */
export async function requireAuth(req: FastifyRequest): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
}

/** preHandler: verlangt Admin-Rolle (serverseitig durchgesetzt). */
export async function requireAdmin(req: FastifyRequest): Promise<void> {
  if (!req.user) throw Errors.unauthorized();
  if (req.user.role !== 'admin') throw Errors.forbidden('Diese Aktion erfordert Admin-Rechte');
}

/** Liefert den garantiert vorhandenen User-Kontext (nach requireAuth). */
export function currentUser(req: FastifyRequest): SessionContext {
  if (!req.user) throw Errors.unauthorized();
  return req.user;
}

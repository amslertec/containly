import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Role } from '@containly/shared';
import { db } from '../db/index.js';
import { config } from '../config.js';

export interface SessionContext {
  sessionId: string; // raw token (nur im Cookie, nie geloggt)
  userId: number;
  username: string;
  role: Role;
  csrfToken: string;
}

/** Sitzungstoken werden nur als SHA-256-Hash gespeichert (wie Passwörter „at rest"). */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const insertStmt = db.prepare(
  `INSERT INTO sessions (id, user_id, csrf_token, created_at, expires_at, last_seen, user_agent, ip)
   VALUES (@id, @userId, @csrf, @created, @expires, @lastSeen, @ua, @ip)`,
);

export function createSession(
  userId: number,
  meta: { userAgent?: string; ip?: string },
): { token: string; csrfToken: string } {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  const now = Date.now();
  insertStmt.run({
    id: hashToken(token),
    userId,
    csrf: csrfToken,
    created: now,
    expires: now + config.sessionTtlMs,
    lastSeen: now,
    ua: meta.userAgent ?? null,
    ip: meta.ip ?? null,
  });
  return { token, csrfToken };
}

interface SessionRow {
  id: string;
  user_id: number;
  csrf_token: string;
  expires_at: number;
  last_seen: number;
}

/**
 * Validiert ein Sitzungstoken, prüft absolutes + Idle-Timeout und aktualisiert last_seen.
 * Gibt bei Erfolg den Kontext inkl. Rolle zurück (Rolle live aus users-Tabelle).
 */
export function validateSession(token: string): SessionContext | null {
  if (!token) return null;
  const id = hashToken(token);
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
  if (!row) return null;

  const now = Date.now();
  if (now > row.expires_at || now - row.last_seen > config.sessionIdleMs) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return null;
  }

  const user = db.prepare('SELECT username, role FROM users WHERE id = ?').get(row.user_id) as
    | { username: string; role: Role }
    | undefined;
  if (!user) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return null;
  }

  db.prepare('UPDATE sessions SET last_seen = ? WHERE id = ?').run(now, id);
  return {
    sessionId: token,
    userId: row.user_id,
    username: user.username,
    role: user.role,
    csrfToken: row.csrf_token,
  };
}

/** Konstant-zeitlicher CSRF-Vergleich. */
export function csrfMatches(expected: string, provided: string | undefined): boolean {
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function destroySession(token: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(token));
}

export interface SessionInfo {
  id: string; // SHA-256-Hash des Tokens (opake, sichere Kennung fürs Widerrufen)
  createdAt: number;
  lastSeen: number;
  userAgent: string | null;
  ip: string | null;
  current: boolean;
}

/** Aktive Sitzungen eines Benutzers (aktuelle markiert), neueste zuerst. */
export function listUserSessions(userId: number, currentToken: string): SessionInfo[] {
  const currentId = hashToken(currentToken);
  const rows = db
    .prepare(
      'SELECT id, created_at, last_seen, user_agent, ip FROM sessions WHERE user_id = ? ORDER BY last_seen DESC',
    )
    .all(userId) as {
    id: string;
    created_at: number;
    last_seen: number;
    user_agent: string | null;
    ip: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    lastSeen: r.last_seen,
    userAgent: r.user_agent,
    ip: r.ip,
    current: r.id === currentId,
  }));
}

/** Widerruft eine Sitzung des Benutzers per (Hash-)ID. Liefert true, wenn entfernt. */
export function revokeUserSession(userId: number, id: string): boolean {
  return db.prepare('DELETE FROM sessions WHERE user_id = ? AND id = ?').run(userId, id).changes > 0;
}

export function destroyAllUserSessions(userId: number): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

/** Invalidiert alle Sitzungen eines Users außer der aktuellen (nach Passwortwechsel). */
export function destroyOtherUserSessions(userId: number, keepToken: string): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(userId, hashToken(keepToken));
}

/** Aufräumen abgelaufener Sessions (periodisch aufgerufen). */
export function pruneSessions(): number {
  const now = Date.now();
  const info = db
    .prepare('DELETE FROM sessions WHERE expires_at < ? OR last_seen < ?')
    .run(now, now - config.sessionIdleMs);
  return info.changes;
}

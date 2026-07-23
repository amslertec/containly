import { createHash, randomBytes } from 'node:crypto';
import type { Locale, PendingInvite, Role } from '@containly/shared';
import { db } from '../db/index.js';
import { createUser, emailInUse, getUserRowByUsername } from './users.js';
import type { User } from '@containly/shared';

/**
 * Einladungen: ein Admin erstellt einen Token (E-Mail + Rolle), der Eingeladene setzt
 * beim Annehmen Username + Passwort. Nur der SHA-256-Hash des Tokens liegt in der DB
 * (wie Session-Tokens); der Roh-Token existiert nur im Link/der Mail. Einmalig + Ablauf.
 */

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 Tage

/** Fehler mit maschinenlesbarem Code für die Route (→ passender HTTP-Status/Meldung). */
export class InviteError extends Error {
  constructor(
    public code: 'not_found' | 'expired' | 'accepted' | 'email_taken' | 'username_taken',
    message: string,
  ) {
    super(message);
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

interface InviteRow {
  id: number;
  token_hash: string;
  email: string;
  role: Role;
  language: Locale;
  created_at: string;
  expires_at: number;
  accepted_at: number | null;
}

/** Erstellt eine Einladung und liefert den Roh-Token (nur hier verfügbar) + Ablauf. */
export function createInvite(
  email: string,
  role: Role,
  language: Locale,
  createdBy: number | null,
): { token: string; expiresAt: number } {
  if (emailInUse(email)) {
    throw new InviteError('email_taken', 'Für diese E-Mail existiert bereits ein Benutzer');
  }
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + INVITE_TTL_MS;
  db.prepare(
    'INSERT INTO user_invites (token_hash, email, role, language, created_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(hashToken(token), email.trim(), role, language, createdBy, expiresAt);
  return { token, expiresAt };
}

/** Lädt eine gültige (offene, nicht abgelaufene) Einladung per Roh-Token. */
export function getValidInvite(token: string): InviteRow {
  const row = db
    .prepare('SELECT * FROM user_invites WHERE token_hash = ?')
    .get(hashToken(token)) as InviteRow | undefined;
  if (!row) throw new InviteError('not_found', 'Einladung nicht gefunden');
  if (row.accepted_at) throw new InviteError('accepted', 'Diese Einladung wurde bereits eingelöst');
  if (row.expires_at < Date.now()) throw new InviteError('expired', 'Diese Einladung ist abgelaufen');
  return row;
}

/**
 * Nimmt eine Einladung an: legt den Benutzer an (E-Mail/Rolle aus der Einladung,
 * Username/Passwort vom Eingeladenen) und markiert die Einladung als eingelöst.
 */
export async function acceptInvite(
  token: string,
  username: string,
  password: string,
): Promise<User> {
  const invite = getValidInvite(token);
  if (getUserRowByUsername(username)) {
    throw new InviteError('username_taken', 'Benutzername bereits vergeben');
  }
  // Race-Schutz: E-Mail könnte zwischen Erstellung und Annahme belegt worden sein.
  if (emailInUse(invite.email)) {
    throw new InviteError('email_taken', 'Für diese E-Mail existiert bereits ein Benutzer');
  }
  const user = await createUser(username, password, invite.role, invite.email);
  db.prepare('UPDATE user_invites SET accepted_at = ? WHERE id = ?').run(Date.now(), invite.id);
  return user;
}

/** Offene (nicht eingelöste, nicht abgelaufene) Einladungen für die Admin-Übersicht. */
export function listPendingInvites(): PendingInvite[] {
  const rows = db
    .prepare(
      'SELECT id, email, role, created_at, expires_at FROM user_invites WHERE accepted_at IS NULL AND expires_at >= ? ORDER BY id DESC',
    )
    .all(Date.now()) as Omit<InviteRow, 'token_hash' | 'accepted_at'>[];
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  }));
}

/** Widerruft eine offene Einladung. */
export function revokeInvite(id: number): void {
  db.prepare('DELETE FROM user_invites WHERE id = ?').run(id);
}

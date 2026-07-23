import type { Locale, Role, User } from '@containly/shared';
import { db } from '../db/index.js';
import { hashPassword } from './password.js';

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: Role;
  created_at: string;
  totp_secret_enc: string | null;
  totp_enabled: number;
  totp_recovery: string | null;
  email: string | null;
  language: string | null;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: row.created_at,
    totpEnabled: row.totp_enabled === 1,
    email: row.email ?? null,
    language: row.language === 'de' || row.language === 'en' ? row.language : null,
  };
}

/** Setzt die bevorzugte Sprache eines Benutzers (für E-Mails). */
export function setUserLanguage(id: number, language: Locale): void {
  db.prepare('UPDATE users SET language = ? WHERE id = ?').run(language, id);
}

/** Setzt/entfernt die E-Mail-Adresse eines Benutzers (leer = entfernen). */
export function setUserEmail(id: number, email: string): void {
  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email.trim() || null, id);
}

/** Alle Benutzer mit einer E-Mail-Adresse (für die Empfänger-Auflösung, inkl. Sprache). */
export function usersWithEmail(): { id: number; email: string; role: Role; language: Locale }[] {
  return (
    db
      .prepare("SELECT id, email, role, language FROM users WHERE email IS NOT NULL AND email != ''")
      .all() as { id: number; email: string; role: Role; language: string | null }[]
  ).map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    language: r.language === 'de' ? 'de' : 'en', // Fallback: en
  }));
}

export function userCount(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
}

export function setupComplete(): boolean {
  return userCount() > 0;
}

export function getUserRowByUsername(username: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
}

/** Login-Lookup: Benutzername ODER E-Mail (case-insensitive für die E-Mail). */
export function getUserRowByLogin(login: string): UserRow | undefined {
  return db
    .prepare('SELECT * FROM users WHERE username = ? OR lower(email) = lower(?) LIMIT 1')
    .get(login, login) as UserRow | undefined;
}

/** Prüft, ob bereits ein Benutzer diese E-Mail nutzt (case-insensitive). */
export function emailInUse(email: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM users WHERE lower(email) = lower(?) AND email IS NOT NULL AND email != '' LIMIT 1")
    .get(email.trim());
  return !!row;
}

export function getUserRowById(id: number): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function getUserById(id: number): User | undefined {
  const row = getUserRowById(id);
  return row ? toUser(row) : undefined;
}

export function listUsers(): User[] {
  return (db.prepare('SELECT * FROM users ORDER BY id').all() as UserRow[]).map(toUser);
}

export async function createUser(
  username: string,
  password: string,
  role: Role,
  email?: string,
): Promise<User> {
  const hash = await hashPassword(password);
  const info = db
    .prepare('INSERT INTO users (username, password_hash, role, email) VALUES (?, ?, ?, ?)')
    .run(username, hash, role, email?.trim() || null);
  const row = getUserRowById(Number(info.lastInsertRowid));
  if (!row) throw new Error('User konnte nicht erstellt werden');
  return toUser(row);
}

export async function updatePassword(id: number, password: string): Promise<void> {
  const hash = await hashPassword(password);
  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(
    hash,
    id,
  );
}

export function rehashPassword(id: number, hash: string): void {
  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(
    hash,
    id,
  );
}

export function deleteUser(id: number): void {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

export function adminCount(): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get() as { n: number })
    .n;
}

/* ── Zwei-Faktor (TOTP) ────────────────────────────────────────────────────── */
export interface TotpState {
  enabled: boolean;
  secretEnc: string | null;
  recovery: string[];
}

export function getUserTotp(id: number): TotpState | undefined {
  const row = getUserRowById(id);
  if (!row) return undefined;
  return {
    enabled: row.totp_enabled === 1,
    secretEnc: row.totp_secret_enc,
    recovery: row.totp_recovery ? (JSON.parse(row.totp_recovery) as string[]) : [],
  };
}

/** Speichert ein noch nicht aktiviertes Secret (Einrichtung, vor der Verifizierung). */
export function setTotpPending(id: number, secretEnc: string): void {
  db.prepare(
    "UPDATE users SET totp_secret_enc = ?, totp_enabled = 0, totp_recovery = NULL, updated_at = datetime('now') WHERE id = ?",
  ).run(secretEnc, id);
}

/** Aktiviert 2FA nach erfolgreicher Code-Verifizierung + speichert Recovery-Hashes. */
export function enableTotp(id: number, recoveryHashes: string[]): void {
  db.prepare(
    "UPDATE users SET totp_enabled = 1, totp_recovery = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(JSON.stringify(recoveryHashes), id);
}

export function disableTotp(id: number): void {
  db.prepare(
    "UPDATE users SET totp_secret_enc = NULL, totp_enabled = 0, totp_recovery = NULL, updated_at = datetime('now') WHERE id = ?",
  ).run(id);
}

/** Ersetzt die verbleibenden Recovery-Hashes (z. B. nach Verbrauch eines Codes). */
export function setRecoveryHashes(id: number, hashes: string[]): void {
  db.prepare("UPDATE users SET totp_recovery = ? WHERE id = ?").run(JSON.stringify(hashes), id);
}

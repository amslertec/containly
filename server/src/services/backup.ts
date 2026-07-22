import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { RestoreResult } from '@containly/shared';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const APP = 'containly';
const ENVELOPE_V = 1;
// Datentabellen im Backup (Reihenfolge = Einfüge-Reihenfolge; Sessions bleiben aussen
// vor; image_vulns ist ein regenerierbarer Scan-Cache und wird bewusst nicht gesichert).
const TABLES = [
  'users',
  'endpoints',
  'registry_credentials',
  'audit_log',
  'smtp_config',
  'notification_settings',
  'scheduled_jobs',
  'catalog_sources',
  'git_stacks',
] as const;
const SCRYPT = { N: 2 ** 15, r: 8, p: 1 };

function schemaVersion(): number {
  const r = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null };
  return r.v ?? 0;
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32, { ...SCRYPT, maxmem: 256 * 1024 * 1024 });
}

/** Erstellt ein passphrasenverschlüsseltes Backup (AES-256-GCM, Schlüssel via scrypt). */
export function createBackup(passphrase: string): { filename: string; data: string } {
  const payload = {
    app: APP,
    schemaVersion: schemaVersion(),
    createdAt: new Date().toISOString(),
    tables: Object.fromEntries(TABLES.map((t) => [t, db.prepare(`SELECT * FROM ${t}`).all()])),
    secrets: {
      masterKey: readFileSync(config.masterKeyPath).toString('base64'),
      sessionSecret: existsSync(config.secretPath)
        ? readFileSync(config.secretPath).toString('base64')
        : null,
    },
  };

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const envelope = {
    app: APP,
    v: ENVELOPE_V,
    kdf: 'scrypt',
    ...SCRYPT,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: ct.toString('base64'),
  };
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return { filename: `containly-backup-${stamp}.json`, data: JSON.stringify(envelope) };
}

/** Stellt ein Backup wieder her — ERSETZT Users/Endpoints/Audit-Log + Schlüssel. */
export function restoreBackup(fileText: string, passphrase: string): RestoreResult {
  let env: Record<string, unknown>;
  try {
    env = JSON.parse(fileText) as Record<string, unknown>;
  } catch {
    throw new Error('Ungültige Backup-Datei');
  }
  if (env.app !== APP || env.v !== ENVELOPE_V) throw new Error('Kein gültiges Containly-Backup');

  const key = deriveKey(passphrase, Buffer.from(String(env.salt), 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(String(env.iv), 'base64'));
  decipher.setAuthTag(Buffer.from(String(env.tag), 'base64'));
  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(Buffer.from(String(env.ct), 'base64')), decipher.final()]);
  } catch {
    throw new Error('Falsches Passwort oder beschädigte Datei');
  }

  const payload = JSON.parse(plaintext.toString('utf8')) as {
    app: string;
    schemaVersion: number;
    tables: Record<string, Record<string, unknown>[]>;
    secrets: { masterKey: string; sessionSecret: string | null };
  };
  if (payload.app !== APP) throw new Error('Kein gültiges Containly-Backup');
  if (payload.schemaVersion !== schemaVersion()) {
    throw new Error(
      `Schema-Version ${payload.schemaVersion} passt nicht zu dieser Instanz (${schemaVersion()}). Bitte dieselbe Containly-Version verwenden.`,
    );
  }
  if (!payload.secrets?.masterKey) throw new Error('Backup enthält keinen Master-Key');

  const apply = db.transaction(() => {
    db.prepare('DELETE FROM sessions').run();
    // Nur Tabellen leeren, die im Backup enthalten sind (ältere Backups ohne eine neue
    // Tabelle lassen deren aktuelle Daten unangetastet). Reverse-Reihenfolge wegen FKs.
    for (const table of [...TABLES].reverse()) {
      if (!(table in payload.tables)) continue;
      db.prepare(`DELETE FROM ${table}`).run();
    }
    for (const table of TABLES) {
      for (const row of payload.tables[table] ?? []) {
        const cols = Object.keys(row);
        if (cols.length === 0) continue;
        const sql = `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols
          .map((c) => `@${c}`)
          .join(', ')})`;
        db.prepare(sql).run(row);
      }
    }
  });
  apply();

  // Schlüssel überschreiben — werden bei jedem Zugriff frisch von der Platte gelesen
  // (kein In-Memory-Cache), daher greift der neue Master-Key sofort ohne Neustart.
  writeFileSync(config.masterKeyPath, Buffer.from(payload.secrets.masterKey, 'base64'), { mode: 0o600 });
  try {
    chmodSync(config.masterKeyPath, 0o600);
  } catch {
    /* best effort */
  }
  if (payload.secrets.sessionSecret) {
    writeFileSync(config.secretPath, Buffer.from(payload.secrets.sessionSecret, 'base64'), { mode: 0o600 });
    try {
      chmodSync(config.secretPath, 0o600);
    } catch {
      /* best effort */
    }
  }

  const result: RestoreResult = {
    users: payload.tables.users?.length ?? 0,
    endpoints: payload.tables.endpoints?.length ?? 0,
    auditLog: payload.tables.audit_log?.length ?? 0,
  };
  logger.warn(result, 'Backup wiederhergestellt — Zieldaten wurden ersetzt');
  return result;
}

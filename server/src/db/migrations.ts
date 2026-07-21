import type { Database } from 'better-sqlite3';
import { logger } from '../logger.js';

/**
 * Schlanker, vorwärtsgerichteter Migrations-Runner. Jede Migration ist idempotent
 * über die `schema_migrations`-Tabelle abgesichert. Neue Versionen einfach anhängen.
 */
interface Migration {
  version: number;
  name: string;
  up: string;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial',
    up: `
      CREATE TABLE users (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        username   TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role       TEXT NOT NULL CHECK (role IN ('admin','viewer')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE sessions (
        id          TEXT PRIMARY KEY,          -- opaker Random-Token (gehasht gespeichert)
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        csrf_token  TEXT NOT NULL,
        created_at  INTEGER NOT NULL,          -- epoch ms
        expires_at  INTEGER NOT NULL,          -- epoch ms (absolut)
        last_seen   INTEGER NOT NULL,          -- epoch ms (Idle-Timeout)
        user_agent  TEXT,
        ip          TEXT
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);
      CREATE INDEX idx_sessions_expires ON sessions(expires_at);

      CREATE TABLE endpoints (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        type          TEXT NOT NULL CHECK (type IN ('socket','tcp','ssh')),
        host          TEXT,
        port          INTEGER,
        -- verschlüsseltes JSON mit TLS/SSH-Material (AES-256-GCM), NULL für socket
        secret_enc    TEXT,
        builtin       INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE audit_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        ts          TEXT NOT NULL DEFAULT (datetime('now')),
        user_id     INTEGER,
        username    TEXT,
        action      TEXT NOT NULL,             -- z.B. container.stop, exec, stack.deploy
        endpoint_id TEXT,
        target      TEXT,                      -- Container/Image/Stack-Name o. ID
        detail      TEXT,                      -- JSON mit Zusatzinfos
        ip          TEXT,
        outcome     TEXT NOT NULL DEFAULT 'ok' CHECK (outcome IN ('ok','error','denied'))
      );
      CREATE INDEX idx_audit_ts ON audit_log(ts);
      CREATE INDEX idx_audit_action ON audit_log(action);
    `,
  },
  {
    version: 2,
    name: 'endpoint_ssh_columns',
    up: `
      -- Nicht-geheime SSH-Metadaten als eigene Spalten (Anzeige/Edit ohne Entschlüsselung).
      ALTER TABLE endpoints ADD COLUMN ssh_user TEXT;
      ALTER TABLE endpoints ADD COLUMN ssh_auth TEXT;  -- 'password' | 'key'
    `,
  },
  {
    version: 3,
    name: 'endpoint_stack_paths',
    up: `
      -- Pro Endpoint: Verzeichnisse (JSON-Array), in denen Compose-Projekte liegen.
      -- Müssen für den Containly-Container erreichbar sein (gemountet).
      ALTER TABLE endpoints ADD COLUMN stack_paths TEXT;  -- JSON: string[]
    `,
  },
  {
    version: 4,
    name: 'user_totp_2fa',
    up: `
      -- Zwei-Faktor (TOTP, RFC 6238). Secret AES-256-GCM-verschlüsselt at rest.
      ALTER TABLE users ADD COLUMN totp_secret_enc TEXT;               -- verschlüsseltes Base32-Secret (pending oder aktiv)
      ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN totp_recovery TEXT;                 -- JSON: Array argon2-gehashter Recovery-Codes
    `,
  },
  {
    version: 5,
    name: 'registry_credentials',
    up: `
      -- Globale Registry-Anmeldedaten (für authentifizierte Pulls + Update-Checks).
      CREATE TABLE registry_credentials (
        registry   TEXT PRIMARY KEY,           -- z. B. 'docker.io' oder 'ghcr.io'
        username   TEXT NOT NULL,
        secret_enc TEXT NOT NULL,              -- AES-256-GCM (Passwort/Token)
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
];

export function runMigrations(db: Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name    TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`);

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((r) => (r as { version: number }).version),
  );

  const pending = migrations.filter((m) => !applied.has(m.version)).sort((a, b) => a.version - b.version);
  if (pending.length === 0) return;

  const insert = db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)');
  const tx = db.transaction(() => {
    for (const m of pending) {
      db.exec(m.up);
      insert.run(m.version, m.name);
      logger.info({ version: m.version, name: m.name }, 'Migration angewendet');
    }
  });
  tx();
}

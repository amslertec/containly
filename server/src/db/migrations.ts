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
  {
    version: 6,
    name: 'image_vulns',
    up: `
      -- Gecachte Trivy-Scan-Ergebnisse je Image und Endpoint (Hintergrund-Scanner).
      CREATE TABLE image_vulns (
        endpoint   TEXT NOT NULL,
        image_id   TEXT NOT NULL,              -- volle Image-ID (sha256:…)
        critical   INTEGER NOT NULL DEFAULT 0,
        high       INTEGER NOT NULL DEFAULT 0,
        medium     INTEGER NOT NULL DEFAULT 0,
        low        INTEGER NOT NULL DEFAULT 0,
        status     TEXT NOT NULL DEFAULT 'ok', -- 'ok' | 'error'
        scanned_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (endpoint, image_id)
      );
    `,
  },
  {
    version: 7,
    name: 'image_vulns_details',
    up: `
      -- Detaillierte CVE-Liste je Image (JSON-Array) für das Detail-Modal.
      ALTER TABLE image_vulns ADD COLUMN details TEXT NOT NULL DEFAULT '[]';
    `,
  },
  {
    version: 8,
    name: 'notifications',
    up: `
      -- E-Mail-Adresse je Benutzer (für Benachrichtigungen; optional).
      ALTER TABLE users ADD COLUMN email TEXT;

      -- Globale SMTP-Konfiguration (einzeilig, id=1).
      CREATE TABLE smtp_config (
        id           INTEGER PRIMARY KEY CHECK (id = 1),
        host         TEXT NOT NULL DEFAULT '',
        port         INTEGER NOT NULL DEFAULT 587,
        secure       INTEGER NOT NULL DEFAULT 0,   -- 1 = TLS (Port 465)
        username     TEXT NOT NULL DEFAULT '',
        password_enc TEXT NOT NULL DEFAULT '',     -- AES-256-GCM
        from_addr    TEXT NOT NULL DEFAULT '',
        from_name    TEXT NOT NULL DEFAULT 'Containly',
        enabled      INTEGER NOT NULL DEFAULT 0,
        updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Konfiguration je Benachrichtigungstyp: aktiv, Schwellwert, Empfänger.
      CREATE TABLE notification_settings (
        type       TEXT PRIMARY KEY,              -- z. B. 'endpoint.offline'
        enabled    INTEGER NOT NULL DEFAULT 1,
        threshold  REAL,                          -- nur bei Schwellwert-Typen
        all_admins INTEGER NOT NULL DEFAULT 1,    -- an alle Admins mit E-Mail
        recipients TEXT NOT NULL DEFAULT '[]'     -- zusätzliche User-IDs (JSON)
      );
    `,
  },
  {
    version: 9,
    name: 'user_language',
    up: `
      -- Bevorzugte Sprache je Benutzer (für E-Mails); NULL = Fallback (en).
      ALTER TABLE users ADD COLUMN language TEXT;
    `,
  },
  {
    version: 10,
    name: 'scheduled_jobs',
    up: `
      -- Geplante Wartungs-Jobs (ein Eintrag je Typ).
      CREATE TABLE scheduled_jobs (
        type           TEXT PRIMARY KEY,          -- z. B. 'image.prune'
        enabled        INTEGER NOT NULL DEFAULT 0,
        frequency      TEXT NOT NULL DEFAULT 'daily',  -- 'daily' | 'weekly'
        hour           INTEGER NOT NULL DEFAULT 3,
        minute         INTEGER NOT NULL DEFAULT 0,
        weekday        INTEGER NOT NULL DEFAULT 0,     -- 0 = Sonntag (nur weekly)
        passphrase_enc TEXT NOT NULL DEFAULT '',       -- nur Backup (AES-256-GCM)
        last_run       TEXT,
        last_status    TEXT,                           -- 'ok' | 'error'
        last_detail    TEXT
      );
    `,
  },
  {
    version: 11,
    name: 'catalog_and_gitops',
    up: `
      -- App-Katalog: Template-Quellen (mehrere URLs im Portainer-JSON-Format).
      CREATE TABLE catalog_sources (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        url        TEXT NOT NULL,
        enabled    INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- GitOps: aus einem Git-Repo verwaltete Stacks.
      CREATE TABLE git_stacks (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint    TEXT NOT NULL,
        name        TEXT NOT NULL,          -- Stack-/Verzeichnisname im Stack-Pfad
        base_path   TEXT NOT NULL,          -- Ziel-Stack-Pfad (aus endpoint.stackPaths)
        repo_url    TEXT NOT NULL,
        branch      TEXT NOT NULL DEFAULT 'main',
        auto_sync   INTEGER NOT NULL DEFAULT 0,
        last_sync   TEXT,
        last_commit TEXT,
        last_status TEXT,                   -- 'ok' | 'error'
        last_detail TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 12,
    name: 'favorites',
    up: `
      -- Angepinnte Container je Benutzer (nach Endpoint + Name, übersteht Recreate).
      CREATE TABLE favorites (
        user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL,
        name     TEXT NOT NULL,
        PRIMARY KEY (user_id, endpoint, name)
      );
    `,
  },
  {
    version: 13,
    name: 'inapp_notifications',
    up: `
      -- In-App-Benachrichtigungs-Feed (globale Ereignisse; Lese-Status pro Benutzer).
      CREATE TABLE notifications_feed (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        type       TEXT NOT NULL,          -- Benachrichtigungstyp (z. B. 'endpoint.offline')
        severity   TEXT NOT NULL,          -- 'info' | 'warning' | 'critical'
        target     TEXT NOT NULL DEFAULT '', -- betroffener Name (Container/Endpoint/Image)
        detail     TEXT NOT NULL DEFAULT '',
        link       TEXT NOT NULL DEFAULT '', -- interne Ziel-Route (z. B. '/containers')
        created_at INTEGER NOT NULL          -- epoch ms
      );
      CREATE INDEX idx_feed_created ON notifications_feed(created_at);
      -- Lese-Status je Benutzer (Zeitpunkt, bis zu dem alles gelesen ist).
      CREATE TABLE notification_reads (
        user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        last_read_at INTEGER NOT NULL DEFAULT 0
      );
    `,
  },
  {
    version: 14,
    name: 'metrics_and_stack_snapshots',
    up: `
      -- Ressourcen-Zeitreihe (CPU/RAM je Container, periodisch gesampelt).
      CREATE TABLE metrics (
        endpoint     TEXT NOT NULL,
        container_id TEXT NOT NULL,
        ts           INTEGER NOT NULL,  -- epoch ms
        cpu          REAL NOT NULL,     -- Prozent
        mem          REAL NOT NULL,     -- Prozent des Limits
        mem_bytes    INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_metrics_lookup ON metrics(endpoint, container_id, ts);

      -- Snapshot des zuletzt deployten Compose-Inhalts je Stack (für den Diff).
      CREATE TABLE stack_deploys (
        endpoint   TEXT NOT NULL,
        stack_id   TEXT NOT NULL,
        content    TEXT NOT NULL,       -- zusammengeführter Compose-Inhalt beim Deploy
        deployed_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (endpoint, stack_id)
      );
    `,
  },
  {
    version: 15,
    name: 'metrics_by_container_name',
    up: `
      -- Metriken zusätzlich am stabilen Container-NAMEN indexieren: die Container-ID
      -- ändert sich bei jedem Recreate, der Name bleibt → sonst geht der Verlauf verloren.
      ALTER TABLE metrics ADD COLUMN container_name TEXT NOT NULL DEFAULT '';
      CREATE INDEX idx_metrics_name ON metrics(endpoint, container_name, ts);
    `,
  },
  {
    version: 16,
    name: 'user_invites',
    up: `
      -- Einladungen: Admin erstellt Token (E-Mail + Rolle), der Eingeladene setzt beim
      -- Annehmen Username + Passwort. Nur der SHA-256-Hash des Tokens wird gespeichert.
      CREATE TABLE user_invites (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        token_hash  TEXT NOT NULL UNIQUE,
        email       TEXT NOT NULL,
        role        TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
        language    TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('de', 'en')),
        created_by  INTEGER,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at  INTEGER NOT NULL,      -- epoch ms
        accepted_at INTEGER                -- epoch ms, NULL = offen
      );
    `,
  },
  {
    version: 17,
    name: 'notified_updates',
    up: `
      -- Gemeldete Image-Updates PERSISTENT (überlebt Neustarts): je Endpoint+Image der
      -- zuletzt gemeldete Registry-Digest. Verhindert erneutes Melden nach Restart und
      -- meldet erst wieder, wenn ein NEUERER Digest verfügbar ist.
      CREATE TABLE notified_updates (
        endpoint    TEXT NOT NULL,
        image       TEXT NOT NULL,
        digest      TEXT NOT NULL,
        notified_at INTEGER NOT NULL,
        PRIMARY KEY (endpoint, image)
      );
    `,
  },
  {
    version: 18,
    name: 'session_remember',
    up: `
      -- „Eingeloggt bleiben": Sessions mit remember=1 haben eine lange Lebensdauer und
      -- sind vom Idle-Timeout ausgenommen (kein automatisches Ausloggen bei Inaktivität).
      ALTER TABLE sessions ADD COLUMN remember INTEGER NOT NULL DEFAULT 0;
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

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { runMigrations } from './migrations.js';

mkdirSync(dirname(config.dbPath), { recursive: true });

export const db: Database.Database = new Database(config.dbPath);

// Betriebssicherheit & Performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');

runMigrations(db);
logger.info({ path: config.dbPath }, 'SQLite bereit');

export function closeDb(): void {
  try {
    db.close();
  } catch {
    /* bereits geschlossen */
  }
}

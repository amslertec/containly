import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { config } from '../config.js';
import { logger } from '../logger.js';

/** Erzeugt oder liest ein 32-Byte-Geheimnis aus einer Datei mit 0600-Rechten. */
function loadOrCreate(path: string, label: string): Buffer {
  if (existsSync(path)) {
    const raw = readFileSync(path);
    if (raw.length >= 32) return raw.subarray(0, 32);
    logger.warn({ path }, `${label} zu kurz — wird neu erzeugt`);
  }
  const buf = randomBytes(32);
  writeFileSync(path, buf, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    /* best effort auf Nicht-POSIX */
  }
  logger.info({ path }, `${label} generiert`);
  return buf;
}

/**
 * Session-Signatur-Secret. Priorität:
 * 1. CONTAINLY_SESSION_SECRET aus der Umgebung (extern verwaltet)
 * 2. persistente Datei in data/ (zur Laufzeit generiert)
 */
export function getSessionSecret(): string {
  if (config.sessionSecretEnv && config.sessionSecretEnv.length >= 32) {
    return config.sessionSecretEnv;
  }
  if (config.sessionSecretEnv && config.sessionSecretEnv.length > 0) {
    logger.warn('CONTAINLY_SESSION_SECRET < 32 Zeichen — ignoriert, nutze Datei-Secret');
  }
  return loadOrCreate(config.secretPath, 'Session-Secret').toString('base64');
}

/** Master-Key (32 Byte) für AES-256-GCM-Verschlüsselung von Endpoint-Zertifikaten. */
export function getMasterKey(): Buffer {
  return loadOrCreate(config.masterKeyPath, 'Master-Key');
}

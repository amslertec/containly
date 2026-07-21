import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { setupComplete } from './users.js';

let cachedToken: string | null = null;

/**
 * Stellt sicher, dass im Setup-Modus ein einmaliger Setup-Token existiert, und
 * gibt ihn prominent in den Server-Logs aus. Ohne diesen Token kann kein Admin
 * angelegt werden — das schließt die Race-Lücke direkt nach dem Deployment.
 */
export function ensureSetupToken(): void {
  if (setupComplete()) return;

  if (existsSync(config.masterKeyPath) && existsSync(setupTokenPath())) {
    cachedToken = readFileSync(setupTokenPath(), 'utf8').trim();
  } else {
    cachedToken = randomBytes(24).toString('base64url');
    writeFileSync(setupTokenPath(), cachedToken, { mode: 0o600 });
  }

  logger.warn(
    '\n' +
      '  ┌─────────────────────────────────────────────────────────────┐\n' +
      '  │  CONTAINLY SETUP-MODUS                                           │\n' +
      '  │  Es existiert noch kein Admin. Öffne die Weboberfläche und   │\n' +
      '  │  lege den ersten Admin an. Setup-Token:                      │\n' +
      `  │                                                             │\n` +
      `  │    ${cachedToken.padEnd(57)}│\n` +
      '  │                                                             │\n' +
      '  │  (auch in data/setup.token). Wird nach Abschluss gelöscht.  │\n' +
      '  └─────────────────────────────────────────────────────────────┘',
  );
}

function setupTokenPath(): string {
  return config.dbPath.replace(/containly\.sqlite$/, 'setup.token');
}

export function verifySetupToken(provided: string): boolean {
  if (!cachedToken) return false;
  const a = Buffer.from(cachedToken);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Nach erfolgreichem Setup: Token invalidieren und Datei entfernen. */
export function consumeSetupToken(): void {
  cachedToken = null;
  try {
    rmSync(setupTokenPath(), { force: true });
  } catch {
    /* best effort */
  }
}

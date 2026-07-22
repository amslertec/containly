import { resolve } from 'node:path';

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1' || value === 'yes';
}

function int(value: string | undefined, fallback: number): number {
  const n = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Resolves a data/stacks directory. In the production image the data MUST live on
 * the mounted volume (an absolute path). A RELATIVE override (e.g. `./data` left
 * over in a copied .env) would silently write to the ephemeral container fs and be
 * lost on every recreate — so in production a relative value is ignored in favour
 * of the mounted default. Custom ABSOLUTE paths are always honoured. In dev the
 * relative default is fine.
 */
function resolveDir(envValue: string | undefined, prodMount: string, devDefault: string): string {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    if (envValue && envValue.startsWith('/')) return envValue;
    if (envValue && !envValue.startsWith('/')) {
      // eslint-disable-next-line no-console
      console.warn(
        `[containly] Ignoring relative ${envValue === '' ? '' : `"${envValue}" `}data dir in production — using the mounted "${prodMount}" (a relative path would not persist).`,
      );
    }
    return prodMount;
  }
  return resolve(envValue ?? devDefault);
}

const dataDir = resolveDir(process.env.CONTAINLY_DATA_DIR, '/data', './data');
const stacksDir = resolveDir(process.env.CONTAINLY_STACKS_DIR, '/stacks', './stacks');

export const config = {
  port: int(process.env.PORT, 8420),
  host: process.env.HOST ?? '0.0.0.0',
  dataDir,
  stacksDir,
  dbPath: resolve(dataDir, 'containly.sqlite'),
  secretPath: resolve(dataDir, 'session.secret'),
  masterKeyPath: resolve(dataDir, 'master.key'),
  sessionSecretEnv: process.env.CONTAINLY_SESSION_SECRET ?? '',
  // Default false: works over plain HTTP out of the box (fresh installs). Set to
  // true ONLY behind a TLS-terminating reverse proxy — over HTTP, true triggers
  // CSP upgrade-insecure-requests and the page renders BLANK.
  secureCookies: bool(process.env.CONTAINLY_SECURE_COOKIES, false),
  trustProxy: bool(process.env.CONTAINLY_TRUST_PROXY, true),
  dockerSocket: process.env.DOCKER_SOCKET ?? '/var/run/docker.sock',
  // Öffentliche Basis-URL (z. B. https://containly.example.com) für Links in
  // Benachrichtigungs-E-Mails. Ohne Wert werden keine Buttons/Links eingefügt.
  publicUrl: (process.env.CONTAINLY_PUBLIC_URL ?? '').replace(/\/+$/, ''),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  isProd: process.env.NODE_ENV === 'production',
  /** Statisches Frontend (im Container-Build vorhanden), sonst deaktiviert. */
  webRoot: resolve(process.env.CONTAINLY_WEB_ROOT ?? '../web/dist'),
  sessionTtlMs: 1000 * 60 * 60 * 12, // 12h
  sessionIdleMs: 1000 * 60 * 60 * 2, // 2h Inaktivität
} as const;

export type Config = typeof config;

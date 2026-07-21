import { resolve } from 'node:path';

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1' || value === 'yes';
}

function int(value: string | undefined, fallback: number): number {
  const n = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

const dataDir = resolve(process.env.CONTAINLY_DATA_DIR ?? './data');
const stacksDir = resolve(process.env.CONTAINLY_STACKS_DIR ?? './stacks');

export const config = {
  port: int(process.env.PORT, 8420),
  host: process.env.HOST ?? '0.0.0.0',
  dataDir,
  stacksDir,
  dbPath: resolve(dataDir, 'containly.sqlite'),
  secretPath: resolve(dataDir, 'session.secret'),
  masterKeyPath: resolve(dataDir, 'master.key'),
  sessionSecretEnv: process.env.CONTAINLY_SESSION_SECRET ?? '',
  secureCookies: bool(process.env.CONTAINLY_SECURE_COOKIES, true),
  trustProxy: bool(process.env.CONTAINLY_TRUST_PROXY, true),
  dockerSocket: process.env.DOCKER_SOCKET ?? '/var/run/docker.sock',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  isProd: process.env.NODE_ENV === 'production',
  /** Statisches Frontend (im Container-Build vorhanden), sonst deaktiviert. */
  webRoot: resolve(process.env.CONTAINLY_WEB_ROOT ?? '../web/dist'),
  sessionTtlMs: 1000 * 60 * 60 * 12, // 12h
  sessionIdleMs: 1000 * 60 * 60 * 2, // 2h Inaktivität
} as const;

export type Config = typeof config;

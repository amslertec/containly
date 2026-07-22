import type Docker from 'dockerode';
import { db } from '../db/index.js';
import { encryptSecret, decryptSecret } from './crypto.js';

/** Docker-Hub-Standardregistry (Schlüssel + Serveradresse für Auth). */
const DOCKER_IO = 'docker.io';
const DOCKER_IO_SERVER = 'https://index.docker.io/v1/';

interface RegistryRow {
  registry: string;
  username: string;
  secret_enc: string;
  created_at: string;
}

export interface RegistryInfo {
  registry: string;
  username: string;
  createdAt: string;
}

/** Bestimmt die Registry-Host-Kennung aus einer Image-Referenz. */
export function registryOf(ref: string): string {
  const slash = ref.indexOf('/');
  if (slash === -1) return DOCKER_IO;
  const head = ref.slice(0, slash);
  // Ein Registry-Host hat einen Punkt, Port oder ist 'localhost'.
  if (head.includes('.') || head.includes(':') || head === 'localhost') return head;
  return DOCKER_IO;
}

export function listRegistries(): RegistryInfo[] {
  return (db.prepare('SELECT registry, username, created_at FROM registry_credentials ORDER BY registry').all() as RegistryRow[]).map(
    (r) => ({ registry: r.registry, username: r.username, createdAt: r.created_at }),
  );
}

export function setRegistry(registry: string, username: string, secret: string): void {
  db.prepare(
    `INSERT INTO registry_credentials (registry, username, secret_enc) VALUES (?, ?, ?)
     ON CONFLICT(registry) DO UPDATE SET username = excluded.username, secret_enc = excluded.secret_enc`,
  ).run(registry, username, encryptSecret(secret));
}

export function deleteRegistry(registry: string): void {
  db.prepare('DELETE FROM registry_credentials WHERE registry = ?').run(registry);
}

function getRow(registry: string): RegistryRow | undefined {
  return db.prepare('SELECT * FROM registry_credentials WHERE registry = ?').get(registry) as RegistryRow | undefined;
}

/** Dockerode-AuthConfig für ein Image (oder undefined, wenn keine Credentials). */
export function authConfigForImage(image: string): Docker.AuthConfig | undefined {
  const registry = registryOf(image);
  const row = getRow(registry);
  if (!row) return undefined;
  return {
    username: row.username,
    password: decryptSecret(row.secret_enc),
    serveraddress: registry === DOCKER_IO ? DOCKER_IO_SERVER : registry,
  };
}

/** Docker-Hub-Anmeldedaten (username + entschlüsseltes Secret) oder undefined. */
export function dockerHubCredentials(): { username: string; secret: string } | undefined {
  const row = getRow(DOCKER_IO);
  if (!row) return undefined;
  return { username: row.username, secret: decryptSecret(row.secret_enc) };
}

/** base64-kodierter `X-Registry-Auth`-Header-Wert (für modem.dial / distribution). */
export function registryAuthHeader(image: string): string | undefined {
  const cfg = authConfigForImage(image);
  if (!cfg) return undefined;
  return Buffer.from(JSON.stringify(cfg)).toString('base64');
}

/** Prüft Anmeldedaten gegen die Registry (docker-daemon-seitig, wirft bei Fehler). */
export async function verifyRegistryLogin(
  docker: Docker,
  registry: string,
  username: string,
  password: string,
): Promise<void> {
  const authconfig: Docker.AuthConfig = {
    username,
    password,
    serveraddress: registry === DOCKER_IO ? DOCKER_IO_SERVER : registry,
  };
  await docker.checkAuth(authconfig);
}

import Docker from 'dockerode';
import type {
  CreateEndpoint,
  Endpoint,
  EndpointStatus,
  EndpointType,
  SshAuth,
  UpdateEndpoint,
} from '@containly/shared';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { decryptSecret, encryptSecret } from '../services/crypto.js';
import { createSshAgent, type SshAgentOptions } from './ssh-agent.js';

interface EndpointRow {
  id: string;
  name: string;
  type: EndpointType;
  host: string | null;
  port: number | null;
  secret_enc: string | null;
  ssh_user: string | null;
  ssh_auth: string | null;
  stack_paths: string | null;
  builtin: number;
  created_at: string;
}

function parsePaths(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

interface EndpointSecret {
  tls?: { ca: string; cert: string; key: string };
  ssh?: { password?: string; privateKey?: string; passphrase?: string };
}

function readSecret(row: EndpointRow): EndpointSecret {
  return row.secret_enc ? (JSON.parse(decryptSecret(row.secret_enc)) as EndpointSecret) : {};
}

/** Laufzeit-Health je Endpoint (nicht persistiert). */
const health = new Map<string, { status: EndpointStatus; dockerVersion: string | null; at: number }>();
/** Dockerode-Client-Cache je Endpoint. */
const clients = new Map<string, Docker>();

const LOCAL_ID = 'local';

export function ensureLocalEndpoint(): void {
  const exists = db.prepare('SELECT 1 FROM endpoints WHERE id = ?').get(LOCAL_ID);
  if (!exists) {
    db.prepare(
      `INSERT INTO endpoints (id, name, type, host, port, secret_enc, builtin)
       VALUES (?, ?, 'socket', NULL, NULL, NULL, 1)`,
    ).run(LOCAL_ID, 'Lokaler Docker');
    logger.info('Lokaler Endpoint (socket) angelegt');
  }
}

function rowToPublic(row: EndpointRow): Endpoint {
  const h = health.get(row.id);
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    host: row.host,
    port: row.port,
    status: h?.status ?? 'unknown',
    dockerVersion: h?.dockerVersion ?? null,
    lastCheckedAt: h ? new Date(h.at).toISOString() : null,
    builtin: row.builtin === 1,
    sshAuth: (row.ssh_auth as SshAuth | null) ?? null,
    sshUser: row.ssh_user,
    stackPaths: parsePaths(row.stack_paths),
  };
}

/** Normalisiert eine Pfadliste (trimmen, leere raus). */
function normalizePaths(paths: string[] | undefined): string[] {
  return (paths ?? []).map((p) => p.trim()).filter((p) => p.length > 0);
}

export function listEndpoints(): Endpoint[] {
  const rows = db.prepare('SELECT * FROM endpoints ORDER BY builtin DESC, name').all() as EndpointRow[];
  return rows.map(rowToPublic);
}

export function getEndpointRow(id: string): EndpointRow | undefined {
  return db.prepare('SELECT * FROM endpoints WHERE id = ?').get(id) as EndpointRow | undefined;
}

export function getEndpoint(id: string): Endpoint | undefined {
  const row = getEndpointRow(id);
  return row ? rowToPublic(row) : undefined;
}

function randomId(): string {
  return 'ep_' + Buffer.from(crypto.getRandomValues(new Uint8Array(9))).toString('hex');
}

export function createEndpoint(input: CreateEndpoint): Endpoint {
  const id = randomId();
  let secret: EndpointSecret;
  let host: string | null;
  let port: number | null;
  let sshUser: string | null = null;
  let sshAuth: SshAuth | null = null;

  if (input.type === 'tcp') {
    host = input.host ?? null;
    port = input.port ?? 2376;
    secret = { tls: input.tls };
  } else if (input.type === 'ssh') {
    host = input.sshHost ?? null;
    port = input.sshPort ?? 22;
    sshUser = input.sshUser ?? null;
    sshAuth = input.sshAuth ?? 'password';
    secret = {
      ssh:
        sshAuth === 'password'
          ? { password: input.sshPassword }
          : { privateKey: input.sshPrivateKey, passphrase: input.sshPassphrase || undefined },
    };
  } else {
    throw new Error('Socket-Endpoints können nicht manuell erstellt werden');
  }

  db.prepare(
    `INSERT INTO endpoints (id, name, type, host, port, secret_enc, ssh_user, ssh_auth, stack_paths, builtin)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  ).run(
    id,
    input.name,
    input.type,
    host,
    port,
    encryptSecret(JSON.stringify(secret)),
    sshUser,
    sshAuth,
    JSON.stringify(normalizePaths(input.stackPaths)),
  );

  const row = getEndpointRow(id);
  if (!row) throw new Error('Endpoint konnte nicht erstellt werden');
  clients.delete(id);
  return rowToPublic(row);
}

/**
 * Aktualisiert einen Endpoint. Der Typ ist fix. Geheimnisse (TLS-Zertifikate,
 * SSH-Passwort/-Key) werden nur ersetzt, wenn im Update neu übergeben — sonst behalten.
 */
export function updateEndpoint(id: string, input: UpdateEndpoint): Endpoint {
  const row = getEndpointRow(id);
  if (!row) throw new Error('Endpoint nicht gefunden');
  // Eingebauter Endpoint: Name + Compose-Pfade (Typ/Verbindung sind fix).
  if (row.builtin) {
    const paths = input.stackPaths !== undefined ? normalizePaths(input.stackPaths) : parsePaths(row.stack_paths);
    db.prepare('UPDATE endpoints SET name = ?, stack_paths = ? WHERE id = ?').run(
      input.name,
      JSON.stringify(paths),
      id,
    );
    const renamed = getEndpointRow(id);
    if (!renamed) throw new Error('Endpoint konnte nicht aktualisiert werden');
    return rowToPublic(renamed);
  }

  const current = readSecret(row);
  let host = row.host;
  let port = row.port;
  let sshUser = row.ssh_user;
  let sshAuth = row.ssh_auth as SshAuth | null;
  let secret = current;

  if (row.type === 'tcp') {
    if (input.host !== undefined) host = input.host;
    if (input.port !== undefined) port = input.port;
    if (input.tls) secret = { tls: input.tls }; // neu → ersetzen; sonst behalten
  } else if (row.type === 'ssh') {
    if (input.sshHost !== undefined) host = input.sshHost;
    if (input.sshPort !== undefined) port = input.sshPort;
    if (input.sshUser !== undefined) sshUser = input.sshUser;
    if (input.sshAuth) sshAuth = input.sshAuth;
    // Nur ersetzen, wenn ein neues Geheimnis übergeben wurde.
    if (sshAuth === 'password' && input.sshPassword) {
      secret = { ssh: { password: input.sshPassword } };
    } else if (sshAuth === 'key' && input.sshPrivateKey) {
      secret = { ssh: { privateKey: input.sshPrivateKey, passphrase: input.sshPassphrase || undefined } };
    } else if (input.sshAuth && input.sshAuth !== (row.ssh_auth as SshAuth | null)) {
      throw new Error('Bei geänderter Auth-Methode ist ein neues Passwort bzw. ein neuer Key nötig');
    }
  }

  const stackPaths =
    input.stackPaths !== undefined ? normalizePaths(input.stackPaths) : parsePaths(row.stack_paths);
  db.prepare(
    `UPDATE endpoints SET name = ?, host = ?, port = ?, secret_enc = ?, ssh_user = ?, ssh_auth = ?, stack_paths = ?
     WHERE id = ?`,
  ).run(
    input.name,
    host,
    port,
    encryptSecret(JSON.stringify(secret)),
    sshUser,
    sshAuth,
    JSON.stringify(stackPaths),
    id,
  );

  clients.delete(id);
  health.delete(id);
  const updated = getEndpointRow(id);
  if (!updated) throw new Error('Endpoint konnte nicht aktualisiert werden');
  return rowToPublic(updated);
}

export function deleteEndpoint(id: string): void {
  const row = getEndpointRow(id);
  if (!row) return;
  if (row.builtin) throw new Error('Eingebauter Endpoint kann nicht gelöscht werden');
  db.prepare('DELETE FROM endpoints WHERE id = ?').run(id);
  clients.delete(id);
  health.delete(id);
}

/** Baut (oder liefert gecacht) den Dockerode-Client für einen Endpoint. */
export function getDocker(id: string): Docker {
  const cached = clients.get(id);
  if (cached) return cached;

  const row = getEndpointRow(id);
  if (!row) throw new Error(`Unbekannter Endpoint: ${id}`);

  let client: Docker;
  if (row.type === 'socket') {
    client = new Docker({ socketPath: config.dockerSocket });
  } else if (row.type === 'tcp') {
    if (!row.secret_enc) throw new Error('TCP-Endpoint ohne TLS-Material');
    const secret = JSON.parse(decryptSecret(row.secret_enc)) as EndpointSecret;
    if (!secret.tls) throw new Error('TCP-Endpoint ohne TLS-Material');
    client = new Docker({
      host: row.host ?? undefined,
      port: row.port ?? 2376,
      protocol: 'https',
      ca: secret.tls.ca,
      cert: secret.tls.cert,
      key: secret.tls.key,
    });
  } else {
    // SSH über eigenen Agent (keyboard-interactive für PAM-Passwörter + Key-Auth).
    const secret = readSecret(row);
    if (!row.host || !row.ssh_user) throw new Error('SSH-Endpoint unvollständig konfiguriert');
    const sshOpts: SshAgentOptions = {
      host: row.host,
      port: row.port ?? 22,
      username: row.ssh_user,
    };
    if ((row.ssh_auth as SshAuth) === 'key') {
      if (!secret.ssh?.privateKey) throw new Error('SSH-Endpoint ohne privaten Schlüssel');
      sshOpts.privateKey = secret.ssh.privateKey;
      if (secret.ssh.passphrase) sshOpts.passphrase = secret.ssh.passphrase;
    } else {
      if (!secret.ssh?.password) throw new Error('SSH-Endpoint ohne Passwort');
      sshOpts.password = secret.ssh.password;
    }
    // Requests laufen über den SSH-Tunnel-Agent; Host/Port dienen nur der URL-Bildung.
    client = new Docker({
      protocol: 'http',
      host: '127.0.0.1',
      port: row.port ?? 22,
      agent: createSshAgent(sshOpts),
    } as unknown as Docker.DockerOptions);
  }

  clients.set(id, client);
  return client;
}

/** Prüft die Erreichbarkeit eines Endpoints und aktualisiert die Health-Map. */
export async function checkHealth(id: string): Promise<EndpointStatus> {
  try {
    const docker = getDocker(id);
    const version = (await docker.version()) as { Version?: string };
    health.set(id, { status: 'online', dockerVersion: version.Version ?? null, at: Date.now() });
    return 'online';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status: EndpointStatus = /unauthorized|certificate|tls/i.test(msg)
      ? 'unauthorized'
      : 'offline';
    health.set(id, { status, dockerVersion: null, at: Date.now() });
    // Client verwerfen, damit nächster Versuch neu verbindet
    clients.delete(id);
    return status;
  }
}

export async function checkAllHealth(): Promise<void> {
  const rows = db.prepare('SELECT id FROM endpoints').all() as { id: string }[];
  await Promise.all(rows.map((r) => checkHealth(r.id)));
}

/**
 * Baut die Docker-CLI-Umgebung für einen Endpoint (für `docker compose`).
 * Für TCP werden die TLS-Zertifikate in ein temporäres 0700-Verzeichnis geschrieben;
 * `cleanup()` entfernt sie wieder. NIEMALS als Fehler die Secrets loggen.
 */
export async function getDockerEnv(
  id: string,
): Promise<{ env: Record<string, string>; cleanup: () => void }> {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const row = getEndpointRow(id);
  if (!row) throw new Error(`Unbekannter Endpoint: ${id}`);
  const env: Record<string, string> = {};
  let tmp: string | null = null;

  if (row.type === 'socket') {
    env.DOCKER_HOST = `unix://${config.dockerSocket}`;
  } else if (row.type === 'tcp') {
    if (!row.secret_enc) throw new Error('TCP-Endpoint ohne TLS-Material');
    const secret = JSON.parse(decryptSecret(row.secret_enc)) as EndpointSecret;
    if (!secret.tls) throw new Error('TCP-Endpoint ohne TLS-Material');
    tmp = mkdtempSync(join(tmpdir(), 'containly-tls-'));
    writeFileSync(join(tmp, 'ca.pem'), secret.tls.ca, { mode: 0o600 });
    writeFileSync(join(tmp, 'cert.pem'), secret.tls.cert, { mode: 0o600 });
    writeFileSync(join(tmp, 'key.pem'), secret.tls.key, { mode: 0o600 });
    env.DOCKER_HOST = `tcp://${row.host}:${row.port ?? 2376}`;
    env.DOCKER_TLS_VERIFY = '1';
    env.DOCKER_CERT_PATH = tmp;
  } else {
    // SSH: `docker compose` nutzt das System-`ssh`. Key-Auth über ein temporäres HOME mit
    // .ssh/config (IdentityFile). Passwort-Auth kann das CLI-SSH nicht automatisieren.
    const secret = readSecret(row);
    env.DOCKER_HOST = `ssh://${row.ssh_user}@${row.host}:${row.port ?? 22}`;
    if ((row.ssh_auth as string) === 'key') {
      if (!secret.ssh?.privateKey) throw new Error('SSH-Endpoint ohne privaten Schlüssel');
      tmp = mkdtempSync(join(tmpdir(), 'containly-ssh-'));
      mkdirSync(join(tmp, '.ssh'), { mode: 0o700, recursive: true });
      const keyFile = join(tmp, '.ssh', 'id_key');
      const keyContent = secret.ssh.privateKey.endsWith('\n')
        ? secret.ssh.privateKey
        : secret.ssh.privateKey + '\n';
      writeFileSync(keyFile, keyContent, { mode: 0o600 });
      writeFileSync(
        join(tmp, '.ssh', 'config'),
        `Host ${row.host}\n  User ${row.ssh_user}\n  Port ${row.port ?? 22}\n` +
          `  IdentityFile ${keyFile}\n  IdentitiesOnly yes\n  StrictHostKeyChecking accept-new\n` +
          `  UserKnownHostsFile ${join(tmp, '.ssh', 'known_hosts')}\n`,
        { mode: 0o600 },
      );
      env.HOME = tmp;
    } else {
      throw new Error(
        'Compose über SSH benötigt Key-Authentifizierung — Passwort-Auth wird vom Docker-CLI nicht unterstützt.',
      );
    }
  }

  return {
    env,
    cleanup: () => {
      if (tmp) {
        try {
          rmSync(tmp, { recursive: true, force: true });
        } catch {
          /* best effort */
        }
      }
    },
  };
}

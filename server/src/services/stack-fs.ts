import { basename, dirname, join, resolve } from 'node:path';
import { Writable } from 'node:stream';
import * as tar from 'tar-stream';
import type Dockerode from 'dockerode';
import { getDocker, getEndpoint } from '../docker/endpoints.js';
import { logger } from '../logger.js';

const COMPOSE_FILES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];

export interface FsEntry {
  name: string;
  size: number;
  isDir: boolean;
  mtime: string | null;
}
export interface FsStat {
  isDir: boolean;
  size: number;
  mtime: string;
}
/** Ein Compose-Projekt (direkter Unterordner mit Compose-Datei). */
export interface ProjectEntry {
  name: string;
  composeFile: string;
  mtime: string | null;
}

/** Abstraktion über das Dateisystem eines Endpoints (lokal bzw. remote via Helfer). */
export interface StackFs {
  readonly isRemote: boolean;
  /** Direkte Unterordner mit Compose-Datei (ein Aufruf statt einer pro Stack). */
  scanProjects(base: string): Promise<ProjectEntry[]>;
  listDir(dir: string): Promise<FsEntry[]>;
  stat(path: string): Promise<FsStat | null>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  mkdirp(dir: string): Promise<void>;
  remove(path: string): Promise<void>;
  /** `docker compose` im Projektordner — läuft nativ auf dem Ziel-Host. */
  compose(dir: string, project: string, composeFile: string, args: string[]): Promise<string>;
  /** Wie `compose`, aber streamt die Ausgabe live (onData) und liefert den Exit-Code. */
  composeStream(
    dir: string,
    project: string,
    composeFile: string,
    args: string[],
    onData: (chunk: string) => void,
  ): Promise<number>;
}

/* ── Helfer-Container-basierter Zugriff (lokal + remote) ────────────────────── */
const HELPER_IMAGE = 'docker:cli';
const HELPER_NAME = 'containly-helper';
const HELPER_LABEL = 'ch.amslertec.containly.helper';

async function ensureImage(docker: Dockerode, image: string): Promise<void> {
  try {
    await docker.getImage(image).inspect();
    return;
  } catch {
    /* nicht vorhanden → ziehen */
  }
  logger.info({ image }, 'Ziehe Helfer-Image auf Remote-Host');
  await new Promise<void>((res, rej) => {
    docker.pull(image, (err: unknown, stream: NodeJS.ReadableStream) => {
      if (err) return rej(err instanceof Error ? err : new Error(String(err)));
      docker.modem.followProgress(stream, (e: unknown) =>
        e ? rej(e instanceof Error ? e : new Error(String(e))) : res(),
      );
    });
  });
}

// Kurzlebiger Cache des Helfer-Handles je Endpoint → spart ein `inspect` pro exec.
const helperCache = new Map<string, { container: Dockerode.Container; at: number }>();
const HELPER_CACHE_TTL_MS = 30_000;

export function invalidateHelper(endpoint: string): void {
  helperCache.delete(endpoint);
}

/** Stellt den dauerhaften Helfer-Container sicher (mit den nötigen Bind-Mounts). */
async function ensureHelper(endpoint: string): Promise<Dockerode.Container> {
  const cached = helperCache.get(endpoint);
  if (cached && Date.now() - cached.at < HELPER_CACHE_TTL_MS) return cached.container;

  const docker = getDocker(endpoint);
  const ep = getEndpoint(endpoint);
  const paths = (ep?.stackPaths ?? []).map((p) => resolve(p));
  const binds = ['/var/run/docker.sock:/var/run/docker.sock', ...paths.map((p) => `${p}:${p}`)];

  const existing = docker.getContainer(HELPER_NAME);
  try {
    const info = await existing.inspect();
    const cur = new Set(info.HostConfig?.Binds ?? []);
    const bindsOk = binds.every((b) => cur.has(b));
    const imageOk = (info.Config?.Image ?? '').startsWith(HELPER_IMAGE);
    if (bindsOk && imageOk) {
      if (!info.State?.Running) await existing.start();
      helperCache.set(endpoint, { container: existing, at: Date.now() });
      return existing;
    }
    // Mounts/Image veraltet → neu aufsetzen.
    await existing.remove({ force: true });
  } catch {
    /* existiert nicht */
  }

  await ensureImage(docker, HELPER_IMAGE);
  const container = await docker.createContainer({
    name: HELPER_NAME,
    Image: HELPER_IMAGE,
    Entrypoint: [],
    Cmd: ['tail', '-f', '/dev/null'],
    Labels: { [HELPER_LABEL]: 'true' },
    HostConfig: {
      Binds: binds,
      RestartPolicy: { Name: 'unless-stopped' },
      // Kein extra Privileg über den ohnehin vorhandenen Socket-Zugriff hinaus.
    },
  });
  await container.start();
  helperCache.set(endpoint, { container, at: Date.now() });
  logger.info({ endpoint, binds }, 'Containly-Helfer-Container gestartet');
  return container;
}

interface ExecResult {
  stdout: string;
  stderr: string;
  exit: number;
}

async function execInHelper(endpoint: string, cmd: string[], cwd?: string): Promise<ExecResult> {
  const docker = getDocker(endpoint);
  let container: Dockerode.Container;
  try {
    container = await ensureHelper(endpoint);
  } catch (err) {
    invalidateHelper(endpoint);
    throw err;
  }
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: cwd,
  }).catch((err) => {
    // Helfer evtl. entfernt → Cache verwerfen, damit der nächste Aufruf neu aufsetzt.
    invalidateHelper(endpoint);
    throw err;
  });
  const stream = await exec.start({ hijack: true, stdin: false });
  const out: Buffer[] = [];
  const err: Buffer[] = [];
  await new Promise<void>((res, rej) => {
    const wo = new Writable({ write(c, _e, cb) { out.push(Buffer.from(c)); cb(); } });
    const we = new Writable({ write(c, _e, cb) { err.push(Buffer.from(c)); cb(); } });
    docker.modem.demuxStream(stream, wo, we);
    stream.on('end', () => res());
    stream.on('error', rej);
  });
  const info = await exec.inspect();
  return {
    stdout: Buffer.concat(out).toString('utf8'),
    stderr: Buffer.concat(err).toString('utf8'),
    exit: info.ExitCode ?? 0,
  };
}

/** Wie execInHelper, aber streamt die Ausgabe live (onData) und liefert den Exit-Code. */
async function execStreamInHelper(
  endpoint: string,
  cmd: string[],
  cwd: string,
  onData: (chunk: string) => void,
): Promise<number> {
  const docker = getDocker(endpoint);
  let container: Dockerode.Container;
  try {
    container = await ensureHelper(endpoint);
  } catch (err) {
    invalidateHelper(endpoint);
    throw err;
  }
  const exec = await container
    .exec({ Cmd: cmd, AttachStdout: true, AttachStderr: true, WorkingDir: cwd })
    .catch((err) => {
      invalidateHelper(endpoint);
      throw err;
    });
  const stream = await exec.start({ hijack: true, stdin: false });
  await new Promise<void>((res, rej) => {
    const w = new Writable({ write(c, _e, cb) { onData(Buffer.from(c).toString('utf8')); cb(); } });
    docker.modem.demuxStream(stream, w, w);
    stream.on('end', () => res());
    stream.on('error', rej);
  });
  const info = await exec.inspect();
  return info.ExitCode ?? 0;
}

/** `docker compose` im Helfer-Container ausführen — gepuffert (für Local + Remote). */
async function helperCompose(
  endpoint: string,
  dir: string,
  project: string,
  composeFile: string,
  args: string[],
): Promise<string> {
  const { stdout, stderr, exit } = await execInHelper(
    endpoint,
    ['docker', 'compose', '-p', project, '-f', join(dir, composeFile), ...args],
    dir,
  );
  if (exit !== 0) throw new Error((stderr || stdout).trim() || 'compose fehlgeschlagen');
  return stdout + stderr;
}

/** `docker compose` im Helfer-Container ausführen — gestreamt (für Local + Remote). */
function helperComposeStream(
  endpoint: string,
  dir: string,
  project: string,
  composeFile: string,
  args: string[],
  onData: (chunk: string) => void,
): Promise<number> {
  return execStreamInHelper(
    endpoint,
    ['docker', 'compose', '-p', project, '-f', join(dir, composeFile), ...args],
    dir,
    onData,
  );
}

/** Baut ein Tar mit genau einer Datei (für putArchive). */
function singleFileTar(name: string, content: string): NodeJS.ReadableStream {
  const pack = tar.pack();
  pack.entry({ name, mode: 0o640 }, content);
  pack.finalize();
  return pack;
}

/** Liest den Inhalt der ersten Datei aus einem getArchive-Tar. */
function readSingleFromTar(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((res, rej) => {
    const extract = tar.extract();
    let content: string | null = null;
    extract.on('entry', (header, estream, next) => {
      if (content === null && header.type === 'file') {
        const chunks: Buffer[] = [];
        estream.on('data', (c) => chunks.push(Buffer.from(c)));
        estream.on('end', () => { content = Buffer.concat(chunks).toString('utf8'); next(); });
      } else {
        estream.on('end', next);
        estream.resume();
      }
    });
    extract.on('finish', () => (content === null ? rej(new Error('Datei nicht gefunden')) : res(content)));
    extract.on('error', rej);
    stream.pipe(extract);
  });
}

class RemoteFs implements StackFs {
  readonly isRemote = true;
  constructor(private readonly endpoint: string) {}

  async scanProjects(base: string): Promise<ProjectEntry[]> {
    // Ein einziger exec: alle Projektordner mit Compose-Datei + mtime auf einmal.
    const script =
      'cd "$1" 2>/dev/null || exit 0; for d in */; do [ -d "$d" ] || continue; d="${d%/}"; ' +
      'for f in docker-compose.yml docker-compose.yaml compose.yml compose.yaml; do ' +
      'if [ -f "$d/$f" ]; then echo "$d|$f|$(stat -c %Y "$d/$f" 2>/dev/null)"; break; fi; done; done';
    const { stdout } = await execInHelper(this.endpoint, ['sh', '-c', script, 'sh', base]);
    const out: ProjectEntry[] = [];
    for (const line of stdout.split('\n')) {
      if (!line) continue;
      const i1 = line.indexOf('|');
      const i2 = line.lastIndexOf('|');
      if (i1 < 0 || i2 <= i1) continue;
      const name = line.slice(0, i1);
      const composeFile = line.slice(i1 + 1, i2);
      const epoch = Number(line.slice(i2 + 1)) || 0;
      out.push({ name, composeFile, mtime: new Date(epoch * 1000).toISOString() });
    }
    return out;
  }

  async listDir(dir: string): Promise<FsEntry[]> {
    // Günstig: ein einziger exec (kein rekursiver getArchive-Baum).
    const script =
      'cd "$1" 2>/dev/null || exit 0; ls -1A 2>/dev/null | while IFS= read -r f; do ' +
      'stat -c "%F|%s|%Y|%n" "$f" 2>/dev/null; done';
    const { stdout } = await execInHelper(this.endpoint, ['sh', '-c', script, 'sh', dir]);
    const out: FsEntry[] = [];
    for (const line of stdout.split('\n')) {
      if (!line) continue;
      const idx1 = line.indexOf('|');
      const idx2 = line.indexOf('|', idx1 + 1);
      const idx3 = line.indexOf('|', idx2 + 1);
      if (idx1 < 0 || idx2 < 0 || idx3 < 0) continue;
      const type = line.slice(0, idx1);
      const size = Number(line.slice(idx1 + 1, idx2)) || 0;
      const epoch = Number(line.slice(idx2 + 1, idx3)) || 0;
      const name = line.slice(idx3 + 1);
      const isDir = type.includes('directory');
      out.push({ name, size: isDir ? 0 : size, isDir, mtime: new Date(epoch * 1000).toISOString() });
    }
    return out;
  }

  async stat(path: string): Promise<FsStat | null> {
    const { stdout, exit } = await execInHelper(this.endpoint, ['stat', '-c', '%F|%s|%Y', path]);
    if (exit !== 0) return null;
    const [type = '', size = '0', epoch = '0'] = stdout.trim().split('|');
    return {
      isDir: type.includes('directory'),
      size: Number(size) || 0,
      mtime: new Date((Number(epoch) || 0) * 1000).toISOString(),
    };
  }

  async readFile(path: string): Promise<string> {
    const container = await ensureHelper(this.endpoint);
    const stream = (await container.getArchive({ path })) as unknown as NodeJS.ReadableStream;
    return readSingleFromTar(stream);
  }

  async writeFile(path: string, content: string): Promise<void> {
    const container = await ensureHelper(this.endpoint);
    await container.putArchive(singleFileTar(basename(path), content), { path: dirname(path) });
  }

  async mkdirp(dir: string): Promise<void> {
    const { exit, stderr } = await execInHelper(this.endpoint, ['mkdir', '-p', dir]);
    if (exit !== 0) throw new Error(stderr.trim() || 'mkdir fehlgeschlagen');
  }

  async remove(path: string): Promise<void> {
    const { exit, stderr } = await execInHelper(this.endpoint, ['rm', '-rf', path]);
    if (exit !== 0) throw new Error(stderr.trim() || 'Löschen fehlgeschlagen');
  }

  compose(dir: string, project: string, composeFile: string, args: string[]): Promise<string> {
    return helperCompose(this.endpoint, dir, project, composeFile, args);
  }
  composeStream(
    dir: string,
    project: string,
    composeFile: string,
    args: string[],
    onData: (chunk: string) => void,
  ): Promise<number> {
    return helperComposeStream(this.endpoint, dir, project, composeFile, args, onData);
  }
}

/**
 * Liefert die Dateisystem-Abstraktion für einen Endpoint. Alle Endpoints (auch der
 * lokale socket-Endpoint) lesen die konfigurierten Stack-Pfade über den Helfer-
 * Container — dieser mountet die Pfade direkt vom Ziel-Host. So funktioniert der
 * lokale Endpoint OHNE die Pfade zusätzlich in den Containly-Container zu mounten.
 */
export function getStackFs(endpoint: string): StackFs {
  return new RemoteFs(endpoint);
}

/** Entfernt den Helfer-Container eines Remote-Endpoints (z. B. beim Löschen). */
export async function removeHelper(endpoint: string): Promise<void> {
  try {
    await getDocker(endpoint).getContainer(HELPER_NAME).remove({ force: true });
  } catch {
    /* egal */
  }
}

import { Writable } from 'node:stream';
import { pack } from 'tar-stream';
import type { VolumeFile } from '@containly/shared';
import { getDocker } from '../docker/endpoints.js';

/**
 * Dateioperationen IN einem laufenden Container — über die Docker-API (exec/getArchive/
 * putArchive), ohne Helfer-Container. Setzt gängige Shell-Tools im Container voraus
 * (busybox/coreutils); minimalistische Images (scratch/distroless) unterstützen das nicht.
 */

/** Führt ein Kommando im Container aus und sammelt stdout/stderr + Exit-Code. */
async function execCapture(
  endpoint: string,
  id: string,
  cmd: string[],
): Promise<{ stdout: string; stderr: string; exit: number }> {
  const docker = getDocker(endpoint);
  const container = docker.getContainer(id);
  const exec = await container.exec({ Cmd: cmd, AttachStdout: true, AttachStderr: true });
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

/** Klartext-Fehler für Images ohne Shell (scratch/distroless) statt rohem „exit 127". */
const NO_SHELL_MSG =
  'Kein Datei-Zugriff: Dieser Container basiert auf einem minimalen Image (scratch/distroless) ohne Shell.';

/** Wirft eine verständliche Meldung, wenn im Container kein Shell/Tool vorhanden ist. */
function assertShellAvailable(exit: number, stderr: string): void {
  // Exit 127 = command not found; dockerode liefert das statt einer OCI-Exception,
  // wenn /bin/sh im Image fehlt (scratch/distroless).
  if (exit === 127 || /no such file|not found/i.test(stderr)) throw new Error(NO_SHELL_MSG);
}

/** Normalisiert einen Pfad relativ zu / (kein Ausbruch mit ..). */
function cleanPath(path: string): string {
  const parts = (path || '').split('/').filter((p) => p && p !== '.' && p !== '..');
  return '/' + parts.join('/');
}

/** Listet ein Verzeichnis im Container. */
export async function listContainerFiles(
  endpoint: string,
  id: string,
  path: string,
): Promise<{ path: string; entries: VolumeFile[] }> {
  const dir = cleanPath(path);
  // Über `/bin/sh -c` statt bare `ls`: manche Images setzen PATH nur im Shell-Profil,
  // nicht in Config.Env → bare `ls` via execvp gäbe „exit 127" (command not found).
  // Kein `--time-style`: GNU-only, BusyBox/Alpine kennt es nicht. Die Datums-Spalten
  // (Monat Tag Zeit/Jahr) werden generisch übersprungen — die UI zeigt keine mtime.
  const { stdout, exit, stderr } = await execCapture(endpoint, id, [
    '/bin/sh', '-c', 'ls -lA "$1"', 'sh', dir,
  ]);
  assertShellAvailable(exit, stderr);
  if (exit !== 0) throw new Error(stderr.trim() || `ls exit ${exit}`);
  const entries: VolumeFile[] = [];
  for (const line of stdout.split('\n')) {
    // Format: perms links owner group size <Monat Tag Zeit/Jahr> name
    const m = line.match(/^([bcdlps-])\S*\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\S+\s+\S+\s+(.+)$/);
    if (!m) continue;
    const name = m[3]!.replace(/ ->.*$/, ''); // Symlink-Ziel abschneiden
    if (name === '.' || name === '..') continue;
    entries.push({
      name,
      isDir: m[1] === 'd',
      size: Number(m[2]),
      mtime: 0,
    });
  }
  entries.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
  return { path: dir === '/' ? '' : dir.replace(/^\//, ''), entries };
}

/** Liest eine Datei aus dem Container (base64). */
export async function readContainerFileBase64(endpoint: string, id: string, path: string): Promise<string> {
  const p = cleanPath(path);
  const { stdout, exit, stderr } = await execCapture(endpoint, id, [
    '/bin/sh', '-c', 'base64 "$1"', 'sh', p,
  ]);
  assertShellAvailable(exit, stderr);
  if (exit !== 0) throw new Error(stderr.trim() || `base64 exit ${exit}`);
  return stdout.replace(/\s+/g, '');
}

/** Schreibt/überträgt eine Datei in den Container (putArchive mit Tar). */
export async function writeContainerFileBase64(
  endpoint: string,
  id: string,
  path: string,
  base64: string,
): Promise<void> {
  const p = cleanPath(path);
  const slash = p.lastIndexOf('/');
  const dir = p.slice(0, slash) || '/';
  const name = p.slice(slash + 1);
  if (!name) throw new Error('Ungültiger Zielpfad');

  const tar = pack();
  const buf = Buffer.from(base64, 'base64');
  tar.entry({ name, size: buf.length, mode: 0o644 }, buf);
  tar.finalize();
  await getDocker(endpoint).getContainer(id).putArchive(tar, { path: dir });
}

/** Löscht eine Datei/ein Verzeichnis im Container. */
export async function deleteContainerPath(endpoint: string, id: string, path: string): Promise<void> {
  const p = cleanPath(path);
  if (p === '/') throw new Error('Root darf nicht gelöscht werden');
  const { exit, stderr } = await execCapture(endpoint, id, [
    '/bin/sh', '-c', 'rm -rf "$1"', 'sh', p,
  ]);
  assertShellAvailable(exit, stderr);
  if (exit !== 0) throw new Error(stderr.trim() || `rm exit ${exit}`);
}

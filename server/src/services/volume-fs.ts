import type { VolumeFile, VolumeListing } from '@containly/shared';
import { execInHelper } from './stack-fs.js';

/**
 * Dateioperationen für ein Named Volume — ausgeführt über den `containly-helper`
 * (docker:cli mit Socket), der ein kurzlebiges `alpine`-Wegwerf-Container mit dem
 * Volume unter /vol startet. So braucht Containlys Image keinerlei Volume-Zugriff.
 */

const IMAGE = 'alpine:latest';
const VOLUME_RE = /^[a-zA-Z0-9._-]+$/;

function assertVolume(volume: string): void {
  if (!VOLUME_RE.test(volume)) throw new Error(`Ungültiger Volume-Name: ${volume}`);
}

/**
 * Bereinigt einen relativen Pfad: entfernt führende Slashes, verwirft `..`-Segmente
 * (kein Ausbruch aus /vol) und baut den absoluten Pfad im Container zusammen.
 */
function safePath(path: string): string {
  const clean = (path || '')
    .split('/')
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .join('/');
  return clean ? `/vol/${clean}` : '/vol';
}

/** Shell-sicheres Single-Quoting eines Arguments. */
function q(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function runInVolume(
  endpoint: string,
  volume: string,
  script: string,
  readOnly: boolean,
): Promise<{ stdout: string; stderr: string; exit: number }> {
  assertVolume(volume);
  const mount = `${volume}:/vol${readOnly ? ':ro' : ''}`;
  return execInHelper(endpoint, ['docker', 'run', '--rm', '-v', mount, IMAGE, 'sh', '-c', script]);
}

/** Listet ein Verzeichnis im Volume (Ordner zuerst, alphabetisch). */
export async function listVolumeFiles(
  endpoint: string,
  volume: string,
  path: string,
): Promise<VolumeListing> {
  const abs = safePath(path);
  // Zeilen: "<type>|<size>|<mtime>|<name>" — type 'd' für Verzeichnis, sonst 'f'.
  const script =
    `cd ${q(abs)} 2>/dev/null || exit 3; ` +
    `for e in * .[!.]*; do [ -e "$e" ] || continue; ` +
    `if [ -d "$e" ]; then tp=d; else tp=f; fi; ` +
    `sz=$(stat -c %s "$e" 2>/dev/null || echo 0); ` +
    `mt=$(stat -c %Y "$e" 2>/dev/null || echo 0); ` +
    `printf '%s|%s|%s|%s\\n' "$tp" "$sz" "$mt" "$e"; done`;
  const { stdout, stderr, exit } = await runInVolume(endpoint, volume, script, true);
  if (exit === 3) throw new Error('Verzeichnis nicht gefunden');
  if (exit !== 0) throw new Error(stderr || `Auflisten fehlgeschlagen (exit ${exit})`);

  const entries: VolumeFile[] = [];
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    const idx1 = line.indexOf('|');
    const idx2 = line.indexOf('|', idx1 + 1);
    const idx3 = line.indexOf('|', idx2 + 1);
    if (idx1 < 0 || idx2 < 0 || idx3 < 0) continue;
    const tp = line.slice(0, idx1);
    const size = Number(line.slice(idx1 + 1, idx2)) || 0;
    const mtime = Number(line.slice(idx2 + 1, idx3)) || 0;
    const name = line.slice(idx3 + 1);
    if (name === '.' || name === '..') continue;
    entries.push({ name, isDir: tp === 'd', size, mtime });
  }
  entries.sort((a, b) =>
    a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name),
  );
  const rel = abs === '/vol' ? '' : abs.slice('/vol/'.length);
  return { path: rel, entries };
}

/** Liest eine Datei als base64 (für den Download). */
export async function readVolumeFileBase64(
  endpoint: string,
  volume: string,
  path: string,
): Promise<string> {
  const abs = safePath(path);
  if (abs === '/vol') throw new Error('Kein gültiger Dateipfad');
  const script = `[ -f ${q(abs)} ] || exit 3; base64 ${q(abs)}`;
  const { stdout, stderr, exit } = await runInVolume(endpoint, volume, script, true);
  if (exit === 3) throw new Error('Datei nicht gefunden');
  if (exit !== 0) throw new Error(stderr || `Lesen fehlgeschlagen (exit ${exit})`);
  return stdout.replace(/\s+/g, '');
}

/** Schreibt eine Datei (base64-Inhalt); legt das Zielverzeichnis bei Bedarf an. */
export async function writeVolumeFileBase64(
  endpoint: string,
  volume: string,
  path: string,
  base64: string,
): Promise<void> {
  const abs = safePath(path);
  if (abs === '/vol') throw new Error('Kein gültiger Dateipfad');
  if (!/^[A-Za-z0-9+/=\s]*$/.test(base64)) throw new Error('Ungültige base64-Daten');
  const dir = abs.slice(0, abs.lastIndexOf('/')) || '/vol';
  const payload = base64.replace(/\s+/g, '');
  const script = `mkdir -p ${q(dir)} && printf %s ${q(payload)} | base64 -d > ${q(abs)}`;
  const { stderr, exit } = await runInVolume(endpoint, volume, script, false);
  if (exit !== 0) throw new Error(stderr || `Schreiben fehlgeschlagen (exit ${exit})`);
}

/** Löscht eine Datei oder ein Verzeichnis (nicht die Volume-Wurzel). */
export async function deleteVolumePath(
  endpoint: string,
  volume: string,
  path: string,
): Promise<void> {
  const abs = safePath(path);
  if (abs === '/vol') throw new Error('Die Volume-Wurzel kann nicht gelöscht werden');
  const script = `rm -rf ${q(abs)}`;
  const { stderr, exit } = await runInVolume(endpoint, volume, script, false);
  if (exit !== 0) throw new Error(stderr || `Löschen fehlgeschlagen (exit ${exit})`);
}

import { basename, dirname, join, resolve, sep } from 'node:path';
import type {
  StackContainer,
  StackDetail,
  StackFile,
  StackStatus,
  StackSummary,
} from '@containly/shared';
import { getDocker, getEndpoint, listEndpoints } from '../docker/endpoints.js';
import { getStackFs, removeHelper, type StackFs } from './stack-fs.js';

const COMPOSE_FILES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
const DEFAULT_COMPOSE = 'docker-compose.yml';

/* ── Stack-ID: kodiert Endpoint + Projektverzeichnis ──────────────────────── */
function encodeId(endpoint: string, dir: string): string {
  return Buffer.from(`${endpoint}::${dir}`).toString('base64url');
}
function decodeId(id: string): { endpoint: string; dir: string } {
  const s = Buffer.from(id, 'base64url').toString('utf8');
  const i = s.indexOf('::');
  if (i < 0) throw new Error('Ungültige Stack-ID');
  return { endpoint: s.slice(0, i), dir: s.slice(i + 2) };
}

/** Compose-Projektname wie `docker compose` ihn per Default aus dem Ordner ableitet. */
function projectName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'stack';
}

/** Erkennt die Compose-Datei anhand einer bereits geladenen Verzeichnisliste. */
function pickComposeFile(files: { name: string; isDir: boolean }[]): string | null {
  for (const f of COMPOSE_FILES) if (files.some((e) => e.name === f && !e.isDir)) return f;
  return null;
}

interface ResolvedStack {
  endpoint: string;
  dir: string;
  name: string;
  fs: StackFs;
}

/** Prüft, dass `dir` ein legitimes Projekt unter einem der Endpoint-Pfade ist. */
async function resolveStack(id: string): Promise<ResolvedStack> {
  const { endpoint, dir } = decodeId(id);
  const ep = getEndpoint(endpoint);
  if (!ep) throw new Error('Endpoint nicht gefunden');
  const abs = resolve(dir);
  const allowed = ep.stackPaths.map((p) => resolve(p));
  if (!allowed.includes(resolve(dirname(abs)))) throw new Error('Pfad nicht erlaubt');
  const fs = getStackFs(endpoint);
  const st = await fs.stat(abs);
  if (!st || !st.isDir) throw new Error('Projekt nicht gefunden');
  return { endpoint, dir: abs, name: basename(abs), fs };
}

/** Laufzeit-Status über die Compose-Labels der Container des Ziel-Endpoints. */
async function stackStatus(
  name: string,
  endpoint: string,
): Promise<{ status: StackStatus; services: number; running: number }> {
  try {
    const docker = getDocker(endpoint);
    const containers = await docker.listContainers({
      all: true,
      filters: { label: [`com.docker.compose.project=${projectName(name)}`] },
    });
    const services = new Set(
      containers.map((c) => c.Labels?.['com.docker.compose.service']).filter(Boolean),
    );
    const running = containers.filter((c) => c.State === 'running').length;
    let status: StackStatus = 'stopped';
    if (containers.length === 0) status = 'stopped';
    else if (running === containers.length) status = 'running';
    else if (running > 0) status = 'partial';
    return { status, services: services.size, running };
  } catch {
    return { status: 'unknown', services: 0, running: 0 };
  }
}

/** Container eines Stacks (über die Compose-Labels des Ziel-Endpoints). */
async function stackContainers(name: string, endpoint: string): Promise<StackContainer[]> {
  try {
    const docker = getDocker(endpoint);
    const containers = await docker.listContainers({
      all: true,
      filters: { label: [`com.docker.compose.project=${projectName(name)}`] },
    });
    return containers
      .map((c) => ({
        id: c.Id,
        name: (c.Names?.[0] ?? '').replace(/^\//, ''),
        service: c.Labels?.['com.docker.compose.service'] ?? '',
        image: c.Image,
        state: c.State,
        status: c.Status,
      }))
      .sort((a, b) => a.service.localeCompare(b.service) || a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/**
 * Status-Index eines Endpoints: EINE `listContainers`-Abfrage, gruppiert nach
 * Compose-Projekt — statt einer Abfrage pro Stack.
 */
interface StackStatusInfo {
  status: StackStatus;
  services: number;
  running: number;
  containerNames: string[];
  images: string[];
}

async function buildStatusIndex(endpoint: string): Promise<Map<string, StackStatusInfo>> {
  const map = new Map<string, StackStatusInfo>();
  try {
    const docker = getDocker(endpoint);
    const containers = await docker.listContainers({ all: true });
    const agg = new Map<
      string,
      { services: Set<string>; running: number; total: number; names: Set<string>; images: Set<string> }
    >();
    for (const c of containers) {
      const proj = c.Labels?.['com.docker.compose.project'];
      if (!proj) continue;
      let e = agg.get(proj);
      if (!e) {
        e = { services: new Set(), running: 0, total: 0, names: new Set(), images: new Set() };
        agg.set(proj, e);
      }
      const svc = c.Labels?.['com.docker.compose.service'];
      if (svc) e.services.add(svc);
      const name = (c.Names?.[0] ?? '').replace(/^\//, '');
      if (name) e.names.add(name);
      if (c.Image) e.images.add(c.Image);
      e.total++;
      if (c.State === 'running') e.running++;
    }
    for (const [proj, e] of agg) {
      const status: StackStatus =
        e.total > 0 && e.running === e.total ? 'running' : e.running > 0 ? 'partial' : 'stopped';
      map.set(proj, {
        status,
        services: e.services.size,
        running: e.running,
        containerNames: [...e.names],
        images: [...e.images],
      });
    }
  } catch {
    /* Endpoint offline → alles „stopped" */
  }
  return map;
}

/** Scannt einen Endpoint (alle Pfade) nach Compose-Projekten. */
async function scanEndpoint(ep: ReturnType<typeof listEndpoints>[number]): Promise<StackSummary[]> {
  if (ep.stackPaths.length === 0) return [];
  const fs = getStackFs(ep.id);
  const idx = await buildStatusIndex(ep.id);
  const out: StackSummary[] = [];
  for (const base of ep.stackPaths) {
    const baseAbs = resolve(base);
    let projects;
    try {
      projects = await fs.scanProjects(baseAbs);
    } catch {
      continue;
    }
    for (const p of projects) {
      const dir = join(baseAbs, p.name);
      const st = idx.get(projectName(p.name));
      out.push({
        id: encodeId(ep.id, dir),
        name: p.name,
        endpoint: ep.id,
        endpointName: ep.name,
        status: st?.status ?? 'stopped',
        services: st?.services ?? 0,
        running: st?.running ?? 0,
        path: join(dir, p.composeFile),
        updatedAt: p.mtime,
        containerNames: st?.containerNames ?? [],
        images: st?.images ?? [],
      });
    }
  }
  return out;
}

/** Scannt alle Endpoints (parallel) × ihre Pfade nach Compose-Projekten. */
export async function listStacks(): Promise<StackSummary[]> {
  const perEndpoint = await Promise.all(listEndpoints().map((ep) => scanEndpoint(ep)));
  const out = perEndpoint.flat();
  out.sort((a, b) => a.endpointName.localeCompare(b.endpointName) || a.name.localeCompare(b.name));
  return out;
}

function toStackFiles(entries: { name: string; size: number; isDir: boolean }[]): StackFile[] {
  return entries
    .map((e) => ({
      name: e.name,
      size: e.isDir ? 0 : e.size,
      isDir: e.isDir,
      isCompose: COMPOSE_FILES.includes(e.name),
    }))
    .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
}

export async function getStack(id: string): Promise<StackDetail | null> {
  const { endpoint, dir, name, fs } = await resolveStack(id);
  const ep = getEndpoint(endpoint);
  const files = await fs.listDir(dir);
  const composeFile = pickComposeFile(files);
  if (!composeFile) return null;
  const cf = files.find((f) => f.name === composeFile);
  const st = await stackStatus(name, endpoint);
  const containers = await stackContainers(name, endpoint);
  return {
    id,
    name,
    endpoint,
    endpointName: ep?.name ?? endpoint,
    status: st.status,
    services: st.services,
    running: st.running,
    path: join(dir, composeFile),
    updatedAt: cf?.mtime ?? null,
    content: await fs.readFile(join(dir, composeFile)),
    composeFile,
    files: toStackFiles(files),
    containers,
    containerNames: containers.map((c) => c.name).filter(Boolean),
    images: [...new Set(containers.map((c) => c.image).filter(Boolean))],
  };
}

/** Legt ein neues Projekt in einem der konfigurierten Pfade des Endpoints an. */
export async function createStack(
  endpoint: string,
  basePath: string,
  name: string,
  content: string,
): Promise<string> {
  const ep = getEndpoint(endpoint);
  if (!ep) throw new Error('Endpoint nicht gefunden');
  if (!ep.stackPaths.map((p) => resolve(p)).includes(resolve(basePath))) {
    throw new Error('Pfad ist für diesen Endpoint nicht konfiguriert');
  }
  const dir = resolve(basePath, name);
  if (dirname(dir) !== resolve(basePath) || basename(dir) !== name) throw new Error('Ungültiger Name');
  const fs = getStackFs(endpoint);
  await fs.mkdirp(dir);
  await fs.writeFile(join(dir, DEFAULT_COMPOSE), content);
  return encodeId(endpoint, dir);
}

export async function saveStackContent(id: string, content: string): Promise<void> {
  const { dir, fs } = await resolveStack(id);
  const files = await fs.listDir(dir);
  const composeFile = pickComposeFile(files) ?? DEFAULT_COMPOSE;
  await fs.writeFile(join(dir, composeFile), content);
}

export async function deleteStack(id: string): Promise<void> {
  const { dir, fs } = await resolveStack(id);
  await fs.remove(dir);
}

/* ── Datei-Operationen innerhalb eines Projektordners ─────────────────────── */
/** Löst einen relativen Pfad auf und stellt sicher, dass er IM Projektordner bleibt. */
async function resolveWithin(id: string, rel: string): Promise<{ path: string; fs: StackFs; dir: string }> {
  const { dir, fs } = await resolveStack(id);
  const path = resolve(dir, rel);
  if (path !== dir && !path.startsWith(dir + sep)) throw new Error('Pfad nicht erlaubt');
  return { path, fs, dir };
}

/** Listet den Inhalt eines Unterordners (rel = '' → Projekt-Wurzel). */
export async function listStackDir(id: string, rel: string): Promise<StackFile[]> {
  const { path, fs } = await resolveWithin(id, rel);
  const st = await fs.stat(path);
  if (!st || !st.isDir) throw new Error('Ordner nicht gefunden');
  return toStackFiles(await fs.listDir(path));
}

export async function readStackFile(id: string, file: string): Promise<string> {
  const { path, fs } = await resolveWithin(id, file);
  const st = await fs.stat(path);
  if (!st || st.isDir) throw new Error('Datei nicht gefunden');
  return fs.readFile(path);
}
export async function writeStackFile(id: string, file: string, content: string): Promise<void> {
  const { path, fs } = await resolveWithin(id, file);
  await fs.writeFile(path, content);
}
export async function deleteStackFile(id: string, file: string): Promise<void> {
  const { path, fs } = await resolveWithin(id, file);
  await fs.remove(path);
}

/** Führt `docker compose` im Projektordner mit der Endpoint-Umgebung aus. */
async function compose(id: string, args: string[]): Promise<string> {
  const { dir, name, fs } = await resolveStack(id);
  const files = await fs.listDir(dir);
  const composeFile = pickComposeFile(files);
  if (!composeFile) throw new Error('Keine Compose-Datei im Projekt gefunden');
  return fs.compose(dir, projectName(name), composeFile, args);
}

export function deployStack(id: string): Promise<string> {
  return compose(id, ['up', '-d', '--remove-orphans']);
}
export function downStack(id: string): Promise<string> {
  return compose(id, ['down']);
}

/** Stack-weite Lifecycle-Aktionen über `docker compose <action>`. */
const STACK_ACTIONS = {
  start: ['start'],
  stop: ['stop'],
  restart: ['restart'],
  pause: ['pause'],
  unpause: ['unpause'],
  kill: ['kill'],
} as const;
export type StackAction = keyof typeof STACK_ACTIONS;

export function stackAction(id: string, action: StackAction): Promise<string> {
  return compose(id, [...STACK_ACTIONS[action]]);
}

export { removeHelper };

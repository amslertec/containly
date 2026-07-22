import { createHash } from 'node:crypto';
import type {
  CatalogSource,
  CatalogSourceInput,
  CatalogTemplate,
  DeployTemplate,
} from '@containly/shared';
import { db } from '../db/index.js';
import { getEndpoint } from '../docker/endpoints.js';
import { getStackFs } from './stack-fs.js';
import { logger } from '../logger.js';

/**
 * App-Katalog: verwaltet mehrere Template-Quellen (Portainer-templates.json-Format),
 * lädt und normalisiert die Templates und rollt eine Vorlage als Compose-Stack aus.
 */

const DEFAULT_SOURCE = {
  name: 'Lissy93 (community)',
  url: 'https://raw.githubusercontent.com/Lissy93/portainer-templates/main/templates.json',
};
const FETCH_TIMEOUT = 8000;
const CACHE_TTL_MS = 10 * 60_000;

interface SourceRow {
  id: number;
  name: string;
  url: string;
  enabled: number;
}

function rowToSource(r: SourceRow): CatalogSource {
  return { id: r.id, name: r.name, url: r.url, enabled: r.enabled === 1 };
}

/** Sät beim ersten Zugriff die Default-Quelle, falls noch keine existiert. */
function ensureSeed(): void {
  const count = (db.prepare('SELECT COUNT(*) AS n FROM catalog_sources').get() as { n: number }).n;
  if (count === 0) {
    db.prepare('INSERT INTO catalog_sources (name, url, enabled) VALUES (?, ?, 1)').run(
      DEFAULT_SOURCE.name,
      DEFAULT_SOURCE.url,
    );
  }
}

export function listSources(): CatalogSource[] {
  ensureSeed();
  return (db.prepare('SELECT * FROM catalog_sources ORDER BY id').all() as SourceRow[]).map(rowToSource);
}

export function addSource(input: CatalogSourceInput): CatalogSource {
  const info = db
    .prepare('INSERT INTO catalog_sources (name, url, enabled) VALUES (?, ?, ?)')
    .run(input.name, input.url, input.enabled === false ? 0 : 1);
  cache = null;
  return rowToSource(db.prepare('SELECT * FROM catalog_sources WHERE id = ?').get(Number(info.lastInsertRowid)) as SourceRow);
}

export function updateSource(id: number, input: CatalogSourceInput): void {
  db.prepare('UPDATE catalog_sources SET name = ?, url = ?, enabled = ? WHERE id = ?').run(
    input.name,
    input.url,
    input.enabled === false ? 0 : 1,
    id,
  );
  cache = null;
}

export function deleteSource(id: number): void {
  db.prepare('DELETE FROM catalog_sources WHERE id = ?').run(id);
  cache = null;
}

/* ── Templates laden + normalisieren ──────────────────────────────────────── */

interface RawTemplate {
  type?: number;
  title?: string;
  name?: string;
  description?: string;
  logo?: string;
  categories?: string[];
  image?: string;
  ports?: (string | Record<string, string>)[];
  env?: { name?: string; label?: string; default?: string; preset?: boolean }[];
  volumes?: (string | { container?: string; bind?: string })[];
  restart_policy?: string;
  note?: string;
}

let cache: { at: number; templates: CatalogTemplate[] } | null = null;

function normalizePort(p: string | Record<string, string>): string | null {
  if (typeof p === 'string') return p;
  // Portainer-Objektform: { "8080:80/tcp": "..." } → Schlüssel nehmen.
  const key = Object.keys(p)[0];
  return key ?? null;
}

function normalizeTemplate(raw: RawTemplate, sourceName: string): CatalogTemplate | null {
  // Nur Container-Templates (type 1) oder solche mit Image; Repository-Stacks (2/3) überspringen.
  if (raw.type && raw.type !== 1) return null;
  const image = raw.image ?? '';
  const title = raw.title ?? raw.name ?? '';
  if (!image || !title) return null;

  const ports = (raw.ports ?? []).map(normalizePort).filter((p): p is string => !!p);
  const env = (raw.env ?? [])
    .filter((e) => e.name)
    .map((e) => ({ name: e.name!, label: e.label, default: e.default }));
  const volumes = (raw.volumes ?? [])
    .map((v) => (typeof v === 'string' ? v : v.container))
    .filter((v): v is string => !!v);

  const id = createHash('sha1').update(`${sourceName}|${title}|${image}`).digest('hex').slice(0, 16);
  return {
    id,
    title,
    description: raw.description ?? '',
    logo: raw.logo ?? '',
    categories: raw.categories ?? [],
    image,
    ports,
    env,
    volumes,
    restartPolicy: raw.restart_policy ?? 'unless-stopped',
    note: raw.note ?? '',
    source: sourceName,
  };
}

async function fetchSource(url: string, name: string): Promise<CatalogTemplate[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as unknown;
    const list: RawTemplate[] = Array.isArray(data)
      ? (data as RawTemplate[])
      : ((data as { templates?: RawTemplate[] }).templates ?? []);
    const out: CatalogTemplate[] = [];
    for (const raw of list) {
      const t = normalizeTemplate(raw, name);
      if (t) out.push(t);
    }
    return out;
  } catch (err) {
    logger.warn({ err, url }, 'Katalog-Quelle konnte nicht geladen werden');
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Lädt + merged alle aktiven Quellen (gecached, dedupliziert nach id). */
export async function fetchTemplates(): Promise<CatalogTemplate[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.templates;
  const sources = listSources().filter((s) => s.enabled);
  const results = await Promise.all(sources.map((s) => fetchSource(s.url, s.name)));
  const seen = new Set<string>();
  const templates: CatalogTemplate[] = [];
  for (const t of results.flat()) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    templates.push(t);
  }
  templates.sort((a, b) => a.title.localeCompare(b.title));
  cache = { at: Date.now(), templates };
  return templates;
}

/* ── Deploy ───────────────────────────────────────────────────────────────── */

function yamlString(v: string): string {
  // Einfaches Quoting für Compose-Werte (immer in doppelte Anführungszeichen).
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Baut eine docker-compose.yml aus Template + Overrides. */
function buildCompose(template: CatalogTemplate, name: string, env: Record<string, string>): string {
  const lines: string[] = ['services:', `  ${name}:`, `    image: ${yamlString(template.image)}`, `    restart: ${template.restartPolicy || 'unless-stopped'}`];

  const ports = template.ports;
  if (ports.length > 0) {
    lines.push('    ports:');
    for (const p of ports) {
      // "8080:80/tcp" → "8080:80" (Protokoll für Compose-Kurzform entfernen).
      const clean = p.split('/')[0]!;
      lines.push(`      - ${yamlString(clean)}`);
    }
  }

  const envEntries = Object.entries(env).filter(([, v]) => v !== '');
  if (envEntries.length > 0) {
    lines.push('    environment:');
    for (const [k, v] of envEntries) lines.push(`      ${k}: ${yamlString(v)}`);
  }

  const volNames: string[] = [];
  if (template.volumes.length > 0) {
    lines.push('    volumes:');
    template.volumes.forEach((containerPath, i) => {
      const volName = `${name}_${i}`;
      volNames.push(volName);
      lines.push(`      - ${yamlString(`${volName}:${containerPath}`)}`);
    });
  }

  if (volNames.length > 0) {
    lines.push('', 'volumes:');
    for (const v of volNames) lines.push(`  ${v}:`);
  }

  return lines.join('\n') + '\n';
}

/** Rollt eine Vorlage als Stack in <basePath>/<name>/docker-compose.yml aus + startet sie. */
export async function deployTemplate(input: DeployTemplate): Promise<{ name: string; deployed: boolean }> {
  const ep = getEndpoint(input.endpoint);
  if (!ep) throw new Error(`Endpoint nicht gefunden: ${input.endpoint}`);
  if (!ep.stackPaths.includes(input.basePath)) throw new Error('Ungültiger Stack-Pfad');

  const templates = await fetchTemplates();
  const template = templates.find((t) => t.id === input.templateId);
  if (!template) throw new Error('Vorlage nicht gefunden');

  // Env-Defaults mit Overrides mischen.
  const env: Record<string, string> = {};
  for (const e of template.env) if (e.default != null) env[e.name] = e.default;
  for (const [k, v] of Object.entries(input.env ?? {})) env[k] = v;

  const yaml = buildCompose(template, input.name, env);
  const dir = `${input.basePath.replace(/\/+$/, '')}/${input.name}`;

  const fs = getStackFs(input.endpoint);
  await fs.mkdirp(dir);
  await fs.writeFile(`${dir}/docker-compose.yml`, yaml);
  await fs.compose(dir, input.name, 'docker-compose.yml', ['up', '-d']);

  logger.info({ endpoint: input.endpoint, name: input.name }, 'Template deployt');
  return { name: input.name, deployed: true };
}

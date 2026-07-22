import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { VersionInfo } from '@containly/shared';
import { VERSION } from '../version.js';
import { requireAuth } from '../plugins/auth.js';
import { logger } from '../logger.js';

const REPO = 'amslertec/containly';
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASE_PAGE = `https://github.com/${REPO}/releases/latest`;
const CACHE_TTL_MS = 6 * 60 * 60_000;
const NOTES_MAX = 8000;

interface CachedRelease {
  tag: string | null;
  name: string | null;
  notes: string | null;
  url: string;
  publishedAt: string | null;
}

let cached: CachedRelease | null = null;
let checkedAt: number | null = null;

/** 'v0.2.1' / '0.2.1-rc1' → [0, 2, 1]; non-numeric parts → 0. */
function parseVer(v: string): number[] {
  const core = v.replace(/^v/i, '').split('+')[0]!.split('-')[0]!;
  return core.split('.').map((p) => Number.parseInt(p, 10) || 0);
}
export function isNewer(latest: string, current: string): boolean {
  const a = parseVer(latest);
  const b = parseVer(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

export async function fetchLatest(force: boolean): Promise<CachedRelease | null> {
  if (!force && checkedAt !== null && Date.now() - checkedAt < CACHE_TTL_MS) return cached;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const resp = await fetch(LATEST_API, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'containly' },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (resp.ok) {
      const d = (await resp.json()) as Record<string, unknown>;
      const body = typeof d.body === 'string' ? d.body : null;
      cached = {
        tag: typeof d.tag_name === 'string' ? d.tag_name : null,
        name: typeof d.name === 'string' ? d.name : null,
        notes: body ? body.slice(0, NOTES_MAX) : null,
        url: typeof d.html_url === 'string' ? d.html_url : RELEASE_PAGE,
        publishedAt: typeof d.published_at === 'string' ? d.published_at : null,
      };
    } else {
      logger.warn({ status: resp.status }, 'Update-Check-Status');
    }
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Update-Check fehlgeschlagen');
  }
  // Auch bei Fehler setzen, damit nicht jeder Request neu anfragt.
  checkedAt = Date.now();
  return cached;
}

export async function versionRoutes(app: FastifyInstance): Promise<void> {
  // Aktuelle vs. neueste Version. force=true umgeht den 6-h-Cache (manuelle Prüfung).
  app.get('/api/version', { preHandler: requireAuth }, async (req) => {
    const { force } = z.object({ force: z.coerce.boolean().default(false) }).parse(req.query);
    const rel = await fetchLatest(force);
    const tag = rel?.tag ?? null;
    const info: VersionInfo = {
      current: VERSION,
      latest: tag,
      updateAvailable: !!(tag && isNewer(tag, VERSION)),
      releaseUrl: rel?.url ?? RELEASE_PAGE,
      releaseName: rel?.name ?? null,
      notes: rel?.notes ?? null,
      publishedAt: rel?.publishedAt ?? null,
      checkedAt: checkedAt ? new Date(checkedAt).toISOString() : null,
    };
    return info;
  });
}

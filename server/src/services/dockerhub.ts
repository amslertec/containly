import type { ImageSearchResult, ImageTag } from '@containly/shared';
import { dockerHubCredentials } from './registry.js';
import { logger } from '../logger.js';

/**
 * Docker-Hub-Such-Backend für die Image-Autocomplete. Auf Performance ausgelegt:
 * - JWT-Login-Token wird gecached (~4 h gültig), nicht pro Suche neu geholt.
 * - Die (privaten + öffentlichen) Repos des verbundenen Accounts werden EINMAL
 *   geladen und im Speicher gehalten; Tippen filtert nur in-memory → sofort.
 * - Öffentliche Docker-Hub-Treffer werden pro Suchbegriff kurz gecached.
 */

const HUB = 'https://hub.docker.com';
const JWT_TTL = 4 * 60 * 60 * 1000; // 4 h
const OWN_TTL = 5 * 60 * 1000; // 5 min
const HUB_TTL = 60 * 1000; // 1 min pro Suchbegriff
const FETCH_TIMEOUT = 6000;

interface OwnRepo {
  name: string; // vollständige Referenz, z.B. "amslertec/watchwish_v2"
  namespace: string;
  isPrivate: boolean;
  description: string;
  lastUpdated: string | null;
}

let jwt: { token: string; user: string; at: number } | null = null;
let ownCache: { repos: OwnRepo[]; at: number } | null = null;
const hubCache = new Map<string, { results: ImageSearchResult[]; at: number }>();

async function hubFetch(path: string, token?: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(`${HUB}${path}`, {
      headers: token ? { Authorization: `JWT ${token}` } : {},
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Docker Hub ${res.status} für ${path}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Holt (oder erneuert) das JWT für den verbundenen Docker-Hub-Account. */
async function getJwt(): Promise<{ token: string; user: string } | null> {
  const creds = dockerHubCredentials();
  if (!creds) return null;
  if (jwt && jwt.user === creds.username && Date.now() - jwt.at < JWT_TTL) {
    return { token: jwt.token, user: jwt.user };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(`${HUB}/v2/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: creds.username, password: creds.secret }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'Docker-Hub-Login fehlgeschlagen');
      return null;
    }
    const data = (await res.json()) as { token?: string };
    if (!data.token) return null;
    jwt = { token: data.token, user: creds.username, at: Date.now() };
    return { token: data.token, user: creds.username };
  } catch (err) {
    logger.warn({ err }, 'Docker-Hub-Login-Fehler');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Namespaces des Accounts: eigener Benutzer + Organisationen. */
async function namespacesFor(token: string, user: string): Promise<string[]> {
  const set = new Set<string>([user.toLowerCase()]);
  try {
    const orgs = (await hubFetch(`/v2/user/orgs/?page_size=100`, token)) as {
      results?: { orgname?: string }[];
    };
    for (const o of orgs.results ?? []) if (o.orgname) set.add(o.orgname.toLowerCase());
  } catch (err) {
    logger.debug({ err }, 'Docker-Hub-Orgs konnten nicht geladen werden');
  }
  return [...set];
}

/** Lädt (gecached) alle Repos des verbundenen Accounts inkl. Organisationen. */
async function loadOwnRepos(): Promise<OwnRepo[]> {
  if (ownCache && Date.now() - ownCache.at < OWN_TTL) return ownCache.repos;
  const auth = await getJwt();
  if (!auth) {
    ownCache = { repos: [], at: Date.now() };
    return [];
  }
  const namespaces = await namespacesFor(auth.token, auth.user);
  const perNs = await Promise.all(
    namespaces.map(async (ns) => {
      try {
        const data = (await hubFetch(
          `/v2/repositories/${encodeURIComponent(ns)}/?page_size=100&ordering=last_updated`,
          auth.token,
        )) as {
          results?: { name: string; is_private?: boolean; description?: string; last_updated?: string }[];
        };
        return (data.results ?? []).map<OwnRepo>((r) => ({
          name: `${ns}/${r.name}`,
          namespace: ns,
          isPrivate: !!r.is_private,
          description: r.description ?? '',
          lastUpdated: r.last_updated ?? null,
        }));
      } catch (err) {
        logger.debug({ err, ns }, 'Repos eines Namespaces konnten nicht geladen werden');
        return [];
      }
    }),
  );
  const repos = perNs.flat();
  ownCache = { repos, at: Date.now() };
  return repos;
}

/** Öffentliche Docker-Hub-Suche (gecached pro Suchbegriff). */
async function searchHub(query: string): Promise<ImageSearchResult[]> {
  const key = query.toLowerCase();
  const cached = hubCache.get(key);
  if (cached && Date.now() - cached.at < HUB_TTL) return cached.results;
  try {
    const data = (await hubFetch(
      `/v2/search/repositories/?query=${encodeURIComponent(query)}&page_size=25`,
    )) as {
      results?: {
        repo_name: string;
        short_description?: string;
        star_count?: number;
        pull_count?: number;
        is_official?: boolean;
      }[];
    };
    const results = (data.results ?? [])
      .map<ImageSearchResult>((r) => ({
        name: r.is_official ? r.repo_name.replace(/^library\//, '') : r.repo_name,
        description: r.short_description ?? '',
        stars: r.star_count ?? 0,
        pulls: r.pull_count ?? 0,
        official: !!r.is_official,
        isPrivate: false,
        source: 'hub' as const,
      }))
      // Relevanteste zuerst: offizielle Images, dann nach Sternen/Pulls.
      .sort(
        (a, b) =>
          Number(b.official) - Number(a.official) || b.stars - a.stars || b.pulls - a.pulls,
      );
    hubCache.set(key, { results, at: Date.now() });
    return results;
  } catch (err) {
    logger.debug({ err, query }, 'Docker-Hub-Suche fehlgeschlagen');
    return [];
  }
}

/**
 * Kombinierte Suche: eigene/private Repos (in-memory gefiltert) + öffentliche Treffer,
 * parallel. Eigene Treffer stehen zuerst; Duplikate werden entfernt.
 */
export async function searchImages(
  query: string,
): Promise<{ own: ImageSearchResult[]; hub: ImageSearchResult[] }> {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return { own: [], hub: [] };

  const [ownRepos, hub] = await Promise.all([loadOwnRepos(), searchHub(query)]);

  const own = ownRepos
    .filter((r) => r.name.toLowerCase().includes(q))
    .slice(0, 8)
    .map<ImageSearchResult>((r) => ({
      name: r.name,
      description: r.description,
      stars: 0,
      pulls: 0,
      official: false,
      isPrivate: r.isPrivate,
      source: 'own',
    }));

  const ownNames = new Set(own.map((o) => o.name.toLowerCase()));
  const hubFiltered = hub.filter((h) => !ownNames.has(h.name.toLowerCase())).slice(0, 15);
  return { own, hub: hubFiltered };
}

/** Tags eines Repos (neueste zuerst). Nutzt JWT, falls vorhanden (für private Repos). */
export async function repoTags(repo: string): Promise<ImageTag[]> {
  // "nginx" → "library/nginx"; "ns/name" bleibt.
  const path = repo.includes('/') ? repo : `library/${repo}`;
  const auth = await getJwt();
  try {
    const data = (await hubFetch(
      `/v2/repositories/${path}/tags/?page_size=25&ordering=last_updated`,
      auth?.token,
    )) as {
      results?: { name: string; last_updated?: string; full_size?: number }[];
    };
    return (data.results ?? []).map<ImageTag>((t) => ({
      name: t.name,
      lastUpdated: t.last_updated ?? null,
      size: t.full_size ?? null,
    }));
  } catch (err) {
    logger.debug({ err, repo }, 'Docker-Hub-Tags konnten nicht geladen werden');
    return [];
  }
}

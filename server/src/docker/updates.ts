import type Docker from 'dockerode';
import type { UpdateItem, UpdatesResponse } from '@containly/shared';
import { getDocker } from './endpoints.js';
import { registryAuthHeader } from '../services/registry.js';
import { logger } from '../logger.js';

interface DistributionResult {
  Descriptor?: { digest?: string };
}

const PER_IMAGE_TIMEOUT_MS = 8_000;

/** Ruft `/distribution/<name>/json` — den Registry-Manifest-Digest ohne Pull. */
function distribution(docker: Docker, name: string): Promise<DistributionResult> {
  const auth = registryAuthHeader(name);
  const dial = new Promise<DistributionResult>((resolve, reject) => {
    docker.modem.dial(
      {
        path: `/distribution/${name}/json`,
        method: 'GET',
        headers: auth ? { 'X-Registry-Auth': auth } : undefined,
        statusCodes: { 200: true, 401: 'unauthorized', 404: 'not found', 500: 'server error' },
      },
      (err: Error | null, data: unknown) => (err ? reject(err) : resolve((data ?? {}) as DistributionResult)),
    );
  });
  // Hängende Registry darf den Batch-Slot nicht blockieren → schnell zu „unbekannt".
  const timeout = new Promise<DistributionResult>((_res, rej) =>
    setTimeout(() => rej(new Error('Zeitüberschreitung bei der Registry-Abfrage')), PER_IMAGE_TIMEOUT_MS),
  );
  return Promise.race([dial, timeout]);
}

/** Repository-Teil einer Image-Referenz ohne Tag (beachtet Registry-Ports). */
function repoOf(ref: string): string {
  const slash = ref.lastIndexOf('/');
  const colon = ref.lastIndexOf(':');
  return colon > slash ? ref.slice(0, colon) : ref;
}

function localDigestFor(repoTag: string, repoDigests: string[]): string | null {
  const repo = repoOf(repoTag);
  for (const rd of repoDigests) {
    const at = rd.lastIndexOf('@');
    if (at > 0 && rd.slice(0, at) === repo) return rd.slice(at + 1);
  }
  return null;
}

const CACHE_TTL_MS = 60 * 60_000;
const cache = new Map<string, UpdatesResponse>();

export async function checkUpdates(endpoint: string, force = false): Promise<UpdatesResponse> {
  const cached = cache.get(endpoint);
  if (!force && cached && Date.now() - new Date(cached.checkedAt).getTime() < CACHE_TTL_MS) {
    return cached;
  }

  const docker = getDocker(endpoint);
  const [images, containers] = await Promise.all([
    docker.listImages({ all: false, digests: true }),
    docker.listContainers({ all: true }),
  ]);

  // Container-Namen je Image-ID sammeln (nur Images, die tatsächlich genutzt werden).
  const namesByImageId = new Map<string, string[]>();
  for (const c of containers) {
    const list = namesByImageId.get(c.ImageID) ?? [];
    list.push((c.Names ?? []).map((n) => n.replace(/^\//, ''))[0] ?? c.Id.slice(0, 12));
    namesByImageId.set(c.ImageID, list);
  }

  // Genutzte Images mit auflösbarem Tag + lokalem Digest.
  const targets = images
    .filter((img) => namesByImageId.has(img.Id))
    .map((img) => {
      const repoTag = (img.RepoTags ?? []).find((t) => t && t !== '<none>:<none>') ?? null;
      return {
        id: img.Id,
        repoTag,
        localDigest: repoTag ? localDigestFor(repoTag, img.RepoDigests ?? []) : null,
        containers: namesByImageId.get(img.Id) ?? [],
      };
    })
    .filter((x): x is typeof x & { repoTag: string } => !!x.repoTag);

  // Registry-Abfragen parallelisieren (mit Timeout je Image) für spürbar
  // schnellere Prüfung; moderat begrenzt, um Registry-Rate-Limits zu schonen.
  const items: UpdateItem[] = [];
  const CONCURRENCY = 12;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(
      batch.map(async (tgt): Promise<UpdateItem> => {
        try {
          const dist = await distribution(docker, tgt.repoTag);
          const latest = dist.Descriptor?.digest ?? null;
          const updateAvailable = !!(latest && tgt.localDigest && latest !== tgt.localDigest);
          return {
            image: tgt.repoTag,
            status: !latest || !tgt.localDigest ? 'unknown' : updateAvailable ? 'update' : 'uptodate',
            updateAvailable,
            currentDigest: tgt.localDigest,
            latestDigest: latest,
            containers: tgt.containers,
            error: null,
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return {
            image: tgt.repoTag,
            status: 'unknown',
            updateAvailable: false,
            currentDigest: tgt.localDigest,
            latestDigest: null,
            containers: tgt.containers,
            error: msg,
          };
        }
      }),
    );
    items.push(...settled);
  }

  items.sort((a, b) => Number(b.updateAvailable) - Number(a.updateAvailable) || a.image.localeCompare(b.image));

  const result: UpdatesResponse = { items, checkedAt: new Date().toISOString() };
  cache.set(endpoint, result);
  logger.debug({ endpoint, checked: items.length }, 'Update-Prüfung abgeschlossen');
  return result;
}

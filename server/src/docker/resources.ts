import os from 'node:os';
import { readFileSync } from 'node:fs';
import type Docker from 'dockerode';
import type {
  ImageSummary,
  NetworkSummary,
  PruneResult,
  VolumeSummary,
} from '@containly/shared';
import { getDocker } from './endpoints.js';
import { safeRecreateContainer } from './recreate.js';
import { authConfigForImage } from '../services/registry.js';
import { logger } from '../logger.js';

/** Ermittelt die eigene Container-ID (cgroup/mountinfo, sonst Hostname = Kurz-ID). */
function readSelfContainerId(): string {
  for (const f of ['/proc/self/cgroup', '/proc/self/mountinfo']) {
    try {
      const m = readFileSync(f, 'utf8').match(/\b[0-9a-f]{64}\b/);
      if (m) return m[0];
    } catch {
      /* nicht vorhanden */
    }
  }
  return os.hostname();
}
const SELF_ID = readSelfContainerId();

/**
 * Ist das der Container, in dem Containly SELBST läuft? (darf sich nicht selbst
 * recreaten). `docker` liefert volle 64-Zeichen-IDs; SELF_ID ist entweder die volle
 * ID (cgroup/mountinfo) oder die Kurz-ID (Hostname) — beides matcht nur den eigenen
 * Container per Präfix. Andere Container werden NIE fälschlich als „self" erkannt.
 */
function isSelfContainer(containerId: string): boolean {
  return !!SELF_ID && (containerId === SELF_ID || containerId.startsWith(SELF_ID));
}

/* ── Images ─────────────────────────────────────────────────────────────── */
export async function listImages(endpoint: string): Promise<ImageSummary[]> {
  const docker = getDocker(endpoint);
  const [images, containers] = await Promise.all([
    docker.listImages({ all: false, digests: true }),
    docker.listContainers({ all: true }),
  ]);
  // Container-Namen je Image-ID (für „in Verwendung" + Anzeige).
  const usage = new Map<string, string[]>();
  for (const c of containers) {
    const name = (c.Names?.[0] ?? '').replace(/^\//, '') || c.Id.slice(0, 12);
    const list = usage.get(c.ImageID) ?? [];
    list.push(name);
    usage.set(c.ImageID, list);
  }

  return images.map((img) => {
    const repoTags = (img.RepoTags ?? []).filter((t) => t && t !== '<none>:<none>');
    const names = usage.get(img.Id) ?? [];
    return {
      id: img.Id,
      repoTags,
      repoDigests: img.RepoDigests ?? [],
      created: img.Created,
      size: img.Size,
      containers: names.length,
      containerNames: names,
      dangling: repoTags.length === 0,
    } satisfies ImageSummary;
  });
}

export async function pullImage(endpoint: string, image: string): Promise<void> {
  const docker = getDocker(endpoint);
  const authconfig = authConfigForImage(image);
  await new Promise<void>((resolve, reject) => {
    docker.pull(image, { authconfig }, (err: Error | null, stream?: NodeJS.ReadableStream) => {
      if (err || !stream) return reject(err ?? new Error('Kein Pull-Stream'));
      docker.modem.followProgress(stream, (doneErr: Error | null) =>
        doneErr ? reject(doneErr) : resolve(),
      );
    });
  });
}

/**
 * Startet den Self-Update-Deputy: einen kurzlebigen Zweit-Container aus dem NEUEN
 * Image, der den laufenden Containly-Container gegen das neue Image austauscht.
 * Nötig, weil ein Container sich nicht selbst neu erstellen kann (er schießt sich
 * beim `stop`/`remove` selbst ab). Der Deputy überlebt den Neustart des Haupt-
 * Containers und entfernt sich danach selbst (AutoRemove).
 */
async function spawnSelfUpdateDeputy(docker: Docker, selfId: string, image: string): Promise<void> {
  const deputy = await docker.createContainer({
    Image: image,
    // Läuft NICHT als Server, sondern als Einmal-Deputy.
    Cmd: ['node', 'server/dist/self-update.js'],
    Env: [`CONTAINLY_SELF_UPDATE=${selfId}`, `CONTAINLY_SELF_UPDATE_IMAGE=${image}`],
    Labels: { 'com.containly.role': 'self-update' },
    HostConfig: {
      Binds: ['/var/run/docker.sock:/var/run/docker.sock'],
      AutoRemove: true,
      RestartPolicy: { Name: 'no' },
    },
  });
  await deputy.start();
  logger.info({ selfId, image }, 'Self-Update-Deputy gestartet');
}

/**
 * Zieht das neue Image UND erstellt alle Container, die es nutzen, neu, damit sie
 * sofort das aktuelle Image verwenden. Der Container, in dem Containly SELBST läuft,
 * kann sich nicht selbst neu erstellen — dafür wird ein Deputy-Container gestartet
 * (`selfUpdate: true`). Liefert die Namen der direkt neu erstellten Container.
 */
export async function applyImageUpdate(
  endpoint: string,
  image: string,
): Promise<{ recreated: string[]; selfUpdate: boolean }> {
  const docker = getDocker(endpoint);
  // Betroffene Container VOR dem Pull ermitteln (danach wandert der Tag auf die neue ID).
  const affected = await docker.listContainers({ all: true, filters: { ancestor: [image] } });

  await pullImage(endpoint, image);

  const recreated: string[] = [];
  let selfUpdate = false;
  for (const c of affected) {
    // Der eigene Container wird über den Deputy ersetzt, nicht hier (Selbstmord-Schutz).
    if (isSelfContainer(c.Id)) {
      selfUpdate = true;
      continue;
    }
    try {
      recreated.push(await safeRecreateContainer(docker, c.Id, image, (m) => logger.debug(m)));
    } catch (err) {
      logger.warn({ err, container: c.Id }, 'Recreate fehlgeschlagen');
    }
  }

  if (selfUpdate) await spawnSelfUpdateDeputy(docker, SELF_ID, image);

  return { recreated, selfUpdate };
}

export async function removeImage(endpoint: string, id: string, force: boolean): Promise<void> {
  await getDocker(endpoint).getImage(id).remove({ force });
}

export async function tagImage(
  endpoint: string,
  id: string,
  repo: string,
  tag: string,
): Promise<void> {
  await getDocker(endpoint).getImage(id).tag({ repo, tag });
}

export async function pruneImages(endpoint: string): Promise<PruneResult> {
  // dangling=false → ALLE ungenutzten Images entfernen (nicht nur verwaiste/untagged),
  // also auch getaggte Images, die von keinem Container verwendet werden.
  const res = (await getDocker(endpoint).pruneImages({
    filters: JSON.stringify({ dangling: ['false'] }),
  })) as {
    ImagesDeleted?: { Deleted?: string; Untagged?: string }[];
    SpaceReclaimed?: number;
  };
  return {
    deleted: (res.ImagesDeleted ?? []).map((d) => d.Deleted ?? d.Untagged ?? '').filter(Boolean),
    spaceReclaimed: res.SpaceReclaimed ?? 0,
  };
}

/* ── Volumes ────────────────────────────────────────────────────────────── */
export async function listVolumes(endpoint: string): Promise<VolumeSummary[]> {
  const docker = getDocker(endpoint);
  const [{ Volumes }, containers] = await Promise.all([
    docker.listVolumes() as Promise<{ Volumes: RawVolume[] }>,
    docker.listContainers({ all: true }),
  ]);
  const used = new Set<string>();
  for (const c of containers) {
    for (const m of c.Mounts ?? []) if (m.Name) used.add(m.Name);
  }
  return (Volumes ?? []).map((v) => ({
    name: v.Name,
    driver: v.Driver,
    mountpoint: v.Mountpoint,
    createdAt: v.CreatedAt ?? null,
    scope: v.Scope ?? 'local',
    labels: v.Labels ?? {},
    inUse: used.has(v.Name),
  }));
}

interface RawVolume {
  Name: string;
  Driver: string;
  Mountpoint: string;
  CreatedAt?: string;
  Scope?: string;
  Labels?: Record<string, string>;
}

export async function createVolume(
  endpoint: string,
  name: string,
  driver: string,
): Promise<void> {
  await getDocker(endpoint).createVolume({ Name: name, Driver: driver });
}

export async function removeVolume(endpoint: string, name: string): Promise<void> {
  await getDocker(endpoint).getVolume(name).remove();
}

export async function pruneVolumes(endpoint: string): Promise<PruneResult> {
  const res = (await getDocker(endpoint).pruneVolumes()) as {
    VolumesDeleted?: string[];
    SpaceReclaimed?: number;
  };
  return { deleted: res.VolumesDeleted ?? [], spaceReclaimed: res.SpaceReclaimed ?? 0 };
}

/* ── Networks ───────────────────────────────────────────────────────────── */
const SYSTEM_NETWORKS = new Set(['bridge', 'host', 'none']);

export async function listNetworks(endpoint: string): Promise<NetworkSummary[]> {
  const nets = (await getDocker(endpoint).listNetworks()) as RawNetwork[];
  return nets.map((n) => ({
    id: n.Id,
    name: n.Name,
    driver: n.Driver ?? 'unknown',
    scope: n.Scope ?? 'local',
    internal: n.Internal ?? false,
    attachable: n.Attachable ?? false,
    subnet: n.IPAM?.Config?.[0]?.Subnet ?? null,
    containers: n.Containers ? Object.keys(n.Containers).length : 0,
    labels: n.Labels ?? {},
    system: SYSTEM_NETWORKS.has(n.Name),
  }));
}

interface RawNetwork {
  Id: string;
  Name: string;
  Driver?: string;
  Scope?: string;
  Internal?: boolean;
  Attachable?: boolean;
  IPAM?: { Config?: { Subnet?: string }[] };
  Containers?: Record<string, unknown>;
  Labels?: Record<string, string>;
}

export async function createNetwork(
  endpoint: string,
  opts: { name: string; driver: string; internal: boolean },
): Promise<void> {
  await getDocker(endpoint).createNetwork({
    Name: opts.name,
    Driver: opts.driver,
    Internal: opts.internal,
  });
}

export async function removeNetwork(endpoint: string, id: string): Promise<void> {
  await getDocker(endpoint).getNetwork(id).remove();
}

export async function pruneNetworks(endpoint: string): Promise<PruneResult> {
  const res = (await getDocker(endpoint).pruneNetworks()) as { NetworksDeleted?: string[] };
  return { deleted: res.NetworksDeleted ?? [], spaceReclaimed: 0 };
}

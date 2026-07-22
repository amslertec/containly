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
import { isOwnContainer, safeRecreateContainer } from './recreate.js';
import { authConfigForImage } from '../services/registry.js';
import { logger } from '../logger.js';

/**
 * Ermittelt die eigene Container-ID als schnelle Vorprüfung. WICHTIG: gezielt nach der
 * Container-ID suchen (cgroup-Pfad `…/docker-<id>` bzw. mountinfo `/containers/<id>/`),
 * NICHT die erste beliebige 64-hex nehmen — overlay2-Layer-Hashes sind ebenfalls 64-hex
 * und lieferten auf manchen Hosts eine falsche ID (Ursache des 0.1.9-Selbstmord-Bugs).
 * Verlässlich abgesichert wird die Erkennung ohnehin über den Hostnamen (siehe
 * `isOwnContainer` in recreate.ts). Bei Nichtauffinden: Hostname (= Kurz-ID by default).
 */
function readSelfContainerId(): string {
  try {
    const m = readFileSync('/proc/self/mountinfo', 'utf8').match(/\/containers\/([0-9a-f]{64})/);
    if (m) return m[1]!;
  } catch {
    /* nicht vorhanden */
  }
  try {
    const m = readFileSync('/proc/self/cgroup', 'utf8').match(/[0-9a-f]{64}/);
    if (m) return m[0];
  } catch {
    /* nicht vorhanden */
  }
  return os.hostname();
}
const SELF_ID = readSelfContainerId();

/** Schnelle ID-basierte Vorprüfung (verlässlich bestätigt via Hostname in applyImageUpdate). */
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
  let selfContainerId: string | null = null;
  for (const c of affected) {
    // Jeden Kandidaten inspizieren und den EIGENEN Container verlässlich über den
    // Hostnamen erkennen (ID-Vorprüfung als billiger Schnellpfad). Der eigene Container
    // wird NICHT hier ersetzt, sondern über den Deputy — sonst Selbstmord des Prozesses.
    const info = await docker.getContainer(c.Id).inspect().catch(() => null);
    if (info && (isOwnContainer(info) || isSelfContainer(c.Id))) {
      selfContainerId = c.Id; // die ECHTE ID (nicht die evtl. falsche SELF_ID)
      continue;
    }
    try {
      recreated.push(await safeRecreateContainer(docker, c.Id, image, (m) => logger.debug(m)));
    } catch (err) {
      logger.warn({ err, container: c.Id }, 'Recreate fehlgeschlagen');
    }
  }

  // Deputy mit der real ermittelten Container-ID starten (robust gegen falsche SELF_ID).
  if (selfContainerId) await spawnSelfUpdateDeputy(docker, selfContainerId, image);

  return { recreated, selfUpdate: !!selfContainerId };
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
  const docker = getDocker(endpoint);
  // `listNetworks` liefert das Container-Feld NICHT (nur `inspect` tut das). Daher die
  // Zuordnung aus der Container-Liste ableiten: je Container die verbundenen Netzwerk-IDs.
  const [nets, containers] = await Promise.all([
    docker.listNetworks() as Promise<RawNetwork[]>,
    docker.listContainers({ all: true }) as Promise<RawContainerNet[]>,
  ]);
  const countById = new Map<string, number>();
  for (const c of containers) {
    for (const net of Object.values(c.NetworkSettings?.Networks ?? {})) {
      const id = net?.NetworkID;
      if (id) countById.set(id, (countById.get(id) ?? 0) + 1);
    }
  }
  return nets.map((n) => ({
    id: n.Id,
    name: n.Name,
    driver: n.Driver ?? 'unknown',
    scope: n.Scope ?? 'local',
    internal: n.Internal ?? false,
    attachable: n.Attachable ?? false,
    subnet: n.IPAM?.Config?.[0]?.Subnet ?? null,
    containers: countById.get(n.Id) ?? (n.Containers ? Object.keys(n.Containers).length : 0),
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

interface RawContainerNet {
  NetworkSettings?: { Networks?: Record<string, { NetworkID?: string } | undefined> };
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

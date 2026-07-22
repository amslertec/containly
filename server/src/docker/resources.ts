import type Docker from 'dockerode';
import type {
  ImageSummary,
  NetworkSummary,
  PruneResult,
  VolumeSummary,
} from '@containly/shared';
import { getDocker } from './endpoints.js';
import { authConfigForImage } from '../services/registry.js';

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
 * Erstellt einen Container mit identischer Konfiguration neu, aber mit `newImage`
 * (Watchtower-Stil). Netzwerke/Volumes/Env/Labels/HostConfig bleiben erhalten.
 */
async function recreateContainer(docker: Docker, id: string, newImage: string): Promise<string> {
  const container = docker.getContainer(id);
  const info = await container.inspect();
  const name = info.Name.replace(/^\//, '');
  const wasRunning = !!info.State?.Running;
  const shortId = info.Id.slice(0, 12);

  // Netzwerke: Aliase + IPAM erhalten, Laufzeit-Felder (IPs) verwerfen. createContainer
  // akzeptiert nur EIN Netzwerk — weitere danach verbinden.
  const nets = info.NetworkSettings?.Networks ?? {};
  const netNames = Object.keys(nets);
  const cleanEndpoint = (n: (typeof nets)[string]) => ({
    Aliases: (n.Aliases ?? []).filter((a: string) => a && a !== shortId && !info.Id.startsWith(a)),
    IPAMConfig: n.IPAMConfig ?? undefined,
  });

  const createOpts: Parameters<Docker['createContainer']>[0] = {
    name,
    Image: newImage,
    Hostname: info.Config.Hostname,
    Domainname: info.Config.Domainname,
    User: info.Config.User,
    Env: info.Config.Env,
    Cmd: info.Config.Cmd,
    Entrypoint: info.Config.Entrypoint,
    Labels: info.Config.Labels,
    WorkingDir: info.Config.WorkingDir,
    ExposedPorts: info.Config.ExposedPorts,
    Volumes: info.Config.Volumes,
    HostConfig: info.HostConfig,
    ...(netNames[0]
      ? { NetworkingConfig: { EndpointsConfig: { [netNames[0]]: cleanEndpoint(nets[netNames[0]]!) } } }
      : {}),
  };

  if (wasRunning) await container.stop().catch(() => undefined);
  await container.remove({ force: true });

  const created = await docker.createContainer(createOpts);
  // Weitere Netzwerke (ab dem zweiten) verbinden.
  for (let i = 1; i < netNames.length; i++) {
    const nm = netNames[i]!;
    await docker
      .getNetwork(nm)
      .connect({ Container: created.id, EndpointConfig: cleanEndpoint(nets[nm]!) })
      .catch(() => undefined);
  }
  if (wasRunning) await created.start();
  return name;
}

/**
 * Zieht das neue Image UND erstellt alle Container, die es nutzen, neu, damit sie
 * sofort das aktuelle Image verwenden. Liefert die Namen der neu erstellten Container.
 */
export async function applyImageUpdate(endpoint: string, image: string): Promise<string[]> {
  const docker = getDocker(endpoint);
  // Betroffene Container VOR dem Pull ermitteln (danach wandert der Tag auf die neue ID).
  const affected = await docker.listContainers({ all: true, filters: { ancestor: [image] } });
  const ids = affected.map((c) => c.Id);

  await pullImage(endpoint, image);

  const recreated: string[] = [];
  for (const id of ids) {
    try {
      recreated.push(await recreateContainer(docker, id, image));
    } catch {
      /* einzelner Recreate-Fehler bricht den Rest nicht ab */
    }
  }
  return recreated;
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

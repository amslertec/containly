import type { Duplex } from 'node:stream';
import type Docker from 'dockerode';
import type { ContainerAction, ContainerInspect, ContainerStats, ContainerSummary } from '@containly/shared';
import { getDocker } from './endpoints.js';

function mapPorts(ports: Docker.Port[] | undefined): ContainerSummary['ports'] {
  if (!ports) return [];
  return ports.map((p) => ({
    ip: p.IP,
    privatePort: p.PrivatePort,
    publicPort: p.PublicPort,
    type: p.Type,
  }));
}

export async function listContainers(endpointId: string): Promise<ContainerSummary[]> {
  const docker = getDocker(endpointId);
  const list = await docker.listContainers({ all: true });
  return list.map((c) => {
    const labels = c.Labels ?? {};
    return {
      id: c.Id,
      names: (c.Names ?? []).map((n) => n.replace(/^\//, '')),
      image: c.Image,
      imageId: c.ImageID,
      command: c.Command,
      createdAt: c.Created,
      state: c.State,
      status: c.Status,
      ports: mapPorts(c.Ports),
      labels,
      composeProject: labels['com.docker.compose.project'] ?? null,
      restartCount: null,
    } satisfies ContainerSummary;
  });
}

export async function inspectContainer(
  endpointId: string,
  id: string,
): Promise<ContainerInspect> {
  const docker = getDocker(endpointId);
  const raw = await docker.getContainer(id).inspect();
  const net = raw.NetworkSettings?.Networks ?? {};
  const networks = Object.entries(net).map(([name, n]) => ({
    name,
    ipAddress: n.IPAddress ?? '',
    gateway: n.Gateway ?? '',
  }));

  const ports: ContainerInspect['ports'] = [];
  const portBindings = raw.NetworkSettings?.Ports ?? {};
  for (const [key, bindings] of Object.entries(portBindings)) {
    const parts = key.split('/');
    const priv = Number.parseInt(parts[0] ?? '0', 10);
    const type = parts[1] ?? 'tcp';
    if (bindings && bindings.length > 0) {
      for (const b of bindings) {
        ports.push({ ip: b.HostIp, privatePort: priv, publicPort: Number(b.HostPort), type });
      }
    } else {
      ports.push({ privatePort: priv, type });
    }
  }

  return {
    id: raw.Id,
    name: raw.Name.replace(/^\//, ''),
    image: raw.Config?.Image ?? '',
    state: {
      status: raw.State?.Status ?? 'unknown',
      running: raw.State?.Running ?? false,
      paused: raw.State?.Paused ?? false,
      restarting: raw.State?.Restarting ?? false,
      startedAt: raw.State?.StartedAt ?? '',
      finishedAt: raw.State?.FinishedAt ?? '',
      exitCode: raw.State?.ExitCode ?? 0,
      health: raw.State?.Health?.Status ?? null,
      restartCount: raw.RestartCount ?? 0,
    },
    createdAt: raw.Created ?? '',
    restartPolicy: raw.HostConfig?.RestartPolicy?.Name ?? 'no',
    env: raw.Config?.Env ?? [],
    mounts: (raw.Mounts ?? []).map((m) => ({
      type: m.Type ?? 'bind',
      source: m.Source ?? '',
      destination: m.Destination ?? '',
      rw: m.RW ?? false,
    })),
    networks,
    ports,
    labels: raw.Config?.Labels ?? {},
    raw,
  };
}

export async function containerAction(
  endpointId: string,
  id: string,
  action: ContainerAction,
): Promise<void> {
  const container = getDocker(endpointId).getContainer(id);
  switch (action) {
    case 'start':
      await container.start();
      break;
    case 'stop':
      await container.stop();
      break;
    case 'restart':
      await container.restart();
      break;
    case 'pause':
      await container.pause();
      break;
    case 'unpause':
      await container.unpause();
      break;
    case 'kill':
      await container.kill();
      break;
  }
}

export async function removeContainer(
  endpointId: string,
  id: string,
  opts: { force: boolean; volumes: boolean },
): Promise<void> {
  await getDocker(endpointId).getContainer(id).remove({ force: opts.force, v: opts.volumes });
}

/** Log-Stream (follow). Aufrufer ist für Cleanup verantwortlich. */
export async function getLogStream(
  endpointId: string,
  id: string,
  opts: { tail: number },
): Promise<NodeJS.ReadableStream> {
  const container = getDocker(endpointId).getContainer(id);
  return container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    timestamps: true,
    tail: opts.tail,
  }) as unknown as Promise<NodeJS.ReadableStream>;
}

/** Stats-Stream (Rohdaten von Docker; Umrechnung in Prozent erfolgt hier). */
export async function getStatsStream(endpointId: string, id: string): Promise<NodeJS.ReadableStream> {
  const container = getDocker(endpointId).getContainer(id);
  return container.stats({ stream: true }) as unknown as Promise<NodeJS.ReadableStream>;
}

interface RawStats {
  cpu_stats: CpuStats;
  precpu_stats: CpuStats;
  memory_stats: { usage?: number; limit?: number; stats?: { cache?: number } };
  networks?: Record<string, { rx_bytes: number; tx_bytes: number }>;
  blkio_stats?: { io_service_bytes_recursive?: { op: string; value: number }[] };
  pids_stats?: { current?: number };
}
interface CpuStats {
  cpu_usage: { total_usage: number; percpu_usage?: number[] };
  system_cpu_usage?: number;
  online_cpus?: number;
}

/** Rechnet Docker-Rohstats in ein kompaktes, UI-freundliches Format um. */
export function parseStats(id: string, raw: RawStats): ContainerStats {
  const cpuDelta = raw.cpu_stats.cpu_usage.total_usage - raw.precpu_stats.cpu_usage.total_usage;
  const sysDelta = (raw.cpu_stats.system_cpu_usage ?? 0) - (raw.precpu_stats.system_cpu_usage ?? 0);
  const cpus =
    raw.cpu_stats.online_cpus ?? raw.cpu_stats.cpu_usage.percpu_usage?.length ?? 1;
  const cpuPercent = sysDelta > 0 && cpuDelta > 0 ? (cpuDelta / sysDelta) * cpus * 100 : 0;

  const memCache = raw.memory_stats.stats?.cache ?? 0;
  const memUsage = Math.max(0, (raw.memory_stats.usage ?? 0) - memCache);
  const memLimit = raw.memory_stats.limit ?? 0;

  let rx = 0;
  let tx = 0;
  for (const net of Object.values(raw.networks ?? {})) {
    rx += net.rx_bytes;
    tx += net.tx_bytes;
  }

  let blockRead = 0;
  let blockWrite = 0;
  for (const io of raw.blkio_stats?.io_service_bytes_recursive ?? []) {
    if (io.op.toLowerCase() === 'read') blockRead += io.value;
    if (io.op.toLowerCase() === 'write') blockWrite += io.value;
  }

  return {
    id,
    cpuPercent: Number(cpuPercent.toFixed(2)),
    memoryUsage: memUsage,
    memoryLimit: memLimit,
    memoryPercent: memLimit > 0 ? Number(((memUsage / memLimit) * 100).toFixed(2)) : 0,
    netRx: rx,
    netTx: tx,
    blockRead,
    blockWrite,
    pids: raw.pids_stats?.current ?? 0,
    timestamp: Date.now(),
  };
}

/** Exec-Session für die Terminal-Konsole. */
export async function createExec(
  endpointId: string,
  id: string,
  cmd: string[],
): Promise<{ stream: Duplex; resize: (w: number, h: number) => Promise<void> }> {
  const container = getDocker(endpointId).getContainer(id);
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
  });
  const stream = (await exec.start({ hijack: true, stdin: true, Tty: true })) as unknown as Duplex;
  return {
    stream,
    resize: async (w: number, h: number) => {
      await exec.resize({ w, h });
    },
  };
}

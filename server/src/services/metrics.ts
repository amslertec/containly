import type { MetricPoint } from '@containly/shared';
import { db } from '../db/index.js';
import { listEndpoints, getDocker } from '../docker/endpoints.js';
import { listContainers, parseStats } from '../docker/containers.js';
import { logger } from '../logger.js';

/**
 * Ressourcen-Sampler: fragt periodisch die CPU/RAM-Auslastung aller laufenden Container
 * je Online-Endpoint per one-shot Docker-Stats ab und schreibt sie als Zeitreihe in die
 * `metrics`-Tabelle. Alte Punkte (> RETENTION_MS) werden beim Sampeln aufgeräumt.
 */

const SAMPLE_INTERVAL_MS = 60_000;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 Tage
const MAX_POINTS = 200; // Downsampling-Ziel für die Chart-Antwort

const insertStmt = db.prepare(
  'INSERT INTO metrics (endpoint, container_id, ts, cpu, mem, mem_bytes) VALUES (?, ?, ?, ?, ?, ?)',
);

interface RawStats {
  cpu_stats: unknown;
  precpu_stats: unknown;
  memory_stats: unknown;
}

async function sampleOnce(): Promise<void> {
  const now = Date.now();
  for (const ep of listEndpoints()) {
    if (ep.status !== 'online') continue;
    let containers;
    try {
      containers = await listContainers(ep.id);
    } catch (err) {
      logger.debug({ err, endpoint: ep.id }, 'Metrics: Container-Liste fehlgeschlagen');
      continue;
    }
    const docker = getDocker(ep.id);
    for (const c of containers) {
      if (c.state !== 'running') continue;
      try {
        const raw = (await docker.getContainer(c.id).stats({ stream: false })) as unknown as RawStats;
        const s = parseStats(c.id, raw as Parameters<typeof parseStats>[1]);
        insertStmt.run(ep.id, c.id, now, s.cpuPercent, s.memoryPercent, s.memoryUsage);
      } catch (err) {
        logger.debug({ err, container: c.id }, 'Metrics: Stats fehlgeschlagen');
      }
    }
  }
  // Retention: alte Punkte entfernen.
  try {
    db.prepare('DELETE FROM metrics WHERE ts < ?').run(now - RETENTION_MS);
  } catch {
    /* ignorieren */
  }
}

let running = false;

/** Startet den periodischen Sampler (alle 60 s). */
export function startMetricsSampler(): NodeJS.Timeout {
  const tick = (): void => {
    if (running) return;
    running = true;
    void sampleOnce()
      .catch((err) => logger.debug({ err }, 'Metrics-Sampler-Tick fehlgeschlagen'))
      .finally(() => {
        running = false;
      });
  };
  const timer = setInterval(tick, SAMPLE_INTERVAL_MS);
  timer.unref();
  return timer;
}

interface MetricRow {
  ts: number;
  cpu: number;
  mem: number;
}

/**
 * Liefert die Zeitreihe eines Containers über die letzten `rangeMs`, aufsteigend nach ts.
 * Bei sehr vielen Punkten wird per Zeit-Bucket gemittelt (Ziel ≈ MAX_POINTS Punkte).
 */
export function getMetrics(endpoint: string, containerId: string, rangeMs: number): MetricPoint[] {
  const since = Date.now() - rangeMs;
  const rows = db
    .prepare('SELECT ts, cpu, mem FROM metrics WHERE endpoint = ? AND container_id = ? AND ts >= ? ORDER BY ts ASC')
    .all(endpoint, containerId, since) as MetricRow[];
  if (rows.length <= MAX_POINTS) {
    return rows.map((r) => ({ ts: r.ts, cpu: r.cpu, mem: r.mem }));
  }
  // Downsampling: in MAX_POINTS Zeit-Buckets mitteln.
  const bucketMs = rangeMs / MAX_POINTS;
  const buckets = new Map<number, { ts: number; cpu: number; mem: number; n: number }>();
  for (const r of rows) {
    const key = Math.floor((r.ts - since) / bucketMs);
    const b = buckets.get(key) ?? { ts: 0, cpu: 0, mem: 0, n: 0 };
    b.ts += r.ts;
    b.cpu += r.cpu;
    b.mem += r.mem;
    b.n += 1;
    buckets.set(key, b);
  }
  return [...buckets.values()]
    .map((b) => ({ ts: Math.round(b.ts / b.n), cpu: b.cpu / b.n, mem: b.mem / b.n }))
    .sort((a, b) => a.ts - b.ts);
}

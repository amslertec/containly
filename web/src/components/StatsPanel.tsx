import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Activity, Cpu, HardDrive, MemoryStick, Network } from 'lucide-react';
import type { ContainerStats, MetricsResponse, MetricPoint } from '@containly/shared';
import { wsUrl, api } from '../lib/api';
import { Card } from './ui/primitives';
import { formatBytes, formatPercent, cn } from '../lib/utils';

const HISTORY = 40;

const RANGES = [
  { key: '1h', ms: 3_600_000 },
  { key: '6h', ms: 6 * 3_600_000 },
  { key: '24h', ms: 24 * 3_600_000 },
  { key: '7d', ms: 7 * 24 * 3_600_000 },
] as const;

export function StatsPanel({
  endpoint,
  id,
  running,
}: {
  endpoint: string;
  id: string;
  running: boolean;
}) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<ContainerStats | null>(null);
  const [cpuHist, setCpuHist] = useState<number[]>([]);
  const [memHist, setMemHist] = useState<number[]>([]);

  useEffect(() => {
    if (!running) return;
    const ws = new WebSocket(
      wsUrl(`/api/containers/${encodeURIComponent(id)}/stats/stream?endpoint=${encodeURIComponent(endpoint)}`),
    );
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as { type: string; data?: ContainerStats };
        if (msg.type === 'stats' && msg.data) {
          setStats(msg.data);
          setCpuHist((h) => [...h, msg.data!.cpuPercent].slice(-HISTORY));
          setMemHist((h) => [...h, msg.data!.memoryPercent].slice(-HISTORY));
        }
      } catch {
        /* ignore */
      }
    };
    return () => ws.close();
  }, [endpoint, id, running]);

  return (
    <div className="space-y-4">
      {!running ? (
        <Card className="p-8 text-center text-sm text-muted">{t('containers.filterStopped')}</Card>
      ) : !stats ? (
        <Card className="p-8 text-center text-sm text-muted">{t('stats.waiting')}</Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile icon={<Cpu className="h-4 w-4" />} label={t('stats.cpu')} value={formatPercent(stats.cpuPercent)}>
              <Sparkline data={cpuHist} color="var(--w-primary)" max={100} />
            </Tile>
            <Tile
              icon={<MemoryStick className="h-4 w-4" />}
              label={t('stats.memory')}
              value={formatPercent(stats.memoryPercent)}
              sub={`${formatBytes(stats.memoryUsage)} / ${formatBytes(stats.memoryLimit)}`}
            >
              <Sparkline data={memHist} color="var(--w-pause)" max={100} />
            </Tile>
            <Tile
              icon={<Network className="h-4 w-4" />}
              label={t('stats.network')}
              value={formatBytes(stats.netRx + stats.netTx)}
              sub={`↓ ${formatBytes(stats.netRx)}  ↑ ${formatBytes(stats.netTx)}`}
            />
            <Tile
              icon={<HardDrive className="h-4 w-4" />}
              label={t('stats.blockIo')}
              value={formatBytes(stats.blockRead + stats.blockWrite)}
              sub={`R ${formatBytes(stats.blockRead)}  W ${formatBytes(stats.blockWrite)}`}
            />
          </div>
          <Card className="flex items-center gap-2 px-4 py-3 text-sm text-muted">
            <Activity className="h-4 w-4 text-primary" />
            {t('stats.pids')}: <span className="font-mono text-ink tabular">{stats.pids}</span>
          </Card>
        </>
      )}

      <HistorySection endpoint={endpoint} id={id} />
    </div>
  );
}

/* ── Verlauf (Zeitreihe aus der metrics-Tabelle) ──────────────────────────── */
function HistorySection({ endpoint, id }: { endpoint: string; id: string }) {
  const { t } = useTranslation();
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[0]);

  const { data } = useQuery({
    queryKey: ['metrics', endpoint, id, range.ms],
    queryFn: () =>
      api.get<MetricsResponse>(
        `/api/containers/${encodeURIComponent(id)}/metrics?endpoint=${encodeURIComponent(endpoint)}&range=${range.ms}`,
      ),
    select: (d) => d.points,
    refetchInterval: 60_000,
  });
  const points = data ?? [];

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" /> {t('metrics.history')}
        </span>
        <div className="inline-flex rounded-md border border-border p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r)}
              className={cn(
                'rounded px-2.5 py-1 text-[12px] font-medium transition-colors',
                range.key === r.key ? 'bg-primary text-primary-ink' : 'text-muted hover:text-ink',
              )}
            >
              {t(`metrics.range${r.key}`)}
            </button>
          ))}
        </div>
      </div>
      {points.length < 2 ? (
        <p className="py-8 text-center text-sm text-muted">{t('metrics.noData')}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <LineChart label={t('metrics.cpu')} points={points} pick={(p) => p.cpu} color="var(--w-primary)" />
          <LineChart label={t('metrics.memory')} points={points} pick={(p) => p.mem} color="var(--w-pause)" />
        </div>
      )}
    </Card>
  );
}

function LineChart({
  label,
  points,
  pick,
  color,
}: {
  label: string;
  points: MetricPoint[];
  pick: (p: MetricPoint) => number;
  color: string;
}) {
  const w = 300;
  const h = 90;
  const values = points.map(pick);
  const peak = Math.max(5, ...values);
  const t0 = points[0]!.ts;
  const span = Math.max(1, points[points.length - 1]!.ts - t0);
  const line = points
    .map((p, i) => {
      const x = ((p.ts - t0) / span) * w;
      const y = h - (pick(p) / peak) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;
  const cur = values[values.length - 1] ?? 0;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[12px] text-muted">{label}</span>
        <span className="font-mono text-[12px] text-ink tabular">{cur.toFixed(1)} %</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-24 w-full">
        <path d={area} fill={color} opacity={0.12} />
        <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  sub,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted">
        {icon}
        <span className="eyebrow">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-ink tabular" style={{ fontFamily: 'var(--font-display)' }}>
        {value}
      </div>
      {sub && <div className="mt-0.5 font-mono text-[11px] text-faint tabular">{sub}</div>}
      {children && <div className="mt-2">{children}</div>}
    </Card>
  );
}

function Sparkline({ data, color, max }: { data: number[]; color: string; max: number }) {
  if (data.length < 2) return <div className="h-8" />;
  const w = 100;
  const h = 32;
  const step = w / (HISTORY - 1);
  const points = data
    .map((v, i) => {
      const x = i * step + (w - (data.length - 1) * step);
      const y = h - Math.min(v, max) / max * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-8 w-full">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

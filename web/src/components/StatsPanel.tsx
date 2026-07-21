import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Cpu, HardDrive, MemoryStick, Network } from 'lucide-react';
import type { ContainerStats } from '@containly/shared';
import { wsUrl } from '../lib/api';
import { Card } from './ui/primitives';
import { formatBytes, formatPercent } from '../lib/utils';

const HISTORY = 40;

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

  if (!running) {
    return (
      <Card className="p-8 text-center text-sm text-muted">{t('containers.filterStopped')}</Card>
    );
  }
  if (!stats) {
    return <Card className="p-8 text-center text-sm text-muted">{t('stats.waiting')}</Card>;
  }

  return (
    <div className="space-y-4">
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

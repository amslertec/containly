import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useQueries } from '@tanstack/react-query';
import { Boxes, Cpu, Layers, MemoryStick, Server, ShieldAlert } from 'lucide-react';
import type { Endpoint } from '@containly/shared';
import { useEndpoints } from '../app/EndpointContext';
import { api } from '../lib/api';
import { Page, PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/primitives';
import { LoadingState } from '../components/States';
import { formatBytes, cn } from '../lib/utils';

interface HostInfo {
  info: {
    serverVersion: string | null;
    containers: number;
    containersRunning: number;
    images: number;
    ncpu: number;
    memTotal: number;
    operatingSystem: string | null;
  };
}

export function DashboardPage() {
  const { t } = useTranslation();
  const { endpoints, isLoading, setSelected } = useEndpoints();

  const results = useQueries({
    queries: endpoints.map((e) => ({
      queryKey: ['system-info', e.id],
      queryFn: () => api.get<HostInfo>(`/api/system/info?endpoint=${encodeURIComponent(e.id)}`),
      enabled: e.status === 'online',
      staleTime: 15_000,
      refetchInterval: 20_000,
      retry: false,
    })),
  });

  const infoById = useMemo(() => {
    const map = new Map<string, HostInfo['info']>();
    endpoints.forEach((e, i) => {
      const d = results[i]?.data;
      if (d) map.set(e.id, d.info);
    });
    return map;
  }, [endpoints, results]);

  const agg = useMemo(() => {
    let running = 0;
    let total = 0;
    let images = 0;
    let cpu = 0;
    let mem = 0;
    for (const info of infoById.values()) {
      running += info.containersRunning;
      total += info.containers;
      images += info.images;
      cpu += info.ncpu;
      mem += info.memTotal;
    }
    const online = endpoints.filter((e) => e.status === 'online').length;
    return { running, total, images, cpu, mem, online, hosts: endpoints.length };
  }, [infoById, endpoints]);

  const warnings = useMemo(() => {
    const w: { key: string; label: string }[] = [];
    for (const e of endpoints) {
      if (e.status === 'offline' || e.status === 'unauthorized') {
        w.push({ key: e.id, label: `${e.name}: ${t('dashboard.endpointOffline')}` });
      }
    }
    return w;
  }, [endpoints, t]);

  if (isLoading) return <Page><LoadingState /></Page>;

  return (
    <Page>
      <PageHeader eyebrow={t('app.name')} title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Stat icon={<Server className="h-4 w-4" />} label={t('dashboard.hosts')} value={`${agg.online}/${agg.hosts}`} />
        <Stat icon={<Boxes className="h-4 w-4" />} label={t('dashboard.containersRunning')} value={agg.running} accent />
        <Stat icon={<Boxes className="h-4 w-4" />} label={t('dashboard.containersTotal')} value={agg.total} />
        <Stat icon={<Layers className="h-4 w-4" />} label={t('dashboard.images')} value={agg.images} />
        <Stat icon={<Cpu className="h-4 w-4" />} label={t('dashboard.cpuCores')} value={agg.cpu} />
        <Stat icon={<MemoryStick className="h-4 w-4" />} label={t('dashboard.memory')} value={formatBytes(agg.mem)} />
      </div>

      {/* Warnungen */}
      <div className="mt-6">
        <span className="eyebrow">{t('dashboard.warnings')}</span>
        {warnings.length === 0 ? (
          <Card className="mt-2 flex items-center gap-2 px-4 py-3 text-sm text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: 'var(--w-run)' }} />
            {t('dashboard.noWarnings')}
          </Card>
        ) : (
          <div className="mt-2 space-y-2">
            {warnings.map((w) => (
              <Card key={w.key} className="flex items-center gap-2 border-warn-soft px-4 py-3 text-sm text-ink">
                <ShieldAlert className="h-4 w-4 text-warn" />
                {w.label}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Host-Karten */}
      <div className="mt-6">
        <span className="eyebrow">{t('endpoint.title')}</span>
        <div className="mt-2 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {endpoints.map((e) => (
            <HostCard key={e.id} endpoint={e} info={infoById.get(e.id)} onOpen={() => setSelected(e.id)} />
          ))}
        </div>
      </div>
    </Page>
  );
}

function Stat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted">
        {icon}
        <span className="eyebrow">{label}</span>
      </div>
      <div
        className={cn('mt-2 text-3xl font-bold tabular', accent ? 'text-primary' : 'text-ink')}
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {value}
      </div>
    </Card>
  );
}

function HostCard({
  endpoint,
  info,
  onOpen,
}: {
  endpoint: Endpoint;
  info?: HostInfo['info'];
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const statusColor =
    endpoint.status === 'online'
      ? 'var(--w-run)'
      : endpoint.status === 'unauthorized'
        ? 'var(--w-danger)'
        : 'var(--w-stop)';
  return (
    <Link to="/containers" onClick={onOpen}>
      <Card className="p-4 transition-colors hover:border-border-strong">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: statusColor }} />
            <span className="font-semibold text-ink">{endpoint.name}</span>
          </div>
          <span className="font-mono text-[11px] text-faint">
            {endpoint.dockerVersion ?? t(`endpoint.${endpoint.status}`)}
          </span>
        </div>
        {info ? (
          <div className="mt-3 flex gap-4 text-sm">
            <span className="text-muted">
              <span className="font-mono text-ink tabular">{info.containersRunning}</span>/
              <span className="font-mono text-muted tabular">{info.containers}</span>{' '}
              {t('nav.containers')}
            </span>
            <span className="text-muted">
              <span className="font-mono text-ink tabular">{info.images}</span> {t('nav.images')}
            </span>
          </div>
        ) : (
          <p className="mt-3 text-sm text-faint">{t(`endpoint.${endpoint.status}`)}</p>
        )}
        <p className="mt-2 truncate text-[11px] text-faint">{info?.operatingSystem ?? '—'}</p>
      </Card>
    </Link>
  );
}

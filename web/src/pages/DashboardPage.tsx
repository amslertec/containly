import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useQueries } from '@tanstack/react-query';
import {
  ArrowUpCircle,
  Boxes,
  CheckCircle2,
  Cpu,
  Layers,
  MemoryStick,
  RotateCw,
  Server,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react';
import type {
  ContainerSummary,
  Endpoint,
  UpdatesResponse,
  VulnScanState,
} from '@containly/shared';
import { useEndpoints } from '../app/EndpointContext';
import { api } from '../lib/api';
import { Page, PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/primitives';
import { LoadingState } from '../components/States';
import { formatBytes, shortId, cn } from '../lib/utils';

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

type ScopedContainer = ContainerSummary & { _endpointId: string; _endpointName: string };

export function DashboardPage() {
  const { t } = useTranslation();
  const { endpoints, isLoading, setSelected } = useEndpoints();
  const online = useMemo(() => endpoints.filter((e) => e.status === 'online'), [endpoints]);

  // Host-Systeminfo (pro Endpoint).
  const infoResults = useQueries({
    queries: endpoints.map((e) => ({
      queryKey: ['system-info', e.id],
      queryFn: () => api.get<HostInfo>(`/api/system/info?endpoint=${encodeURIComponent(e.id)}`),
      enabled: e.status === 'online',
      staleTime: 15_000,
      refetchInterval: 20_000,
      retry: false,
    })),
  });

  // Container ALLER Online-Hosts (für „Braucht Aufmerksamkeit" + „Top nach Neustarts").
  const containerResults = useQueries({
    queries: online.map((e) => ({
      queryKey: ['containers', e.id],
      queryFn: () => api.get<{ containers: ContainerSummary[] }>(`/api/containers?endpoint=${encodeURIComponent(e.id)}`),
      staleTime: 8_000,
      refetchInterval: 15_000,
      retry: false,
      select: (d: { containers: ContainerSummary[] }): ScopedContainer[] =>
        d.containers.map((c) => ({ ...c, _endpointId: e.id, _endpointName: e.name })),
    })),
  });

  // Offene Updates + kritische CVEs (aus dem serverseitigen Cache, keine Registry-Last).
  const updateResults = useQueries({
    queries: online.map((e) => ({
      queryKey: ['updates', e.id],
      queryFn: () => api.get<UpdatesResponse>(`/api/updates?endpoint=${encodeURIComponent(e.id)}`),
      staleTime: 60_000,
      retry: false,
    })),
  });
  const vulnResults = useQueries({
    queries: online.map((e) => ({
      queryKey: ['vulns', e.id],
      queryFn: () => api.get<VulnScanState>(`/api/images/vulnerabilities?endpoint=${encodeURIComponent(e.id)}`),
      staleTime: 60_000,
      retry: false,
    })),
  });

  const infoById = useMemo(() => {
    const map = new Map<string, HostInfo['info']>();
    endpoints.forEach((e, i) => {
      const d = infoResults[i]?.data;
      if (d) map.set(e.id, d.info);
    });
    return map;
  }, [endpoints, infoResults]);

  const containers = useMemo(
    () => containerResults.flatMap((r) => r.data ?? []),
    [containerResults],
  );

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
    return {
      running,
      total,
      images,
      cpu,
      mem,
      online: online.length,
      hosts: endpoints.length,
    };
  }, [infoById, endpoints, online]);

  const isUnhealthy = (s: string): boolean => /\(unhealthy\)/i.test(s);
  const unhealthyOrStopped = useMemo(
    () => containers.filter((c) => c.state === 'exited' || c.state === 'dead' || isUnhealthy(c.status)),
    [containers],
  );
  const updatesCount = useMemo(
    () => updateResults.reduce((n, r) => n + (r.data?.items.filter((i) => i.updateAvailable).length ?? 0), 0),
    [updateResults],
  );
  const criticalImages = useMemo(
    () => vulnResults.reduce((n, r) => n + (r.data?.vulns.filter((v) => v.critical + v.high > 0).length ?? 0), 0),
    [vulnResults],
  );
  const offlineEndpoints = useMemo(
    () => endpoints.filter((e) => e.status === 'offline' || e.status === 'unauthorized'),
    [endpoints],
  );

  // „Top-Verbraucher": Live-CPU/RAM sind nur per Container-WebSocket verfügbar (kein
  // Bulk-Endpoint), daher als ehrlicher Ersatz die Container mit den meisten Neustarts.
  const topRestarts = useMemo(
    () =>
      [...containers]
        .filter((c) => (c.restartCount ?? 0) > 0)
        .sort((a, b) => (b.restartCount ?? 0) - (a.restartCount ?? 0))
        .slice(0, 5),
    [containers],
  );

  const hasAttention =
    unhealthyOrStopped.length > 0 || updatesCount > 0 || criticalImages > 0 || offlineEndpoints.length > 0;

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

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Braucht Aufmerksamkeit */}
        <div>
          <span className="eyebrow">{t('dashboard.attention')}</span>
          {!hasAttention ? (
            <Card className="mt-2 flex items-center gap-2 px-4 py-3 text-sm text-muted">
              <CheckCircle2 className="h-4 w-4 text-run" />
              {t('dashboard.allGood')}
            </Card>
          ) : (
            <div className="mt-2 space-y-2">
              {unhealthyOrStopped.length > 0 && (
                <AttentionRow
                  to="/containers"
                  tone="warn"
                  icon={<TriangleAlert className="h-4 w-4 text-warn" />}
                  label={t('dashboard.stoppedUnhealthy', { count: unhealthyOrStopped.length })}
                />
              )}
              {updatesCount > 0 && (
                <AttentionRow
                  to="/updates"
                  tone="signal"
                  icon={<ArrowUpCircle className="h-4 w-4 text-signal" />}
                  label={t('dashboard.updatesAvailable', { count: updatesCount })}
                />
              )}
              {criticalImages > 0 && (
                <AttentionRow
                  to="/images"
                  tone="danger"
                  icon={<ShieldAlert className="h-4 w-4 text-danger" />}
                  label={t('dashboard.criticalCves', { count: criticalImages })}
                />
              )}
              {offlineEndpoints.map((e) => (
                <AttentionRow
                  key={e.id}
                  to="/endpoints"
                  tone="danger"
                  icon={<Server className="h-4 w-4 text-danger" />}
                  label={`${e.name}: ${t('dashboard.endpointOffline')}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Top nach Neustarts */}
        <div>
          <span className="eyebrow">{t('dashboard.topRestarts')}</span>
          {topRestarts.length === 0 ? (
            <Card className="mt-2 flex items-center gap-2 px-4 py-3 text-sm text-muted">
              <CheckCircle2 className="h-4 w-4 text-run" />
              {t('dashboard.noRestarts')}
            </Card>
          ) : (
            <Card className="mt-2 divide-y divide-border p-0">
              {topRestarts.map((c) => (
                <Link
                  key={c._endpointId + c.id}
                  to="/containers/$id"
                  params={{ id: c.id }}
                  onClick={() => setSelected(c._endpointId)}
                  className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-surface-hover"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-ink">{c.names[0] ?? shortId(c.id)}</span>
                    <span className="block truncate font-mono text-[11px] text-faint">{c._endpointName}</span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-warn">
                    <RotateCw className="h-3.5 w-3.5" /> {t('dashboard.restarts', { count: c.restartCount ?? 0 })}
                  </span>
                </Link>
              ))}
            </Card>
          )}
        </div>
      </div>

      {/* Host-Karten */}
      <div className="mt-6">
        <span className="eyebrow">{t('endpoint.title')}</span>
        <div className="mt-2 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {endpoints.map((e) => (
            <HostCard key={e.id} endpoint={e} info={infoById.get(e.id)} />
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

function AttentionRow({
  to,
  icon,
  label,
  tone,
}: {
  to: '/containers' | '/updates' | '/images' | '/endpoints';
  icon: React.ReactNode;
  label: string;
  tone: 'warn' | 'danger' | 'signal';
}) {
  const border = tone === 'danger' ? 'border-danger/40' : tone === 'warn' ? 'border-warn-soft' : 'border-signal/40';
  return (
    <Link to={to}>
      <Card className={cn('flex items-center gap-2 px-4 py-3 text-sm text-ink transition-colors hover:border-border-strong', border)}>
        {icon}
        {label}
      </Card>
    </Link>
  );
}

function HostCard({ endpoint, info }: { endpoint: Endpoint; info?: HostInfo['info'] }) {
  const { t } = useTranslation();
  const statusColor =
    endpoint.status === 'online'
      ? 'var(--w-run)'
      : endpoint.status === 'unauthorized'
        ? 'var(--w-danger)'
        : 'var(--w-stop)';
  return (
    <Link to="/endpoints/$id" params={{ id: endpoint.id }}>
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

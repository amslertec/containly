import { useMemo } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpCircle,
  Boxes,
  Cpu,
  HardDrive,
  Layers,
  MemoryStick,
  Network,
  Server,
  ShieldAlert,
  ShieldX,
  TriangleAlert,
} from 'lucide-react';
import type { UpdatesResponse, VulnScanState } from '@containly/shared';
import { useEndpoints } from '../app/EndpointContext';
import { useContainers } from '../hooks/containers';
import { useImages, useVolumes, useNetworks } from '../hooks/resources';
import { useStacks } from '../hooks/stacks';
import { api } from '../lib/api';
import { Page, PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/primitives';
import { TableWrap, THead, Th, Tr, Td } from '../components/ui/Table';
import { StatusDot, stateTone } from '../components/StatusDot';
import { LoadingState, EmptyState } from '../components/States';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from '../components/ui/Pagination';
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

type WarnTone = 'danger' | 'warn' | 'info';
interface Warning {
  key: string;
  label: string;
  tone: WarnTone;
  to?: string;
}
const WARN_TONES: Record<WarnTone, { border: string; text: string; Icon: typeof ShieldAlert }> = {
  danger: { border: 'border-danger-soft', text: 'text-danger', Icon: ShieldAlert },
  warn: { border: 'border-warn-soft', text: 'text-warn', Icon: TriangleAlert },
  info: { border: 'border-pause-soft', text: 'text-pause', Icon: ArrowUpCircle },
};

/**
 * Endpoint-Übersicht: aggregierte Kennzahlen & Warnungen NUR für den aktuell in der
 * Sidebar gewählten Endpoint (kein host-übergreifendes Dashboard). Nutzt vorhandene
 * Listen-Endpoints je Endpoint; keinen kombinierten Backend-Call.
 */
export function OverviewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { selected, current: endpoint, isAll } = useEndpoints();
  const online = endpoint?.status === 'online';
  const active = online && !isAll;

  const infoQuery = useQuery({
    queryKey: ['system-info', selected],
    queryFn: () => api.get<HostInfo>(`/api/system/info?endpoint=${encodeURIComponent(selected)}`),
    enabled: active,
    refetchInterval: 15_000,
    retry: false,
  });
  const info = infoQuery.data?.info;

  const { data: containers, isLoading } = useContainers(selected, { refetchInterval: 8000 });
  const { data: images } = useImages(selected);
  const { data: volumes } = useVolumes(selected);
  const { data: networks } = useNetworks(selected);
  const { data: allStacks } = useStacks();
  const stackCount = (allStacks ?? []).filter((s) => s.endpoint === selected).length;

  const updatesQuery = useQuery({
    queryKey: ['updates', selected],
    queryFn: () => api.get<UpdatesResponse>(`/api/updates?endpoint=${encodeURIComponent(selected)}`),
    enabled: active,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const updateCount = updatesQuery.data?.items.filter((i) => i.updateAvailable).length ?? 0;

  const vulnQuery = useQuery({
    queryKey: ['vulns', selected],
    queryFn: () => api.get<VulnScanState>(`/api/images/vulnerabilities?endpoint=${encodeURIComponent(selected)}`),
    enabled: active,
    staleTime: 30_000,
    retry: false,
  });
  const criticalImages = vulnQuery.data?.vulns.filter((v) => v.critical > 0).length ?? 0;

  const warnings = useMemo<Warning[]>(() => {
    const list: Warning[] = [];
    for (const c of containers ?? []) {
      const name = c.names[0] ?? shortId(c.id);
      if (c.state === 'dead') {
        list.push({ key: c.id + 'dead', tone: 'danger', label: `${name} — ${c.status}` });
      } else if (c.state === 'restarting') {
        list.push({ key: c.id + 're', tone: 'warn', label: `${name} — ${c.status}` });
      } else if (/unhealthy/i.test(c.status)) {
        list.push({ key: c.id + 'h', tone: 'warn', label: `${name} — ${t('dashboard.unhealthy')}` });
      } else if (c.state === 'exited') {
        const code = Number(c.status.match(/Exited \((\d+)\)/)?.[1] ?? 0);
        if (code !== 0) {
          list.push({ key: c.id + 'ex', tone: 'warn', label: `${name} — ${t('dashboard.exitedError', { code })}` });
        }
      }
      if (c.restartCount != null && c.restartCount >= 5) {
        list.push({ key: c.id + 'rc', tone: 'warn', label: `${name} — ${t('dashboard.manyRestarts', { count: c.restartCount })}` });
      }
    }
    if (updateCount > 0) {
      list.push({ key: 'updates', tone: 'info', to: '/updates', label: t('dashboard.updatesAvailable', { count: updateCount }) });
    }
    if (criticalImages > 0) {
      list.push({ key: 'cves', tone: 'danger', to: '/images', label: t('dashboard.criticalCves', { count: criticalImages }) });
    }
    return list;
  }, [containers, updateCount, criticalImages, t]);

  const sorted = useMemo(
    () =>
      [...(containers ?? [])].sort((a, b) => {
        if (a.state === 'running' && b.state !== 'running') return -1;
        if (a.state !== 'running' && b.state === 'running') return 1;
        return (a.names[0] ?? '').localeCompare(b.names[0] ?? '');
      }),
    [containers],
  );
  const pg = usePagination(sorted, 10);

  // „Alle Endpoints" gewählt → die Übersicht gilt pro Endpoint.
  if (isAll) {
    return (
      <Page>
        <PageHeader eyebrow={t('nav.dashboard')} title={t('nav.dashboard')} />
        <EmptyState icon={<Server className="h-8 w-8" />} title={t('overview.selectEndpoint')} hint="" />
      </Page>
    );
  }
  if (!endpoint) {
    return (
      <Page>
        <PageHeader eyebrow={t('nav.dashboard')} title={t('nav.dashboard')} />
        <EmptyState icon={<Server className="h-8 w-8" />} title={t('endpoint.unknown')} hint="" />
      </Page>
    );
  }

  const statusColor =
    endpoint.status === 'online'
      ? 'var(--w-run)'
      : endpoint.status === 'unauthorized'
        ? 'var(--w-danger)'
        : 'var(--w-stop)';

  return (
    <Page>
      <PageHeader
        eyebrow={t('nav.dashboard')}
        title={endpoint.name}
        subtitle={
          [info?.operatingSystem, endpoint.dockerVersion ? `Docker ${endpoint.dockerVersion}` : null]
            .filter(Boolean)
            .join(' · ') || t('dashboard.subtitle')
        }
        actions={
          <span className="flex items-center gap-2 text-sm text-muted">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: statusColor }} />
            {t(`endpoint.${endpoint.status}`)}
          </span>
        }
      />

      {/* Kennzahlen — nur dieser Endpoint. */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Stat icon={<Boxes className="h-4 w-4" />} label={t('dashboard.containersRunning')} value={info?.containersRunning ?? '—'} accent />
        <Stat icon={<Boxes className="h-4 w-4" />} label={t('dashboard.containersTotal')} value={info?.containers ?? '—'} />
        <Stat icon={<Layers className="h-4 w-4" />} label={t('dashboard.images')} value={info?.images ?? (images?.length ?? '—')} />
        <Stat icon={<HardDrive className="h-4 w-4" />} label={t('dashboard.volumes')} value={volumes?.length ?? '—'} />
        <Stat icon={<Network className="h-4 w-4" />} label={t('dashboard.networks')} value={networks?.length ?? '—'} />
        <Stat icon={<Server className="h-4 w-4" />} label={t('dashboard.stacks')} value={allStacks ? stackCount : '—'} />
        <Stat icon={<Cpu className="h-4 w-4" />} label={t('dashboard.cpuCores')} value={info?.ncpu ?? '—'} />
        <Stat icon={<MemoryStick className="h-4 w-4" />} label={t('dashboard.memory')} value={info ? formatBytes(info.memTotal) : '—'} />
        <Stat icon={<ArrowUpCircle className="h-4 w-4" />} label={t('dashboard.updatesShort')} value={updatesQuery.data ? updateCount : '—'} accent={updateCount > 0} />
        <Stat icon={<ShieldX className="h-4 w-4" />} label={t('dashboard.criticalShort')} value={vulnQuery.data ? criticalImages : '—'} accent={criticalImages > 0} />
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
            {warnings.map((w) => {
              const tone = WARN_TONES[w.tone];
              const Icon = tone.Icon;
              const cls = cn(
                'flex items-center gap-2 px-4 py-3 text-sm text-ink',
                tone.border,
                w.to && 'transition-colors hover:border-border-strong',
              );
              const body = (
                <>
                  <Icon className={cn('h-4 w-4 shrink-0', tone.text)} />
                  <span className="min-w-0">{w.label}</span>
                  {w.to && <span className="ml-auto shrink-0 text-xs text-muted">→</span>}
                </>
              );
              return w.to ? (
                <Link key={w.key} to={w.to}>
                  <Card className={cls}>{body}</Card>
                </Link>
              ) : (
                <Card key={w.key} className={cls}>
                  {body}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Container dieses Endpoints */}
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <span className="eyebrow">{t('nav.containers')}</span>
          <Link to="/containers" className="text-xs font-medium text-primary hover:underline">
            {t('common.all')} →
          </Link>
        </div>

        {isLoading ? (
          <LoadingState />
        ) : sorted.length === 0 ? (
          <EmptyState title={t('containers.noContainers')} hint="" />
        ) : (
          <>
            <TableWrap>
              <THead>
                <Th>{t('containers.columns.name')}</Th>
                <Th>{t('containers.columns.image')}</Th>
                <Th>{t('containers.columns.status')}</Th>
              </THead>
              <tbody>
                {pg.pageItems.map((c) => (
                  <Tr
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => void navigate({ to: '/containers/$id', params: { id: c.id } })}
                  >
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <StatusDot tone={stateTone(c.state)} pulse={c.state === 'running'} />
                        <span className="font-medium text-ink">{c.names[0] ?? shortId(c.id)}</span>
                      </div>
                    </Td>
                    <Td>
                      <span className="font-mono text-[12px] text-muted">{c.image}</span>
                    </Td>
                    <Td>
                      <span className="text-[13px] text-muted tabular">{c.status}</span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
            <Pagination pg={pg} />
          </>
        )}
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
        className={cn('mt-2 text-2xl font-bold tabular', accent ? 'text-primary' : 'text-ink')}
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {value}
      </div>
    </Card>
  );
}

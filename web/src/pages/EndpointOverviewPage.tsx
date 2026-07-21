import { useMemo } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowUpCircle,
  Boxes,
  Cpu,
  Layers,
  MemoryStick,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react';
import type { UpdatesResponse } from '@containly/shared';
import { useEndpoints } from '../app/EndpointContext';
import { useContainers } from '../hooks/containers';
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

export function EndpointOverviewPage() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/endpoints/$id' });
  const navigate = useNavigate();
  const { endpoints, setSelected } = useEndpoints();
  const endpoint = endpoints.find((e) => e.id === id);

  const infoQuery = useQuery({
    queryKey: ['system-info', id],
    queryFn: () => api.get<HostInfo>(`/api/system/info?endpoint=${encodeURIComponent(id)}`),
    enabled: endpoint?.status === 'online',
    refetchInterval: 15_000,
    retry: false,
  });
  const info = infoQuery.data?.info;

  const { data: containers, isLoading } = useContainers(id, { refetchInterval: 8000 });

  const updatesQuery = useQuery({
    queryKey: ['updates', id],
    queryFn: () => api.get<UpdatesResponse>(`/api/updates?endpoint=${encodeURIComponent(id)}`),
    enabled: endpoint?.status === 'online',
    staleTime: 5 * 60_000,
    retry: false,
  });
  const updateCount = updatesQuery.data?.items.filter((i) => i.updateAvailable).length ?? 0;

  const warnings = useMemo<Warning[]>(() => {
    const list: Warning[] = [];
    if (endpoint && endpoint.status !== 'online') {
      list.push({ key: 'offline', tone: 'danger', label: `${endpoint.name}: ${t('dashboard.endpointOffline')}` });
    }
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
    return list;
  }, [endpoint, containers, updateCount, t]);

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

  if (!endpoint) {
    return (
      <Page>
        <BackLink />
        <EmptyState title={t('endpoint.unknown')} hint="" />
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
      <BackLink />
      <PageHeader
        eyebrow={t('endpoint.title')}
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

      {/* Kennzahlen (wie Dashboard, aber für diesen Host) */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Stat icon={<Boxes className="h-4 w-4" />} label={t('dashboard.containersRunning')} value={info?.containersRunning ?? '—'} accent />
        <Stat icon={<Boxes className="h-4 w-4" />} label={t('dashboard.containersTotal')} value={info?.containers ?? '—'} />
        <Stat icon={<Layers className="h-4 w-4" />} label={t('dashboard.images')} value={info?.images ?? '—'} />
        <Stat icon={<Cpu className="h-4 w-4" />} label={t('dashboard.cpuCores')} value={info?.ncpu ?? '—'} />
        <Stat icon={<MemoryStick className="h-4 w-4" />} label={t('dashboard.memory')} value={info ? formatBytes(info.memTotal) : '—'} />
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
                <Link key={w.key} to={w.to} onClick={() => setSelected(id)}>
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

      {/* Container dieses Hosts */}
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <span className="eyebrow">{t('nav.containers')}</span>
          <Link
            to="/containers"
            onClick={() => setSelected(id)}
            className="text-xs font-medium text-primary hover:underline"
          >
            {t('common.all')} →
          </Link>
        </div>

        {isLoading ? (
          <LoadingState />
        ) : sorted.length === 0 ? (
          <EmptyState title={t('containers.noContainers')} hint="" />
        ) : (
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
                  onClick={() => { setSelected(id); void navigate({ to: '/containers/$id', params: { id: c.id } }); }}
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
        )}
        {!isLoading && sorted.length > 0 && <Pagination pg={pg} />}
      </div>
    </Page>
  );
}

function BackLink() {
  const { t } = useTranslation();
  return (
    <Link
      to="/endpoints"
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
    >
      <ArrowLeft className="h-4 w-4" />
      {t('endpoint.title')}
    </Link>
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

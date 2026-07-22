import { lazy, Suspense, useState } from 'react';
import { useParams, useRouter, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ExternalLink, Play, RotateCw, Square } from 'lucide-react';
import type { ContainerAction } from '@containly/shared';
import { useEndpoints } from '../app/EndpointContext';
import { useAuth } from '../app/AuthContext';
import { useContainerAction, useContainerInspect } from '../hooks/containers';
import { Page } from '../components/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge, Card, KeyValue } from '../components/ui/primitives';
import { StatusDot, stateTone } from '../components/StatusDot';
import { LoadingState, ErrorState } from '../components/States';
import { LogViewer } from '../components/LogViewer';
import { toast } from '../components/Toaster';

// Schwere Panels (xterm/Charts) erst bei Bedarf laden → kleineres Haupt-Bundle.
const StatsPanel = lazy(() =>
  import('../components/StatsPanel').then((m) => ({ default: m.StatsPanel })),
);
const ExecConsole = lazy(() =>
  import('../components/ExecConsole').then((m) => ({ default: m.ExecConsole })),
);
import { ApiError } from '../lib/api';
import { absoluteTime, relativeTime } from '../lib/time';
import { shortId, cn } from '../lib/utils';

type Tab = 'overview' | 'logs' | 'stats' | 'console' | 'inspect';
const TABS: Tab[] = ['overview', 'logs', 'stats', 'console', 'inspect'];

export function ContainerDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/containers/$id' });
  const search = useSearch({ from: '/containers/$id' });
  const { selected, endpoints } = useEndpoints();
  const endpointHost = endpoints.find((e) => e.id === selected)?.host ?? null;
  const { isAdmin } = useAuth();
  const { data: c, isLoading, isError, error, refetch } = useContainerInspect(selected, id);
  const actionMut = useContainerAction(selected);

  const initialTab = (TABS.includes(search.tab as Tab) ? search.tab : 'overview') as Tab;
  const [tab, setTab] = useState<Tab>(initialTab);

  const runAction = async (action: ContainerAction): Promise<void> => {
    try {
      await actionMut.mutateAsync({ id, action });
      toast.success(t('containers.actionDone', { action: t(`containers.${action}`) }));
      void refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('containers.actionFailed'));
    }
  };

  if (isLoading) return <Page><LoadingState /></Page>;
  if (isError || !c)
    return (
      <Page>
        <BackLink />
        <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
      </Page>
    );

  const running = c.state.running;

  return (
    <Page className="flex h-full flex-col">
      <BackLink />

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <StatusDot tone={stateTone(c.state.status)} pulse={running} />
            <h1
              className="truncate text-2xl font-bold tracking-tight text-ink"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {c.name}
            </h1>
            {c.state.health && (
              <Badge tone={c.state.health === 'healthy' ? 'run' : 'warn'}>{c.state.health}</Badge>
            )}
          </div>
          <p className="mt-1 font-mono text-[12px] text-faint">
            {shortId(c.id)} · {c.image}
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            {running ? (
              <Button variant="secondary" size="sm" onClick={() => void runAction('stop')} loading={actionMut.isPending}>
                <Square className="h-4 w-4" /> {t('containers.stop')}
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => void runAction('start')} loading={actionMut.isPending}>
                <Play className="h-4 w-4" /> {t('containers.start')}
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => void runAction('restart')} loading={actionMut.isPending}>
              <RotateCw className="h-4 w-4" /> {t('containers.restart')}
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-border">
        {TABS.map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={cn(
              'relative px-3 py-2 text-sm font-medium transition-colors',
              tab === tb ? 'text-primary' : 'text-muted hover:text-ink',
            )}
          >
            {t(`containers.detail.${tb}`)}
            {tab === tb && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        {tab === 'overview' && <Overview c={c} endpointHost={endpointHost} />}
        {tab === 'logs' && (
          <div className="h-[calc(100dvh-320px)] min-h-[360px]">
            <LogViewer endpoint={selected} id={id} name={c.name} />
          </div>
        )}
        {tab === 'stats' && (
          <Suspense fallback={<LoadingState />}>
            <StatsPanel endpoint={selected} id={id} running={running} />
          </Suspense>
        )}
        {tab === 'console' && (
          <Suspense fallback={<LoadingState />}>
            <ExecConsole endpoint={selected} id={id} running={running} />
          </Suspense>
        )}
        {tab === 'inspect' && (
          <Card className="overflow-auto p-4">
            <pre className="max-h-[70vh] overflow-auto font-mono text-[12px] leading-relaxed text-muted">
              {JSON.stringify(c.raw, null, 2)}
            </pre>
          </Card>
        )}
      </div>
    </Page>
  );
}

function BackLink() {
  const { t } = useTranslation();
  const router = useRouter();
  // Zurück zur vorigen Seite (Stack, Liste, …) statt fix zur Container-Liste.
  const goBack = (): void => {
    if (window.history.length > 1) router.history.back();
    else void router.navigate({ to: '/containers' });
  };
  return (
    <button
      onClick={goBack}
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
    >
      <ArrowLeft className="h-4 w-4" />
      {t('common.back')}
    </button>
  );
}

function Overview({
  c,
  endpointHost,
}: {
  c: import('@containly/shared').ContainerInspect;
  endpointHost: string | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4">
        <span className="eyebrow">{t('containers.detail.overview')}</span>
        <dl className="mt-2 grid grid-cols-2 gap-x-4">
          <KeyValue label={t('containers.detail.image')} mono>{c.image}</KeyValue>
          <KeyValue label={t('containers.detail.restartPolicy')}>{c.restartPolicy}</KeyValue>
          <KeyValue label={t('containers.detail.restartCount')}>{c.state.restartCount}</KeyValue>
          <KeyValue label={t('containers.detail.exitCode')}>{c.state.exitCode}</KeyValue>
          <KeyValue label={t('containers.detail.created')}>{relativeTime(c.createdAt)}</KeyValue>
          <KeyValue label={t('containers.detail.started')}>{absoluteTime(c.state.startedAt)}</KeyValue>
        </dl>
      </Card>

      <Card className="p-4">
        <span className="eyebrow">{t('containers.detail.ports')} · {t('containers.detail.networks')}</span>
        <div className="mt-3 space-y-3">
          {c.ports.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {c.ports.map((p, i) => {
                const label = `${p.publicPort ? `${p.ip ?? '0.0.0.0'}:${p.publicPort}→` : ''}${p.privatePort}/${p.type}`;
                const href = portHref(p, endpointHost);
                return href ? (
                  <a
                    key={i}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    title={t('containers.detail.openPort', { href })}
                    className="inline-flex items-center gap-1 rounded bg-surface-2 px-2 py-1 font-mono text-[11px] text-primary transition-colors hover:bg-primary-soft"
                  >
                    {label}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span key={i} className="rounded bg-surface-2 px-2 py-1 font-mono text-[11px] text-muted">
                    {label}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-faint">—</p>
          )}
          <div className="space-y-1">
            {c.networks.map((n) => (
              <div key={n.name} className="flex items-center justify-between text-[13px]">
                <span className="text-muted">{n.name}</span>
                <span className="font-mono text-faint">{n.ipAddress || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {c.mounts.length > 0 && (
        <Card className="p-4 lg:col-span-2">
          <span className="eyebrow">{t('containers.detail.mounts')}</span>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[13px]">
              <tbody>
                {c.mounts.map((m, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-1.5 pr-3 font-mono text-faint">{m.type}</td>
                    <td className="py-1.5 pr-3 font-mono text-muted">{m.source || '—'}</td>
                    <td className="py-1.5 pr-3 font-mono text-ink">{m.destination}</td>
                    <td className="py-1.5 text-right">
                      <Badge tone={m.rw ? 'neutral' : 'warn'}>
                        {m.rw ? t('containers.detail.readwrite') : t('containers.detail.readonly')}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {c.env.length > 0 && (
        <Card className="p-4 lg:col-span-2">
          <span className="eyebrow">{t('containers.detail.env')}</span>
          <div className="mt-2 max-h-64 overflow-auto rounded-md bg-bg-sunken p-3">
            {c.env.map((e, i) => {
              const eq = e.indexOf('=');
              const k = eq > 0 ? e.slice(0, eq) : e;
              const v = eq > 0 ? e.slice(eq + 1) : '';
              return (
                <div key={i} className="font-mono text-[12px]">
                  <span className="text-primary">{k}</span>
                  <span className="text-faint">=</span>
                  <span className="text-muted">{v}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

/**
 * Baut den anklickbaren Link zu einem veröffentlichten Port. Host = die spezifische
 * Bind-IP (falls öffentlich), sonst der Endpoint-Host (Remote) bzw. der Host, über den
 * der Browser Containly erreicht (lokal). Nur TCP + veröffentlichte Ports werden verlinkt.
 */
function portHref(p: { ip?: string; publicPort?: number; type: string }, endpointHost: string | null): string | null {
  if (!p.publicPort || p.type !== 'tcp') return null;
  const bind = p.ip && !['0.0.0.0', '::', '', '127.0.0.1', '::1'].includes(p.ip) ? p.ip : null;
  const host = bind ?? endpointHost ?? (typeof window !== 'undefined' ? window.location.hostname : 'localhost');
  return `http://${host}:${p.publicPort}`;
}

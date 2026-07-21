import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ArrowUpCircle,
  MoreVertical,
  Pause,
  Play,
  RefreshCw,
  RotateCw,
  ScrollText,
  Search,
  Square,
  Trash2,
  Zap,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { ContainerAction, ContainerSummary } from '@containly/shared';
import { useEndpoints } from '../app/EndpointContext';
import { useAuth } from '../app/AuthContext';
import { useScopedList, type ScopedItem } from '../hooks/useScopedList';
import { useUpdateFlags } from '../hooks/updates';
import { useConfirm } from '../hooks/useConfirm';
import { Page, PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge, Input } from '../components/ui/primitives';
import { StatusDot, stateTone } from '../components/StatusDot';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from '../components/ui/Pagination';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { toast } from '../components/Toaster';
import { api, ApiError } from '../lib/api';
import { shortId, cn } from '../lib/utils';

type Filter = 'all' | 'running' | 'stopped';
type Row = ContainerSummary & ScopedItem;

export function ContainersPage() {
  const { t } = useTranslation();
  const { isAll, setSelected } = useEndpoints();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const updates = useUpdateFlags();
  const { data, isLoading, isError, error, refetch } = useScopedList<
    ContainerSummary,
    { containers: ContainerSummary[] }
  >('containers', (d) => d.containers, 5000);
  const [busy, setBusy] = useState(false);
  const { confirm, dialogProps } = useConfirm();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    let list: Row[] = data;
    if (filter === 'running') list = list.filter((c) => c.state === 'running');
    if (filter === 'stopped') list = list.filter((c) => c.state !== 'running');
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.names.some((n) => n.toLowerCase().includes(q)) ||
          c.image.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      if (a.state === 'running' && b.state !== 'running') return -1;
      if (a.state !== 'running' && b.state === 'running') return 1;
      return (a.names[0] ?? '').localeCompare(b.names[0] ?? '');
    });
  }, [data, filter, query]);

  const pg = usePagination(filtered, 10);

  const runAction = async (c: Row, action: ContainerAction): Promise<void> => {
    setBusy(true);
    try {
      await api.post(
        `/api/containers/${encodeURIComponent(c.id)}/${action}?endpoint=${encodeURIComponent(c._endpointId)}`,
      );
      void qc.invalidateQueries({ queryKey: ['containers', c._endpointId] });
      toast.success(t('containers.actionDone', { action: t(`containers.${action}`) }));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('containers.actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const askRemove = async (c: Row): Promise<void> => {
    const name = c.names[0] ?? shortId(c.id);
    const ok = await confirm({
      title: t('containers.removeTitle'),
      description: t('containers.removeConfirm', { name }),
      danger: true,
      confirmLabel: t('common.remove'),
      confirmText: name,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.delete(
        `/api/containers/${encodeURIComponent(c.id)}?endpoint=${encodeURIComponent(c._endpointId)}&force=${c.state === 'running'}&volumes=false`,
      );
      void qc.invalidateQueries({ queryKey: ['containers', c._endpointId] });
      toast.success(t('common.remove'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('containers.actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => {
    const running = data.filter((c) => c.state === 'running').length;
    return { total: data.length, running };
  }, [data]);

  return (
    <Page>
      <PageHeader
        eyebrow={t('app.name')}
        title={t('containers.title')}
        subtitle={
          data ? `${counts.running} ${t('containers.filterRunning').toLowerCase()} · ${counts.total} ${t('containers.title').toLowerCase()}` : undefined
        }
        actions={
          <Button variant="secondary" size="sm" onClick={() => void refetch()}>
            <RefreshCw className="h-4 w-4" />
            {t('common.refresh')}
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('containers.searchPlaceholder')}
            className="pl-8"
          />
        </div>
        <div className="inline-flex rounded-md border border-border p-0.5">
          {(['all', 'running', 'stopped'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded px-3 py-1.5 text-[13px] font-medium transition-colors',
                filter === f ? 'bg-primary text-primary-ink' : 'text-muted hover:text-ink',
              )}
            >
              {t(`containers.filter${f[0]!.toUpperCase()}${f.slice(1)}`)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState title={t('containers.noContainers')} hint={query ? t('states.emptyHint') : t('states.emptyHint')} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <Th className="pl-4">{t('containers.columns.name')}</Th>
                  <Th>{t('containers.columns.image')}</Th>
                  {isAll && <Th>{t('common.host')}</Th>}
                  <Th>{t('containers.columns.status')}</Th>
                  <Th>{t('containers.columns.ports')}</Th>
                  <Th className="pr-4 text-right">{t('common.actions')}</Th>
                </tr>
              </thead>
              <tbody>
                {pg.pageItems.map((c) => {
                  const name = c.names[0] ?? shortId(c.id);
                  const running = c.state === 'running';
                  const paused = c.state === 'paused';
                  return (
                    <tr
                      key={c.id}
                      className="group border-b border-border last:border-0 transition-colors hover:bg-surface-hover"
                    >
                      <td className="whitespace-nowrap py-2.5 pl-4">
                        <Link
                          to="/containers/$id"
                          params={{ id: c.id }}
                          onClick={() => setSelected(c._endpointId)}
                          className="flex items-center gap-2.5"
                        >
                          <StatusDot tone={stateTone(c.state)} pulse={running} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-ink hover:text-primary">
                              {name}
                            </span>
                            <span className="font-mono text-[11px] text-faint">{shortId(c.id)}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-3">
                        <span className="font-mono text-[12px] text-muted">{c.image}</span>
                        {c.composeProject && (
                          <Badge tone="primary" className="ml-2 align-middle">
                            {c.composeProject}
                          </Badge>
                        )}
                        {updates.has(c._endpointId, c.image) && (
                          <Badge tone="signal" className="ml-2 align-middle" title={t('updates.statusUpdate')}>
                            <ArrowUpCircle className="h-3.5 w-3.5" /> {t('updates.statusUpdate')}
                          </Badge>
                        )}
                      </td>
                      {isAll && (
                        <td className="whitespace-nowrap py-2.5 pr-3">
                          <Badge tone="neutral">{c._endpointName}</Badge>
                        </td>
                      )}
                      <td className="whitespace-nowrap py-2.5 pr-3">
                        <span className="text-[13px] text-muted tabular">{c.status}</span>
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-3">
                        <PortList container={c} />
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            to="/containers/$id"
                            params={{ id: c.id }}
                            search={{ tab: 'logs' }}
                            onClick={() => setSelected(c._endpointId)}
                            title={t('containers.logs')}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
                          >
                            <ScrollText className="h-4 w-4" />
                          </Link>
                          {isAdmin && (
                            <>
                              {running || paused ? (
                                <RowAction
                                  title={t('containers.stop')}
                                  onClick={() => void runAction(c, 'stop')}
                                  disabled={busy}
                                >
                                  <Square className="h-4 w-4" />
                                </RowAction>
                              ) : (
                                <RowAction
                                  title={t('containers.start')}
                                  onClick={() => void runAction(c, 'start')}
                                  disabled={busy}
                                >
                                  <Play className="h-4 w-4" />
                                </RowAction>
                              )}
                              <RowAction
                                title={t('containers.restart')}
                                onClick={() => void runAction(c, 'restart')}
                                disabled={busy}
                              >
                                <RotateCw className="h-4 w-4" />
                              </RowAction>
                              <RowMenu
                                container={c}
                                onAction={runAction}
                                onRemove={() => void askRemove(c)}
                              />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isLoading && !isError && filtered.length > 0 && <Pagination pg={pg} />}

      <ConfirmDialog {...dialogProps} loading={busy} />
    </Page>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn('eyebrow whitespace-nowrap py-2.5 pr-3 font-semibold', className)}>{children}</th>;
}

function RowAction({
  children,
  title,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function RowMenu({
  container,
  onAction,
  onRemove,
}: {
  container: Row;
  onAction: (c: Row, a: ContainerAction) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const running = container.state === 'running';
  const paused = container.state === 'paused';
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink">
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-[170px] rounded-lg border border-border bg-surface p-1.5"
          style={{ boxShadow: 'var(--w-shadow-lg)' }}
        >
          {running && !paused && (
            <MenuItem onSelect={() => onAction(container, 'pause')} icon={<Pause className="h-4 w-4" />}>
              {t('containers.pause')}
            </MenuItem>
          )}
          {paused && (
            <MenuItem onSelect={() => onAction(container, 'unpause')} icon={<Play className="h-4 w-4" />}>
              {t('containers.unpause')}
            </MenuItem>
          )}
          {running && (
            <MenuItem onSelect={() => onAction(container, 'kill')} icon={<Zap className="h-4 w-4" />}>
              {t('containers.kill')}
            </MenuItem>
          )}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <MenuItem danger onSelect={onRemove} icon={<Trash2 className="h-4 w-4" />}>
            {t('common.remove')}
          </MenuItem>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MenuItem({
  children,
  icon,
  onSelect,
  danger,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none',
        danger
          ? 'text-danger data-[highlighted]:bg-danger-soft'
          : 'text-ink data-[highlighted]:bg-surface-hover',
      )}
    >
      {icon}
      {children}
    </DropdownMenu.Item>
  );
}

function PortList({ container }: { container: ContainerSummary }) {
  const published = container.ports.filter((p) => p.publicPort);
  if (published.length === 0) return <span className="text-faint">—</span>;
  const unique = Array.from(new Set(published.map((p) => `${p.publicPort}:${p.privatePort}`)));
  return (
    <div className="flex flex-wrap gap-1">
      {unique.slice(0, 3).map((p) => (
        <span key={p} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">
          {p}
        </span>
      ))}
      {unique.length > 3 && <span className="text-[11px] text-faint">+{unique.length - 3}</span>}
    </div>
  );
}

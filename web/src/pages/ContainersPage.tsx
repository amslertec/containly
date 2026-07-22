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
  X,
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
import { Checkbox } from '../components/ui/Checkbox';
import { Badge, Input } from '../components/ui/primitives';
import { StatusDot, stateTone } from '../components/StatusDot';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { usePagination } from '../hooks/usePagination';
import { useTablePrefs, sortRows } from '../hooks/useTablePrefs';
import { ResizableTable, useColumnResize, type Column } from '../components/ui/Table';
import { Pagination } from '../components/ui/Pagination';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { toast } from '../components/Toaster';
import { api, ApiError } from '../lib/api';
import { shortId, cn } from '../lib/utils';

type Filter = 'all' | 'running' | 'stopped';
type Row = ContainerSummary & ScopedItem;

const DEFAULT_WIDTHS: Record<string, number> = {
  select: 44,
  name: 260,
  image: 300,
  host: 130,
  status: 200,
  ports: 180,
  actions: 132,
};

// Sortierschlüssel je Spalte. „status" sortiert nach Erstellzeit (= wie lange up).
const SORT: Record<string, (c: Row) => string | number> = {
  name: (c) => (c.names[0] ?? '').toLowerCase(),
  image: (c) => c.image.toLowerCase(),
  status: (c) => c.createdAt,
};

export function ContainersPage() {
  const { t } = useTranslation();
  const { isAll, setSelected } = useEndpoints();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const updates = useUpdateFlags();
  const { data, isLoading, isFetching, isError, error, refetch } = useScopedList<
    ContainerSummary,
    { containers: ContainerSummary[] }
  >('containers', (d) => d.containers, 5000);
  const [busy, setBusy] = useState(false);
  const { confirm, dialogProps } = useConfirm();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const rowKey = (c: Row): string => `${c._endpointId}:${c.id}`;

  // Sortierung + Spaltenbreiten, in localStorage gemerkt (bleiben beim nächsten Öffnen).
  const { widths, setWidth, commitWidths, sort, toggleSort } = useTablePrefs('containers', DEFAULT_WIDTHS, {
    col: 'name',
    dir: 'asc',
  });

  const columns = useMemo<Column[]>(() => {
    const cols: Column[] = [];
    if (isAdmin) cols.push({ key: 'select', label: '', sortable: false, resizable: false, align: 'left' });
    cols.push({ key: 'name', label: t('containers.columns.name'), sortable: true, resizable: true, align: 'left' });
    cols.push({ key: 'image', label: t('containers.columns.image'), sortable: true, resizable: true, align: 'left' });
    if (isAll) cols.push({ key: 'host', label: t('common.host'), sortable: false, resizable: true, align: 'left' });
    cols.push({ key: 'status', label: t('containers.columns.status'), sortable: true, resizable: true, align: 'left' });
    cols.push({ key: 'ports', label: t('containers.columns.ports'), sortable: false, resizable: true, align: 'left' });
    cols.push({ key: 'actions', label: t('common.actions'), sortable: false, resizable: false, align: 'right' });
    return cols;
  }, [isAdmin, isAll, t]);

  const startResize = useColumnResize(widths, setWidth, commitWidths);

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
    const acc = SORT[sort.col] ?? SORT.name!;
    // Stabiler Tie-Breaker (ID) → gleich-bewertete Zeilen springen bei Reload nicht.
    return sortRows(list, acc, sort.dir, (c) => c.id);
  }, [data, filter, query, sort]);

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

  // ── Mehrfachauswahl / Bulk-Aktionen ──────────────────────────────────────
  const pageKeys = pg.pageItems.map(rowKey);
  const allOnPage = pageKeys.length > 0 && pageKeys.every((k) => picked.has(k));
  const toggleRow = (c: Row): void =>
    setPicked((s) => {
      const n = new Set(s);
      n.has(rowKey(c)) ? n.delete(rowKey(c)) : n.add(rowKey(c));
      return n;
    });
  const togglePage = (): void =>
    setPicked((s) => {
      const n = new Set(s);
      if (allOnPage) pageKeys.forEach((k) => n.delete(k));
      else pageKeys.forEach((k) => n.add(k));
      return n;
    });
  const clearPicked = (): void => setPicked(new Set());
  const pickedRows = filtered.filter((c) => picked.has(rowKey(c)));

  const runBulk = async (action: ContainerAction | 'remove'): Promise<void> => {
    if (pickedRows.length === 0) return;
    if (action === 'remove') {
      const ok = await confirm({
        title: t('containers.removeTitle'),
        description: t('bulk.removeConfirm', { count: pickedRows.length }),
        danger: true,
        confirmLabel: t('common.remove'),
      });
      if (!ok) return;
    }
    setBusy(true);
    const touched = new Set<string>();
    let ok = 0;
    const errors: string[] = [];
    for (const c of pickedRows) {
      try {
        if (action === 'remove') {
          await api.delete(
            `/api/containers/${encodeURIComponent(c.id)}?endpoint=${encodeURIComponent(c._endpointId)}&force=${c.state === 'running'}&volumes=false`,
          );
        } else {
          await api.post(
            `/api/containers/${encodeURIComponent(c.id)}/${action}?endpoint=${encodeURIComponent(c._endpointId)}`,
          );
        }
        ok++;
      } catch (err) {
        errors.push(err instanceof ApiError ? err.message : (c.names[0] ?? shortId(c.id)));
      }
      touched.add(c._endpointId);
    }
    touched.forEach((e) => void qc.invalidateQueries({ queryKey: ['containers', e] }));
    setBusy(false);
    clearPicked();
    if (errors.length === 0) toast.success(t('bulk.done', { count: ok }));
    else toast.error(t('bulk.partial', { ok, failed: errors.length }));
  };

  return (
    <Page>
      <PageHeader
        eyebrow={t('app.name')}
        title={t('containers.title')}
        subtitle={
          data ? `${counts.running} ${t('containers.filterRunning').toLowerCase()} · ${counts.total} ${t('containers.title').toLowerCase()}` : undefined
        }
        actions={
          <Button variant="secondary" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
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

      {isAdmin && picked.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary-soft px-3 py-2">
          <span className="text-[13px] font-medium text-ink">
            {t('bulk.selected', { count: picked.size })}
          </span>
          <div className="flex-1" />
          <Button variant="secondary" size="sm" onClick={() => void runBulk('start')} disabled={busy}>
            <Play className="h-4 w-4" /> {t('containers.start')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void runBulk('stop')} disabled={busy}>
            <Square className="h-4 w-4" /> {t('containers.stop')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void runBulk('restart')} disabled={busy}>
            <RotateCw className="h-4 w-4" /> {t('containers.restart')}
          </Button>
          <Button variant="danger" size="sm" onClick={() => void runBulk('remove')} disabled={busy}>
            <Trash2 className="h-4 w-4" /> {t('common.remove')}
          </Button>
          <button
            onClick={clearPicked}
            title={t('common.close')}
            className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState title={t('containers.noContainers')} hint={query ? t('states.emptyHint') : t('states.emptyHint')} />
      ) : (
        <ResizableTable
          columns={columns}
          widths={widths}
          sort={sort}
          onSort={toggleSort}
          onResizeStart={startResize}
          header={(col) =>
            col.key === 'select' ? (
              <Checkbox
                checked={allOnPage}
                indeterminate={!allOnPage && pageKeys.some((k) => picked.has(k))}
                onChange={togglePage}
                aria-label={t('bulk.selectAll')}
              />
            ) : undefined
          }
        >
              <tbody>
                {pg.pageItems.map((c) => {
                  const name = c.names[0] ?? shortId(c.id);
                  const running = c.state === 'running';
                  const paused = c.state === 'paused';
                  return (
                    <tr
                      key={c.id}
                      className={cn(
                        'group border-b border-border last:border-0 transition-colors hover:bg-surface-hover',
                        picked.has(rowKey(c)) && 'bg-primary-soft/50',
                      )}
                    >
                      {isAdmin && (
                        <td className="py-2.5 pl-4 pr-1 align-middle">
                          <Checkbox
                            checked={picked.has(rowKey(c))}
                            onChange={() => toggleRow(c)}
                            aria-label={name}
                          />
                        </td>
                      )}
                      <td className={cn('overflow-hidden py-2.5', isAdmin ? 'pl-2' : 'pl-4')}>
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
                      <td className="py-2.5 pl-2 pr-3">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className="truncate font-mono text-[12px] text-muted">{c.image}</span>
                          {c.composeProject && (
                            <Badge tone="primary" className="shrink-0">
                              {c.composeProject}
                            </Badge>
                          )}
                          {updates.has(c._endpointId, c.image) && (
                            <Badge tone="signal" className="shrink-0" title={t('updates.statusUpdate')}>
                              <ArrowUpCircle className="h-3.5 w-3.5" /> {t('updates.statusUpdate')}
                            </Badge>
                          )}
                        </div>
                      </td>
                      {isAll && (
                        <td className="overflow-hidden py-2.5 pl-2 pr-3">
                          <Badge tone="neutral">{c._endpointName}</Badge>
                        </td>
                      )}
                      <td className="overflow-hidden py-2.5 pl-2 pr-3">
                        <span className="block truncate text-[13px] text-muted tabular">{c.status}</span>
                      </td>
                      <td className="overflow-hidden py-2.5 pl-2 pr-3">
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
        </ResizableTable>
      )}

      {!isLoading && !isError && filtered.length > 0 && <Pagination pg={pg} />}

      <ConfirmDialog {...dialogProps} loading={busy} />
    </Page>
  );
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

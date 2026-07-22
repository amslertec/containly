import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, Plus, Search, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { VolumeSummary } from '@containly/shared';
import { useEndpoints } from '../app/EndpointContext';
import { useAuth } from '../app/AuthContext';
import { useVolumeMutations } from '../hooks/resources';
import { useScopedList, type ScopedItem } from '../hooks/useScopedList';
import { useConfirm } from '../hooks/useConfirm';
import { Page, PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge, Input, Label } from '../components/ui/primitives';
import { ResizableTable, Tr, Td, useColumnResize, type Column } from '../components/ui/Table';
import { useTablePrefs, sortRows } from '../hooks/useTablePrefs';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/Dialog';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from '../components/ui/Pagination';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { VolumeBrowser } from '../components/VolumeBrowser';
import { toast } from '../components/Toaster';
import { api, ApiError } from '../lib/api';

type Row = VolumeSummary & ScopedItem;

const VOL_WIDTHS: Record<string, number> = {
  name: 280,
  driver: 120,
  host: 130,
  mountpoint: 320,
  status: 130,
  actions: 90,
};
const VOL_SORT: Record<string, (r: Row) => string | number> = {
  name: (r) => r.name.toLowerCase(),
  status: (r) => (r.inUse ? 1 : 0),
};

export function VolumesPage() {
  const { t } = useTranslation();
  const { selected, isAll } = useEndpoints();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const mut = useVolumeMutations(selected);
  const { data, isLoading, isError, error, refetch } = useScopedList<
    VolumeSummary,
    { volumes: VolumeSummary[] }
  >('volumes', (d) => d.volumes, 15_000);
  const { confirm, dialogProps } = useConfirm();
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [browse, setBrowse] = useState<Row | null>(null);
  const invalidate = (id: string) => void qc.invalidateQueries({ queryKey: ['volumes', id] });

  const { widths, setWidth, commitWidths, sort, toggleSort } = useTablePrefs('volumes', VOL_WIDTHS, {
    col: 'name',
    dir: 'asc',
  });
  const startResize = useColumnResize(widths, setWidth, commitWidths);
  const columns = useMemo<Column[]>(() => {
    const cols: Column[] = [
      { key: 'name', label: t('volumes.columns.name'), sortable: true, resizable: true, align: 'left' },
      { key: 'driver', label: t('volumes.columns.driver'), resizable: true, align: 'left' },
    ];
    if (isAll) cols.push({ key: 'host', label: t('common.host'), resizable: true, align: 'left' });
    cols.push({ key: 'mountpoint', label: t('volumes.columns.mountpoint'), resizable: true, align: 'left' });
    cols.push({ key: 'status', label: t('common.status'), sortable: true, resizable: true, align: 'left' });
    cols.push({ key: 'actions', label: t('common.actions'), align: 'right' });
    return cols;
  }, [t, isAll]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? data.filter((v) => v.name.toLowerCase().includes(q)) : data;
    const acc = VOL_SORT[sort.col];
    return acc ? sortRows(list, acc, sort.dir, (v) => v.name + v._endpointId) : list;
  }, [data, query, sort]);

  const pg = usePagination(filtered, 10);

  const doRemove = async (vol: Row): Promise<void> => {
    const ok = await confirm({
      title: t('common.remove'),
      description: t('volumes.removeConfirm', { name: vol.name }),
      danger: true,
      confirmLabel: t('common.remove'),
      confirmText: vol.name,
    });
    if (!ok) return;
    try {
      await api.delete(
        `/api/volumes/${encodeURIComponent(vol.name)}?endpoint=${encodeURIComponent(vol._endpointId)}`,
      );
      invalidate(vol._endpointId);
      toast.success(t('common.remove'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  };

  const doPrune = async (): Promise<void> => {
    if (isAll) return;
    const ok = await confirm({ title: t('volumes.prune'), description: t('volumes.pruneConfirm'), danger: true, confirmLabel: t('volumes.prune') });
    if (!ok) return;
    try {
      await mut.prune.mutateAsync();
      toast.success(t('volumes.prune'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow={t('app.name')}
        title={t('volumes.title')}
        subtitle={
          data.length > 0
            ? `${data.filter((v) => v.inUse).length} ${t('volumes.inUse').toLowerCase()} · ${data.filter((v) => !v.inUse).length} ${t('volumes.orphan').toLowerCase()} · ${data.length} ${t('volumes.title').toLowerCase()}`
            : undefined
        }
        actions={
          isAdmin &&
          !isAll && (
            <>
              <Button variant="subtle" size="sm" onClick={() => void doPrune()}>
                <Trash2 className="h-4 w-4" /> {t('volumes.prune')}
              </Button>
              <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> {t('volumes.create')}
              </Button>
            </>
          )
        }
      />

      {isAdmin && isAll && <p className="mb-4 text-xs text-muted">{t('scope.pickHostForActions')}</p>}

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('common.search')} className="pl-8" />
      </div>

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState title={t('volumes.noVolumes')} />
      ) : (
        <ResizableTable
          columns={columns}
          widths={widths}
          sort={sort}
          onSort={toggleSort}
          onResizeStart={startResize}
        >
          <tbody>
            {pg.pageItems.map((vol) => (
              <Tr key={vol._endpointId + vol.name}>
                <Td><span className="font-mono text-[12.5px] text-ink break-all">{vol.name}</span></Td>
                <Td><span className="text-muted">{vol.driver}</span></Td>
                {isAll && <Td><Badge tone="neutral">{vol._endpointName}</Badge></Td>}
                <Td><span className="font-mono text-[11px] text-faint break-all">{vol.mountpoint}</span></Td>
                <Td>
                  {vol.inUse ? <Badge tone="run">{t('volumes.inUse')}</Badge> : <Badge tone="warn">{t('volumes.orphan')}</Badge>}
                </Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      title={t('volbrowse.browse')}
                      onClick={() => setBrowse(vol)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
                    >
                      <FolderOpen className="h-4 w-4" />
                    </button>
                    {isAdmin && (
                      <button
                        title={t('common.remove')}
                        onClick={() => void doRemove(vol)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </ResizableTable>
      )}

      {!isLoading && !isError && filtered.length > 0 && <Pagination pg={pg} />}

      <CreateVolumeDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={async (name, driver) => {
          try {
            await mut.create.mutateAsync({ name, driver });
            toast.success(t('common.create'));
            setCreateOpen(false);
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('common.error'));
          }
        }}
      />
      <ConfirmDialog {...dialogProps} />
      {browse && (
        <VolumeBrowser endpoint={browse._endpointId} volume={browse.name} onClose={() => setBrowse(null)} />
      )}
    </Page>
  );
}

function CreateVolumeDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, driver: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [driver, setDriver] = useState('local');
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogTitle>{t('volumes.create')}</DialogTitle>
        <div className="mt-4 space-y-3">
          <div>
            <Label htmlFor="vname">{t('common.name')}</Label>
            <Input id="vname" value={name} onChange={(e) => setName(e.target.value)} className="font-mono" autoFocus />
          </div>
          <div>
            <Label htmlFor="vdriver">{t('volumes.driver')}</Label>
            <Input id="vdriver" value={driver} onChange={(e) => setDriver(e.target.value)} className="font-mono" />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => onCreate(name.trim(), driver.trim() || 'local')} disabled={!name.trim()}>
            {t('common.create')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { NetworkSummary } from '@containly/shared';
import { useEndpoints } from '../app/EndpointContext';
import { useAuth } from '../app/AuthContext';
import { useNetworkMutations } from '../hooks/resources';
import { useScopedList, type ScopedItem } from '../hooks/useScopedList';
import { useConfirm } from '../hooks/useConfirm';
import { Page, PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/Button';
import { Checkbox } from '../components/ui/Checkbox';
import { Badge, Input, Label } from '../components/ui/primitives';
import { Select } from '../components/ui/Select';
import { ResizableTable, Tr, Td, useColumnResize, type Column } from '../components/ui/Table';
import { useTablePrefs } from '../hooks/useTablePrefs';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/Dialog';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from '../components/ui/Pagination';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { toast } from '../components/Toaster';
import { api, ApiError } from '../lib/api';
import { shortId } from '../lib/utils';

type Row = NetworkSummary & ScopedItem;

const NET_WIDTHS: Record<string, number> = {
  name: 280,
  driver: 130,
  host: 130,
  scope: 110,
  subnet: 180,
  containers: 130,
  actions: 90,
};
const NET_SORT: Record<string, (r: Row) => string | number> = {
  name: (r) => r.name.toLowerCase(),
  driver: (r) => r.driver.toLowerCase(),
  scope: (r) => r.scope.toLowerCase(),
  subnet: (r) => r.subnet ?? '',
  containers: (r) => r.containers,
};

export function NetworksPage() {
  const { t } = useTranslation();
  const { selected, isAll } = useEndpoints();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const mut = useNetworkMutations(selected);
  const { data, isLoading, isError, error, refetch } = useScopedList<
    NetworkSummary,
    { networks: NetworkSummary[] }
  >('networks', (d) => d.networks, 15_000);
  const { confirm, dialogProps } = useConfirm();
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const invalidate = (id: string) => void qc.invalidateQueries({ queryKey: ['networks', id] });

  const { widths, setWidth, commitWidths, sort, toggleSort } = useTablePrefs('networks', NET_WIDTHS, {
    col: 'name',
    dir: 'asc',
  });
  const startResize = useColumnResize(widths, setWidth, commitWidths);
  const columns = useMemo<Column[]>(() => {
    const cols: Column[] = [
      { key: 'name', label: t('networks.columns.name'), sortable: true, resizable: true, align: 'left' },
      { key: 'driver', label: t('networks.columns.driver'), sortable: true, resizable: true, align: 'left' },
    ];
    if (isAll) cols.push({ key: 'host', label: t('common.host'), resizable: true, align: 'left' });
    cols.push({ key: 'scope', label: t('networks.columns.scope'), sortable: true, resizable: true, align: 'left' });
    cols.push({ key: 'subnet', label: t('networks.columns.subnet'), sortable: true, resizable: true, align: 'left' });
    cols.push({ key: 'containers', label: t('networks.containers'), sortable: true, resizable: true, align: 'right' });
    cols.push({ key: 'actions', label: t('common.actions'), align: 'right' });
    return cols;
  }, [t, isAll]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q ? data.filter((n) => n.name.toLowerCase().includes(q)) : data;
    const acc = NET_SORT[sort.col];
    if (acc) {
      const dir = sort.dir === 'asc' ? 1 : -1;
      list = [...list].sort((a, b) => {
        const av = acc(a);
        const bv = acc(b);
        return av < bv ? -dir : av > bv ? dir : 0;
      });
    }
    return list;
  }, [data, query, sort]);

  const pg = usePagination(filtered, 10);

  const doRemove = async (net: Row): Promise<void> => {
    const ok = await confirm({
      title: t('common.remove'),
      description: t('networks.removeConfirm', { name: net.name }),
      danger: true,
      confirmLabel: t('common.remove'),
    });
    if (!ok) return;
    try {
      await api.delete(
        `/api/networks/${encodeURIComponent(net.id)}?endpoint=${encodeURIComponent(net._endpointId)}`,
      );
      invalidate(net._endpointId);
      toast.success(t('common.remove'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  };

  const doPrune = async (): Promise<void> => {
    if (isAll) return;
    const ok = await confirm({ title: t('networks.prune'), description: t('networks.pruneConfirm'), danger: true, confirmLabel: t('networks.prune') });
    if (!ok) return;
    try {
      await mut.prune.mutateAsync();
      toast.success(t('networks.prune'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow={t('app.name')}
        title={t('networks.title')}
        actions={
          isAdmin &&
          !isAll && (
            <>
              <Button variant="subtle" size="sm" onClick={() => void doPrune()}>
                <Trash2 className="h-4 w-4" /> {t('networks.prune')}
              </Button>
              <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> {t('networks.create')}
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
        <EmptyState title={t('networks.noNetworks')} />
      ) : (
        <ResizableTable
          columns={columns}
          widths={widths}
          sort={sort}
          onSort={toggleSort}
          onResizeStart={startResize}
        >
          <tbody>
            {pg.pageItems.map((net) => (
              <Tr key={net._endpointId + net.id}>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">{net.name}</span>
                    {net.system && <Badge tone="neutral">{t('networks.system')}</Badge>}
                    {net.internal && <Badge tone="warn">internal</Badge>}
                  </div>
                  <span className="font-mono text-[11px] text-faint">{shortId(net.id)}</span>
                </Td>
                <Td><span className="text-muted">{net.driver}</span></Td>
                {isAll && <Td><Badge tone="neutral">{net._endpointName}</Badge></Td>}
                <Td><span className="text-muted">{net.scope}</span></Td>
                <Td><span className="font-mono text-[11px] text-faint">{net.subnet ?? '—'}</span></Td>
                <Td className="text-right"><span className="tabular text-muted">{net.containers}</span></Td>
                <Td className="text-right">
                  {isAdmin && !net.system && (
                    <button
                      title={t('common.remove')}
                      onClick={() => void doRemove(net)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </ResizableTable>
      )}

      {!isLoading && !isError && filtered.length > 0 && <Pagination pg={pg} />}

      <CreateNetworkDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={async (name, driver, internal) => {
          try {
            await mut.create.mutateAsync({ name, driver, internal });
            toast.success(t('common.create'));
            setCreateOpen(false);
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('common.error'));
          }
        }}
      />
      <ConfirmDialog {...dialogProps} loading={mut.remove.isPending || mut.prune.isPending} />
    </Page>
  );
}

function CreateNetworkDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, driver: string, internal: boolean) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [driver, setDriver] = useState('bridge');
  const [internal, setInternal] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogTitle>{t('networks.create')}</DialogTitle>
        <div className="mt-4 space-y-3">
          <div>
            <Label htmlFor="nname">{t('common.name')}</Label>
            <Input id="nname" value={name} onChange={(e) => setName(e.target.value)} className="font-mono" autoFocus />
          </div>
          <div>
            <Label>{t('networks.driver')}</Label>
            <Select
              value={driver}
              onChange={setDriver}
              className="w-full"
              options={[
                { value: 'bridge', label: 'bridge' },
                { value: 'macvlan', label: 'macvlan' },
                { value: 'ipvlan', label: 'ipvlan' },
                { value: 'overlay', label: 'overlay' },
              ]}
            />
          </div>
          <button
            type="button"
            onClick={() => setInternal((v) => !v)}
            className="flex items-center gap-2 text-sm text-muted"
          >
            <Checkbox checked={internal} onChange={() => setInternal((v) => !v)} aria-label="internal" />
            internal
          </button>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => onCreate(name.trim(), driver, internal)} disabled={!name.trim()}>
            {t('common.create')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

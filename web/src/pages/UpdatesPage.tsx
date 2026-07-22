import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpCircle, CheckCircle2, Download, HelpCircle, RefreshCw } from 'lucide-react';
import { useEndpoints } from '../app/EndpointContext';
import { useAuth } from '../app/AuthContext';
import { useUpdates, useUpdateBulk, type UpdateRow } from '../hooks/updates';
import { usePagination } from '../hooks/usePagination';
import { Page, PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge, Card } from '../components/ui/primitives';
import { TableWrap, THead, Th, Tr, Td } from '../components/ui/Table';
import { Pagination } from '../components/ui/Pagination';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { toast } from '../components/Toaster';
import { api, ApiError } from '../lib/api';
import { relativeTime } from '../lib/time';
import { cn } from '../lib/utils';

export function UpdatesPage() {
  const { t } = useTranslation();
  const { isAll } = useEndpoints();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data, checkedAt, isLoading, isError, error, forceCheck } = useUpdates();
  const bulk = useUpdateBulk();
  const [onlyUpdates, setOnlyUpdates] = useState(true);
  const [checking, setChecking] = useState(false);
  const [pullingKey, setPullingKey] = useState<string | null>(null);

  const filtered = useMemo(
    () => (onlyUpdates ? data.filter((r) => r.updateAvailable) : data),
    [data, onlyUpdates],
  );
  const pg = usePagination(filtered, 10);
  const pending = useMemo(() => data.filter((r) => r.updateAvailable), [data]);
  const updateCount = pending.length;
  const pendingEndpoints = useMemo(() => [...new Set(pending.map((r) => r._endpointId))], [pending]);
  const locked = bulk.running || pullingKey !== null;

  const check = async (): Promise<void> => {
    setChecking(true);
    try {
      await forceCheck();
    } finally {
      setChecking(false);
    }
  };

  const pull = async (row: UpdateRow): Promise<void> => {
    if (locked) return;
    setPullingKey(row._endpointId + row.image);
    try {
      const res = await api.post<{ recreated: string[] }>('/api/updates/apply', {
        endpoint: row._endpointId,
        image: row.image,
      });
      void qc.invalidateQueries({ queryKey: ['updates', row._endpointId] });
      void qc.invalidateQueries({ queryKey: ['images', row._endpointId] });
      void qc.invalidateQueries({ queryKey: ['containers', row._endpointId] });
      void qc.invalidateQueries({ queryKey: ['stacks'] });
      toast.success(
        res.recreated.length > 0
          ? t('updates.updatedRecreated', { image: row.image, count: res.recreated.length })
          : t('updates.pulled', { image: row.image }),
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setPullingKey(null);
    }
  };

  const pct = bulk.total > 0 ? Math.round((bulk.done / bulk.total) * 100) : 0;

  return (
    <Page>
      <PageHeader
        eyebrow={t('app.name')}
        title={t('updates.title')}
        subtitle={
          checkedAt
            ? `${t('updates.lastChecked')} ${relativeTime(checkedAt)}${updateCount ? ` · ${updateCount} ${t('updates.available')}` : ''}`
            : t('updates.subtitle')
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex h-9 items-center rounded-md border border-border p-0.5">
              {[
                { k: true, label: t('updates.onlyUpdates') },
                { k: false, label: t('common.all') },
              ].map((o) => (
                <button
                  key={String(o.k)}
                  onClick={() => setOnlyUpdates(o.k)}
                  className={cn(
                    'flex h-full items-center rounded px-3 text-[13px] font-medium transition-colors',
                    onlyUpdates === o.k ? 'bg-primary text-primary-ink' : 'text-muted hover:text-ink',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <Button variant="secondary" size="md" onClick={() => void check()} loading={checking} disabled={bulk.running}>
              <RefreshCw className={cn('h-4 w-4', checking && 'animate-spin')} /> {t('updates.check')}
            </Button>
            {isAdmin && (updateCount > 0 || bulk.running) && (
              <Button
                variant="primary"
                size="md"
                onClick={() => void bulk.start(pendingEndpoints)}
                loading={bulk.running}
                disabled={bulk.running || updateCount === 0}
              >
                <Download className="h-4 w-4" />
                {bulk.running
                  ? t('updates.bulkProgress', { done: bulk.done, total: bulk.total })
                  : t('updates.updateAll', { count: updateCount })}
              </Button>
            )}
          </div>
        }
      />

      {bulk.running && (
        <Card className="mb-4 p-4">
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-ink">{t('updates.bulkProgress', { done: bulk.done, total: bulk.total })}</span>
            {bulk.current && <span className="min-w-0 truncate font-mono text-[12px] text-muted">{bulk.current}</span>}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </Card>
      )}

      {isLoading ? (
        <LoadingState label={t('updates.checking')} />
      ) : isError ? (
        <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void check()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-8 w-8 text-run" />}
          title={onlyUpdates ? t('updates.allUptodate') : t('states.emptyTitle')}
          hint={onlyUpdates ? t('updates.allUptodateHint') : ''}
        />
      ) : (
        <>
          <TableWrap>
            <THead>
              <Th>{t('images.title')}</Th>
              {isAll && <Th>{t('common.host')}</Th>}
              <Th>{t('updates.usedBy')}</Th>
              <Th>{t('common.status')}</Th>
              <Th className="text-right">{t('common.actions')}</Th>
            </THead>
            <tbody>
              {pg.pageItems.map((row) => (
                <Tr key={row._endpointId + row.image}>
                  <Td><span className="font-mono text-[12.5px] text-ink">{row.image}</span></Td>
                  {isAll && <Td><Badge tone="neutral">{row._endpointName}</Badge></Td>}
                  <Td>
                    {row.containers.length > 0 ? (
                      <span className="text-muted">{row.containers.join(', ')}</span>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </Td>
                  <Td><StatusBadge row={row} /></Td>
                  <Td className="text-right">
                    {isAdmin && row.updateAvailable && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => void pull(row)}
                        loading={pullingKey === row._endpointId + row.image}
                        disabled={locked}
                      >
                        <Download className="h-4 w-4" /> {t('updates.update')}
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
          <Pagination pg={pg} />
        </>
      )}
    </Page>
  );
}

function StatusBadge({ row }: { row: UpdateRow }) {
  const { t } = useTranslation();
  if (row.status === 'update')
    return (
      <Badge tone="signal">
        <ArrowUpCircle className="h-3.5 w-3.5" /> {t('updates.statusUpdate')}
      </Badge>
    );
  if (row.status === 'uptodate')
    return (
      <Badge tone="run">
        <CheckCircle2 className="h-3.5 w-3.5" /> {t('updates.statusUptodate')}
      </Badge>
    );
  return (
    <Badge tone="neutral" title={row.error ?? undefined}>
      <HelpCircle className="h-3.5 w-3.5" /> {t('updates.statusUnknown')}
    </Badge>
  );
}

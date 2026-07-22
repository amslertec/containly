import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpCircle, Download, Layers as LayersIcon, Search, ShieldHalf, Tag as TagIcon, Trash2, X } from 'lucide-react';
import type { ImageSummary, PruneResult } from '@containly/shared';
import { useEndpoints } from '../app/EndpointContext';
import { useAuth } from '../app/AuthContext';
import { useConfirm } from '../hooks/useConfirm';
import { useScopedList, type ScopedItem } from '../hooks/useScopedList';
import { useUpdateFlags } from '../hooks/updates';
import { useVulns } from '../hooks/vulns';
import { VulnBadges } from '../components/VulnBadges';
import { CveModal } from '../components/CveModal';
import { ImageLayersModal } from '../components/ImageLayersModal';
import type { CveDetail } from '@containly/shared';
import { Page, PageHeader } from '../components/PageHeader';
import { ImageSearchInput } from '../components/ImageSearchInput';
import { Button } from '../components/ui/Button';
import { Badge, Input, Label } from '../components/ui/primitives';
import { ResizableTable, Tr, Td, useColumnResize, type Column } from '../components/ui/Table';
import { useTablePrefs, sortRows } from '../hooks/useTablePrefs';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/Dialog';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from '../components/ui/Pagination';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { toast } from '../components/Toaster';
import { api, ApiError } from '../lib/api';
import { relativeTime } from '../lib/time';
import { formatBytes, shortId } from '../lib/utils';

type Row = ImageSummary & ScopedItem;

const IMG_WIDTHS: Record<string, number> = {
  tag: 300,
  id: 120,
  usedBy: 180,
  security: 180,
  host: 130,
  size: 100,
  created: 140,
  actions: 100,
};
const IMG_SORT: Record<string, (r: Row) => string | number> = {
  tag: (r) => (r.repoTags[0] ?? '').toLowerCase(),
  size: (r) => r.size,
  created: (r) => r.created,
};

export function ImagesPage() {
  const { t } = useTranslation();
  const { selected, isAll } = useEndpoints();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useScopedList<
    ImageSummary,
    { images: ImageSummary[] }
  >('images', (d) => d.images, 15_000);
  const { confirm, dialogProps } = useConfirm();
  const [query, setQuery] = useState('');
  const [pullValue, setPullValue] = useState('');
  const [pulling, setPulling] = useState(false);
  const [tagImage, setTagImage] = useState<Row | null>(null);
  const invalidate = (endpointId: string) => void qc.invalidateQueries({ queryKey: ['images', endpointId] });
  const updates = useUpdateFlags();
  const vulns = useVulns();
  const [rescanning, setRescanning] = useState(false);
  const [cveModal, setCveModal] = useState<{ img: Row; sev: CveDetail['severity'] | 'ALL' } | null>(null);
  const [layersImg, setLayersImg] = useState<Row | null>(null);

  const doRescan = async (): Promise<void> => {
    if (isAll) return;
    setRescanning(true);
    try {
      await api.post(`/api/images/rescan?endpoint=${encodeURIComponent(selected)}`);
      toast.success(t('vulns.rescanStarted'));
      void qc.invalidateQueries({ queryKey: ['vulns', selected] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setRescanning(false);
    }
  };

  const { widths, setWidth, commitWidths, sort, toggleSort } = useTablePrefs('images', IMG_WIDTHS, {
    col: 'created',
    dir: 'desc',
  });
  const startResize = useColumnResize(widths, setWidth, commitWidths);
  const columns = useMemo<Column[]>(() => {
    const cols: Column[] = [
      { key: 'tag', label: t('images.columns.tag'), sortable: true, resizable: true, align: 'left' },
      { key: 'id', label: t('images.columns.id'), resizable: true, align: 'left' },
      { key: 'usedBy', label: t('images.columns.usedBy'), resizable: true, align: 'left' },
      { key: 'security', label: t('images.columns.security'), resizable: true, align: 'left' },
    ];
    if (isAll) cols.push({ key: 'host', label: t('common.host'), resizable: true, align: 'left' });
    cols.push({ key: 'size', label: t('images.columns.size'), sortable: true, resizable: true, align: 'right' });
    cols.push({ key: 'created', label: t('images.columns.created'), sortable: true, resizable: true, align: 'left' });
    cols.push({ key: 'actions', label: t('common.actions'), align: 'right' });
    return cols;
  }, [t, isAll]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? data.filter(
          (i) => i.repoTags.some((tg) => tg.toLowerCase().includes(q)) || i.id.toLowerCase().includes(q),
        )
      : data;
    const acc = IMG_SORT[sort.col];
    return acc ? sortRows(list, acc, sort.dir, (i) => i.id) : list;
  }, [data, query, sort]);

  const pg = usePagination(filtered, 10);

  const totals = useMemo(() => {
    const size = data.reduce((a, i) => a + i.size, 0);
    const reclaimable = data.filter((i) => i.containers === 0).reduce((a, i) => a + i.size, 0);
    return { size, reclaimable };
  }, [data]);

  const doPull = async (): Promise<void> => {
    const image = pullValue.trim();
    if (!image || isAll) return;
    setPulling(true);
    try {
      await api.post(`/api/images/pull?endpoint=${encodeURIComponent(selected)}`, { image });
      invalidate(selected);
      toast.success(`${t('images.pull')}: ${image}`);
      setPullValue('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setPulling(false);
    }
  };

  const doRemove = async (img: Row): Promise<void> => {
    const name = img.repoTags[0] ?? shortId(img.id);
    const ok = await confirm({
      title: t('common.remove'),
      description: t('images.removeConfirm', { name }),
      danger: true,
      confirmLabel: t('common.remove'),
    });
    if (!ok) return;
    try {
      await api.delete(
        `/api/images?endpoint=${encodeURIComponent(img._endpointId)}&ref=${encodeURIComponent(img.repoTags[0] ?? img.id)}&force=${img.containers > 0}`,
      );
      invalidate(img._endpointId);
      toast.success(t('common.remove'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  };

  // Einen einzelnen Tag entfernen (untag). Nur wenn es der letzte Tag ist + in Verwendung
  // ist `force` nötig — sonst reicht das reine Ent-Taggen.
  const doRemoveTag = async (img: Row, tag: string): Promise<void> => {
    const ok = await confirm({
      title: t('images.untag'),
      description: t('images.untagConfirm', { name: tag }),
      danger: true,
      confirmLabel: t('images.untag'),
    });
    if (!ok) return;
    const force = img.repoTags.length <= 1 && img.containers > 0;
    try {
      await api.delete(
        `/api/images?endpoint=${encodeURIComponent(img._endpointId)}&ref=${encodeURIComponent(tag)}&force=${force}`,
      );
      invalidate(img._endpointId);
      toast.success(t('images.untagged', { name: tag }));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  };

  const doPrune = async (): Promise<void> => {
    if (isAll) return;
    const ok = await confirm({
      title: t('images.prune'),
      description: t('images.pruneConfirm'),
      danger: true,
      confirmLabel: t('images.prune'),
    });
    if (!ok) return;
    try {
      const res = await api.post<{ result: PruneResult }>(
        `/api/images/prune?endpoint=${encodeURIComponent(selected)}`,
      );
      invalidate(selected);
      toast.success(`${t('images.prune')} · ${formatBytes(res.result.spaceReclaimed)}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow={t('app.name')}
        title={t('images.title')}
        subtitle={data ? `${t('images.totalSize')}: ${formatBytes(totals.size)} · ${t('images.reclaimable')}: ${formatBytes(totals.reclaimable)}` : undefined}
        actions={
          isAdmin &&
          !isAll && (
            <div className="flex flex-wrap items-center gap-2">
              {vulns.scanning && (
                <span className="text-xs text-muted">
                  {t('vulns.scanProgress', { done: vulns.done, total: vulns.total })}
                </span>
              )}
              <Button variant="subtle" size="sm" onClick={() => void doRescan()} loading={rescanning} disabled={vulns.scanning}>
                <ShieldHalf className="h-4 w-4" /> {t('vulns.rescan')}
              </Button>
              <Button variant="subtle" size="sm" onClick={() => void doPrune()}>
                <Trash2 className="h-4 w-4" /> {t('images.prune')}
              </Button>
            </div>
          )
        }
      />

      {isAdmin && isAll && (
        <p className="mb-4 text-xs text-muted">{t('scope.pickHostForActions')}</p>
      )}

      {isAdmin && !isAll && (
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div className="flex-1" style={{ minWidth: 240 }}>
            <Label htmlFor="pull">{t('images.pull')}</Label>
            <div className="flex gap-2">
              <ImageSearchInput
                value={pullValue}
                onChange={setPullValue}
                onEnter={() => void doPull()}
                placeholder={t('images.pullPlaceholder')}
                disabled={pulling}
              />
              <Button variant="primary" size="md" onClick={() => void doPull()} loading={pulling} disabled={!pullValue.trim()}>
                <Download className="h-4 w-4" /> {t('images.pull')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('common.search')} className="pl-8" />
      </div>

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState title={t('images.noImages')} />
      ) : (
        <ResizableTable
          columns={columns}
          widths={widths}
          sort={sort}
          onSort={toggleSort}
          onResizeStart={startResize}
        >
          <tbody>
            {pg.pageItems.map((img) => (
              <Tr key={img.id}>
                <Td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {img.repoTags.length > 0 ? (
                      img.repoTags.map((tg) => (
                        <span
                          key={tg}
                          className="group/tag inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12.5px] text-ink"
                        >
                          {tg}
                          {isAdmin && (
                            <button
                              title={t('images.untag')}
                              onClick={() => void doRemoveTag(img, tg)}
                              className="text-faint opacity-0 transition-opacity hover:text-danger group-hover/tag:opacity-100"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      ))
                    ) : (
                      <Badge tone="warn">{t('images.dangling')}</Badge>
                    )}
                    {img.containers > 0 ? (
                      <Badge tone="run">{t('images.inUse')}</Badge>
                    ) : img.repoTags.length > 0 ? (
                      <Badge tone="warn">{t('images.unused')}</Badge>
                    ) : null}
                    {img.repoTags.some((tg) => updates.has(img._endpointId, tg)) && (
                      <Badge tone="signal">
                        <ArrowUpCircle className="h-3.5 w-3.5" /> {t('updates.statusUpdate')}
                      </Badge>
                    )}
                  </div>
                </Td>
                <Td><span className="font-mono text-[11px] text-faint">{shortId(img.id)}</span></Td>
                <Td>
                  {img.containerNames.length > 0 ? (
                    <span className="text-[12px] text-muted">{img.containerNames.join(', ')}</span>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </Td>
                <Td>
                  <VulnBadges
                    vuln={vulns.get(img._endpointId, img.id)}
                    onOpen={(sev) => setCveModal({ img, sev })}
                  />
                </Td>
                {isAll && <Td><Badge tone="neutral">{img._endpointName}</Badge></Td>}
                <Td className="text-right"><span className="tabular text-muted">{formatBytes(img.size)}</span></Td>
                <Td><span className="text-muted">{relativeTime(img.created)}</span></Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      title={t('layers.title')}
                      onClick={() => setLayersImg(img)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
                    >
                      <LayersIcon className="h-4 w-4" />
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          title={t('images.tag')}
                          onClick={() => setTagImage(img)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
                        >
                          <TagIcon className="h-4 w-4" />
                        </button>
                        <button
                          title={t('common.remove')}
                          onClick={() => void doRemove(img)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-danger-soft hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </ResizableTable>
      )}

      {!isLoading && !isError && filtered.length > 0 && <Pagination pg={pg} />}

      <ConfirmDialog {...dialogProps} />
      <TagDialog
        image={tagImage}
        onClose={() => setTagImage(null)}
        onTag={async (repo, tag) => {
          if (!tagImage) return;
          try {
            await api.post(
              `/api/images/tag?endpoint=${encodeURIComponent(tagImage._endpointId)}`,
              { ref: tagImage.repoTags[0] ?? tagImage.id, repo, tag },
            );
            invalidate(tagImage._endpointId);
            toast.success(`${repo}:${tag}`);
            setTagImage(null);
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('common.error'));
          }
        }}
      />
      {cveModal && (
        <CveModal
          endpointId={cveModal.img._endpointId}
          imageId={cveModal.img.id}
          imageName={cveModal.img.repoTags[0] ?? shortId(cveModal.img.id)}
          initialSeverity={cveModal.sev}
          onClose={() => setCveModal(null)}
        />
      )}
      {layersImg && (
        <ImageLayersModal
          endpointId={layersImg._endpointId}
          imageId={layersImg.id}
          imageName={layersImg.repoTags[0] ?? shortId(layersImg.id)}
          onClose={() => setLayersImg(null)}
        />
      )}
    </Page>
  );
}

function TagDialog({
  image,
  onClose,
  onTag,
}: {
  image: ImageSummary | null;
  onClose: () => void;
  onTag: (repo: string, tag: string) => void;
}) {
  const { t } = useTranslation();
  const [repo, setRepo] = useState('');
  const [tag, setTag] = useState('latest');
  return (
    <Dialog open={!!image} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogTitle>{t('images.tagTitle')}</DialogTitle>
        <div className="mt-4 space-y-3">
          <div>
            <Label htmlFor="repo">{t('images.repository')}</Label>
            <Input id="repo" value={repo} onChange={(e) => setRepo(e.target.value)} className="font-mono" placeholder="registry/name" autoFocus />
          </div>
          <div>
            <Label htmlFor="tagv">{t('images.tagLabel')}</Label>
            <Input id="tagv" value={tag} onChange={(e) => setTag(e.target.value)} className="font-mono" />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => onTag(repo.trim(), tag.trim())} disabled={!repo.trim() || !tag.trim()}>
            {t('images.tag')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

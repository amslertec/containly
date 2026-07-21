import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Pagination as PaginationState, PageSize } from '../../hooks/usePagination';
import { PAGE_SIZES } from '../../hooks/usePagination';
import { Select } from './Select';
import { cn } from '../../lib/utils';

/** Fußzeile mit Bereichsanzeige, Seitengröße-Auswahl und Vor/Zurück. */
export function Pagination<T>({ pg, className }: { pg: PaginationState<T>; className?: string }) {
  const { t } = useTranslation();
  if (pg.total === 0) return null;

  const options = PAGE_SIZES.map((s: PageSize) => ({
    value: String(s),
    label: s === 'all' ? t('pagination.all') : String(s),
  }));

  return (
    <div className={cn('mt-3 flex flex-wrap items-center justify-between gap-3', className)}>
      <div className="flex items-center gap-2 text-xs text-muted">
        <span>{t('pagination.perPage')}</span>
        <Select
          value={String(pg.pageSize)}
          onChange={(v) => pg.setPageSize(v === 'all' ? 'all' : (Number(v) as PageSize))}
          options={options}
          className="h-8 w-[84px]"
        />
        <span className="tabular">
          {t('pagination.range', { start: pg.start, end: pg.end, total: pg.total })}
        </span>
      </div>

      {pg.pageCount > 1 && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => pg.setPage(Math.max(1, pg.page - 1))}
            disabled={pg.page <= 1}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted transition-colors hover:bg-surface-hover hover:text-ink disabled:opacity-40 disabled:pointer-events-none"
            aria-label={t('common.back')}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2 text-xs text-muted tabular">
            {t('pagination.page', { page: pg.page, pages: pg.pageCount })}
          </span>
          <button
            onClick={() => pg.setPage(Math.min(pg.pageCount, pg.page + 1))}
            disabled={pg.page >= pg.pageCount}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted transition-colors hover:bg-surface-hover hover:text-ink disabled:opacity-40 disabled:pointer-events-none"
            aria-label={t('common.more')}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

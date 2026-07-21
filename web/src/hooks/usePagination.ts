import { useEffect, useMemo, useState } from 'react';

export type PageSize = 10 | 25 | 50 | 100 | 'all';
export const PAGE_SIZES: PageSize[] = [10, 25, 50, 100, 'all'];

export interface Pagination<T> {
  pageItems: T[];
  page: number;
  setPage: (p: number) => void;
  pageSize: PageSize;
  setPageSize: (s: PageSize) => void;
  pageCount: number;
  total: number;
  start: number; // 1-basiert für Anzeige (0, wenn leer)
  end: number;
}

/** Client-seitige Pagination über eine bereits gefilterte Liste. */
export function usePagination<T>(items: T[], defaultSize: PageSize = 10): Pagination<T> {
  const [pageSize, setPageSizeState] = useState<PageSize>(defaultSize);
  const [page, setPage] = useState(1);

  const total = items.length;
  const size = pageSize === 'all' ? Math.max(total, 1) : pageSize;
  const pageCount = Math.max(1, Math.ceil(total / size));

  // Bei Änderung der Seitengröße oder wenn die Seite außerhalb liegt: zurücksetzen.
  const setPageSize = (s: PageSize): void => {
    setPageSizeState(s);
    setPage(1);
  };
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const pageItems = useMemo(() => {
    if (pageSize === 'all') return items;
    const from = (page - 1) * size;
    return items.slice(from, from + size);
  }, [items, page, size, pageSize]);

  const start = total === 0 ? 0 : (page - 1) * size + 1;
  const end = pageSize === 'all' ? total : Math.min(page * size, total);

  return { pageItems, page, setPage, pageSize, setPageSize, pageCount, total, start, end };
}

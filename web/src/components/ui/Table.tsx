import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { SortState } from '../../hooks/useTablePrefs';

export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">{children}</table>
      </div>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-border text-left">{children}</tr>
    </thead>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn('eyebrow whitespace-nowrap px-3 py-2.5 font-semibold first:pl-4 last:pr-4', className)}>
      {children}
    </th>
  );
}

export function Tr({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLTableRowElement>;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn('border-b border-border last:border-0 transition-colors hover:bg-surface-hover', className)}
    >
      {children}
    </tr>
  );
}

export function Td({
  children,
  className,
  onClick,
}: {
  children?: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLTableCellElement>;
}) {
  return (
    <td
      onClick={onClick}
      className={cn(
        'overflow-hidden whitespace-nowrap px-3 py-2.5 align-middle first:pl-4 last:pr-4',
        className,
      )}
    >
      {children}
    </td>
  );
}

/* ── Sortierbare + resizable Spalten ──────────────────────────────────────── */

export interface Column {
  key: string;
  label: string;
  sortable?: boolean;
  resizable?: boolean;
  align?: 'left' | 'right';
}

/** Liefert einen `startResize(key, event)`-Handler zum Ziehen der Spaltenbreite. */
export function useColumnResize(
  widths: Record<string, number>,
  setWidth: (key: string, px: number) => void,
  commitWidths: () => void,
) {
  return (key: string, e: React.MouseEvent): void => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = widths[key] ?? 120;
    const onMove = (ev: MouseEvent): void => setWidth(key, startW + (ev.clientX - startX));
    const onUp = (): void => {
      commitWidths();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
}

function ColHeader({
  col,
  first,
  sort,
  onSort,
  onResizeStart,
  children,
}: {
  col: Column;
  first: boolean;
  sort: SortState;
  onSort: (key: string) => void;
  onResizeStart: (key: string, e: React.MouseEvent) => void;
  children?: React.ReactNode;
}) {
  const active = sort.col === col.key;
  return (
    <th
      className={cn(
        'eyebrow relative select-none py-2.5 font-semibold',
        first ? 'pl-4' : 'pl-2',
        col.align === 'right' ? 'pr-4 text-right' : 'pr-3',
      )}
    >
      {children ??
        (col.sortable ? (
          <button
            onClick={() => onSort(col.key)}
            className={cn(
              'inline-flex max-w-full items-center gap-1 hover:text-ink',
              col.align === 'right' && 'flex-row-reverse',
            )}
          >
            <span className="truncate">{col.label}</span>
            {active ? (
              sort.dir === 'asc' ? (
                <ChevronUp className="h-3.5 w-3.5 shrink-0 text-primary" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-primary" />
              )
            ) : (
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-30" />
            )}
          </button>
        ) : (
          <span className="block truncate">{col.label}</span>
        ))}
      {col.resizable && (
        <span
          onMouseDown={(e) => onResizeStart(col.key, e)}
          className="group absolute right-0 top-0 z-10 flex h-full w-2 cursor-col-resize touch-none items-center justify-center"
        >
          <span className="h-1/2 w-px bg-border transition-colors group-hover:bg-primary" />
        </span>
      )}
    </th>
  );
}

/**
 * Tabelle mit sortierbaren, per Ziehen verbreiterbaren Spalten (festes Layout).
 * Sortierzustand/Breiten kommen aus `useTablePrefs`. `header(col)` kann für einzelne
 * Spalten eigenen Kopf-Inhalt liefern (z.B. eine „Alle auswählen"-Checkbox).
 */
export function ResizableTable({
  columns,
  widths,
  sort,
  onSort,
  onResizeStart,
  header,
  children,
}: {
  columns: Column[];
  widths: Record<string, number>;
  sort: SortState;
  onSort: (key: string) => void;
  onResizeStart: (key: string, e: React.MouseEvent) => void;
  header?: (col: Column) => React.ReactNode | undefined;
  children: React.ReactNode;
}) {
  const totalWidth = columns.reduce((s, c) => s + (widths[c.key] ?? 120), 0);
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="text-sm" style={{ tableLayout: 'fixed', width: totalWidth, minWidth: '100%' }}>
          <colgroup>
            {columns.map((col) => (
              <col key={col.key} style={{ width: widths[col.key] ?? 120 }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-border text-left">
              {columns.map((col, i) => (
                <ColHeader
                  key={col.key}
                  col={col}
                  first={i === 0}
                  sort={sort}
                  onSort={onSort}
                  onResizeStart={onResizeStart}
                >
                  {header?.(col)}
                </ColHeader>
              ))}
            </tr>
          </thead>
          {children}
        </table>
      </div>
    </div>
  );
}

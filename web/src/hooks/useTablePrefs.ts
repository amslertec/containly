import { useCallback, useEffect, useRef, useState } from 'react';

export interface SortState {
  col: string;
  dir: 'asc' | 'desc';
}

interface TablePrefs {
  widths: Record<string, number>;
  /** Live-Breite beim Ziehen setzen (persistiert erst bei `commitWidths`). */
  setWidth: (key: string, px: number) => void;
  commitWidths: () => void;
  sort: SortState;
  toggleSort: (col: string) => void;
}

const KEY = (id: string): string => `containly:table:${id}`;

/**
 * Persistiert Sortierung und Spaltenbreiten einer Tabelle in localStorage, sodass
 * sie beim nächsten Öffnen der Seite erhalten bleiben. `defaultWidths` liefert die
 * Startbreiten (px) je Spaltenschlüssel; `defaultSort` die Anfangssortierung.
 */
export function useTablePrefs(
  id: string,
  defaultWidths: Record<string, number>,
  defaultSort: SortState,
): TablePrefs {
  const [state, setState] = useState<{ widths: Record<string, number>; sort: SortState }>(() => {
    try {
      const raw = localStorage.getItem(KEY(id));
      if (raw) {
        const saved = JSON.parse(raw) as { widths?: Record<string, number>; sort?: SortState };
        return {
          widths: { ...defaultWidths, ...(saved.widths ?? {}) },
          sort: saved.sort ?? defaultSort,
        };
      }
    } catch {
      /* defekter Eintrag → Defaults */
    }
    return { widths: defaultWidths, sort: defaultSort };
  });

  // Aktuellen Stand für ein sofortiges Persistieren beim Loslassen der Maus halten.
  const ref = useRef(state);
  ref.current = state;
  const persist = useCallback(() => {
    try {
      localStorage.setItem(KEY(id), JSON.stringify(ref.current));
    } catch {
      /* Speicher voll/blockiert → ignorieren */
    }
  }, [id]);

  // Sortierung sofort persistieren.
  useEffect(() => {
    persist();
  }, [state.sort, persist]);

  const setWidth = useCallback((key: string, px: number) => {
    setState((s) => ({ ...s, widths: { ...s.widths, [key]: Math.max(48, Math.round(px)) } }));
  }, []);

  const toggleSort = useCallback((col: string) => {
    setState((s) => ({
      ...s,
      sort:
        s.sort.col === col
          ? { col, dir: s.sort.dir === 'asc' ? 'desc' : 'asc' }
          : { col, dir: 'asc' },
    }));
  }, []);

  return { widths: state.widths, setWidth, commitWidths: persist, sort: state.sort, toggleSort };
}

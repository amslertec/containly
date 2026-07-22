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
 * Stabil sortieren: primär nach `acc`, bei Gleichstand nach `tie` (immer aufsteigend).
 * Der Tie-Breaker verhindert, dass gleich-bewertete Zeilen (z.B. alle Treiber „local")
 * bei jeder Daten-Aktualisierung „springen", weil Docker die Liste in wechselnder
 * Reihenfolge liefert.
 */
export function sortRows<T>(
  list: T[],
  acc: (x: T) => string | number,
  dir: 'asc' | 'desc',
  tie: (x: T) => string | number,
): T[] {
  const d = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = acc(a);
    const bv = acc(b);
    if (av < bv) return -d;
    if (av > bv) return d;
    const at = tie(a);
    const bt = tie(b);
    return at < bt ? -1 : at > bt ? 1 : 0;
  });
}

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

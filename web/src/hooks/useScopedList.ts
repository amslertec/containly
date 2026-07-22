import { useQueries } from '@tanstack/react-query';
import { useEndpoints } from '../app/EndpointContext';
import { api } from '../lib/api';

/** Jedem Listeneintrag angehängte Herkunft (welcher Host). */
export interface ScopedItem {
  _endpointId: string;
  _endpointName: string;
}

export interface ScopedResult<T> {
  data: (T & ScopedItem)[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

/**
 * Lädt eine Ressourcen-Liste für die aktuelle Auswahl: ein einzelner Endpoint
 * oder — bei „Alle Hosts" — alle online-Endpoints kombiniert. Jeder Eintrag wird
 * mit seiner Host-Herkunft markiert, damit Aktionen den richtigen Host treffen.
 */
export function useScopedList<T, R>(
  path: 'containers' | 'images' | 'volumes' | 'networks',
  // Antwortform variiert je Ressource → gezielter Extractor vom Aufrufer.
  pick: (d: R) => T[],
  refetchInterval = 5_000,
): ScopedResult<T> {
  const { endpoints, scopeIds } = useEndpoints();
  const nameById = new Map(endpoints.map((e) => [e.id, e.name]));

  const results = useQueries({
    queries: scopeIds.map((id) => ({
      queryKey: [path, id],
      queryFn: () => api.get<R>(`/api/${path}?endpoint=${encodeURIComponent(id)}`),
      refetchInterval,
      select: (d: R) =>
        pick(d).map((item) => ({
          ...item,
          _endpointId: id,
          _endpointName: nameById.get(id) ?? id,
        })),
    })),
  });

  return {
    data: results.flatMap((r) => (r.data as (T & ScopedItem)[] | undefined) ?? []),
    isLoading: results.some((r) => r.isLoading),
    isFetching: results.some((r) => r.isFetching),
    isError: results.some((r) => r.isError),
    error: results.find((r) => r.isError)?.error,
    refetch: () => results.forEach((r) => void r.refetch()),
  };
}

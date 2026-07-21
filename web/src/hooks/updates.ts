import { useEffect, useRef } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { BulkJob, UpdateItem, UpdatesResponse } from '@containly/shared';
import { useEndpoints } from '../app/EndpointContext';
import { api } from '../lib/api';
import type { ScopedItem } from './useScopedList';

export interface UpdateRow extends UpdateItem, ScopedItem {}

export function useUpdates() {
  const { endpoints, scopeIds } = useEndpoints();
  const qc = useQueryClient();
  const nameById = new Map(endpoints.map((e) => [e.id, e.name]));

  const results = useQueries({
    queries: scopeIds.map((id) => ({
      queryKey: ['updates', id],
      queryFn: () => api.get<UpdatesResponse>(`/api/updates?endpoint=${encodeURIComponent(id)}`),
      staleTime: 5 * 60_000,
      select: (d: UpdatesResponse) => ({
        checkedAt: d.checkedAt,
        items: d.items.map((it) => ({ ...it, _endpointId: id, _endpointName: nameById.get(id) ?? id })),
      }),
    })),
  });

  const data: UpdateRow[] = results.flatMap((r) => r.data?.items ?? []);
  const checkedAt = results
    .map((r) => r.data?.checkedAt)
    .filter(Boolean)
    .sort()
    .at(-1) as string | undefined;

  /** Erzwingt eine frische Registry-Prüfung (refresh=1) je Host und lädt neu. */
  const forceCheck = async (): Promise<void> => {
    await Promise.all(
      scopeIds.map((id) =>
        api.get<UpdatesResponse>(`/api/updates?endpoint=${encodeURIComponent(id)}&refresh=1`).catch(() => null),
      ),
    );
    await qc.invalidateQueries({ queryKey: ['updates'] });
  };

  return {
    data,
    checkedAt,
    isLoading: results.some((r) => r.isLoading),
    isError: results.some((r) => r.isError),
    error: results.find((r) => r.isError)?.error,
    forceCheck,
  };
}

/**
 * Leichter Indikator-Hook für Containers-/Images-Seiten: liefert `has(endpoint, image)`,
 * das true ergibt, wenn für dieses Image auf dem Endpoint ein Update verfügbar ist.
 * Nutzt denselben (serverseitig gecachten) Update-Datensatz wie die Updates-Seite.
 */
export function useUpdateFlags(): { has: (endpointId: string, image: string) => boolean } {
  const { data } = useUpdates();
  const set = new Set(data.filter((r) => r.updateAvailable).map((r) => `${r._endpointId}::${r.image}`));
  return { has: (endpointId, image) => set.has(`${endpointId}::${image}`) };
}

/**
 * Serverseitiger Bulk-Update-Job je Endpoint im Scope. Der Fortschritt überlebt
 * Client-Reloads (der Job läuft im Server weiter); nach Fertigstellung wird die
 * Update-Liste automatisch aufgefrischt.
 */
export function useUpdateBulk() {
  const { scopeIds } = useEndpoints();
  const qc = useQueryClient();
  const results = useQueries({
    queries: scopeIds.map((id) => ({
      queryKey: ['update-bulk', id],
      queryFn: () => api.get<BulkJob>(`/api/updates/bulk?endpoint=${encodeURIComponent(id)}`),
      refetchInterval: (q: { state: { data?: BulkJob } }) =>
        q.state.data?.status === 'running' ? 1500 : false,
    })),
  });
  const jobs = results.map((r) => r.data).filter(Boolean) as BulkJob[];
  const running = jobs.some((j) => j.status === 'running');
  const total = jobs.reduce((a, j) => a + j.total, 0);
  const done = jobs.reduce((a, j) => a + j.done, 0);
  const current = jobs.find((j) => j.status === 'running')?.current ?? null;

  // Sobald ein Job fertig ist → Update-Liste des Endpoints auffrischen.
  const doneSig = jobs.filter((j) => j.status === 'done').map((j) => j.endpoint).sort().join(',');
  const lastDone = useRef('');
  useEffect(() => {
    if (doneSig && doneSig !== lastDone.current) {
      lastDone.current = doneSig;
      for (const ep of doneSig.split(',')) void qc.invalidateQueries({ queryKey: ['updates', ep] });
    }
  }, [doneSig, qc]);

  const start = async (endpoints: string[]): Promise<void> => {
    await Promise.all(endpoints.map((id) => api.post('/api/updates/bulk', { endpoint: id }).catch(() => null)));
    await Promise.all(scopeIds.map((id) => qc.invalidateQueries({ queryKey: ['update-bulk', id] })));
  };

  return { running, total, done, current, start };
}

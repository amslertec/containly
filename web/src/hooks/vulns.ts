import { useQueries } from '@tanstack/react-query';
import type { ImageVuln, VulnScanState } from '@containly/shared';
import { useEndpoints } from '../app/EndpointContext';
import { api } from '../lib/api';

/**
 * Liefert die gecachten Trivy-Vulnerability-Ergebnisse für den aktuellen Scope, als
 * schneller `get(endpointId, imageId)`-Zugriff plus Scan-Fortschritt. Pollt moderat,
 * damit die Badges während eines laufenden Hintergrund-Scans nachwachsen.
 */
export function useVulns(): {
  get: (endpointId: string, imageId: string) => ImageVuln | undefined;
  scanning: boolean;
  done: number;
  total: number;
} {
  const { scopeIds } = useEndpoints();

  const results = useQueries({
    queries: scopeIds.map((id) => ({
      queryKey: ['vulns', id],
      queryFn: () => api.get<VulnScanState>(`/api/images/vulnerabilities?endpoint=${encodeURIComponent(id)}`),
      refetchInterval: 20_000,
      staleTime: 10_000,
    })),
  });

  // Index (endpointId → imageId → vuln) für O(1)-Lookup in der Tabelle.
  const byEndpoint = new Map<string, Map<string, ImageVuln>>();
  let scanning = false;
  let done = 0;
  let total = 0;
  results.forEach((r, i) => {
    const id = scopeIds[i]!;
    const state = r.data;
    if (!state) return;
    byEndpoint.set(id, new Map(state.vulns.map((v) => [v.imageId, v])));
    scanning = scanning || state.scanning;
    done += state.done;
    total += state.total;
  });

  return {
    get: (endpointId, imageId) => byEndpoint.get(endpointId)?.get(imageId),
    scanning,
    done,
    total,
  };
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { VersionInfo } from '@containly/shared';
import { api } from '../lib/api';

/** Self-update check against the latest GitHub release (server-cached 6 h). */
export function useVersion() {
  return useQuery({
    queryKey: ['version'],
    queryFn: () => api.get<VersionInfo>('/api/version'),
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/** Forces a fresh check (bypasses the 6 h cache) and updates the cached query. */
export function useVersionCheck() {
  const qc = useQueryClient();
  return async (): Promise<VersionInfo> => {
    const data = await api.get<VersionInfo>('/api/version?force=true');
    qc.setQueryData(['version'], data);
    return data;
  };
}

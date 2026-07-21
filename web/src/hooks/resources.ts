import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ImageSummary, NetworkSummary, PruneResult, VolumeSummary } from '@containly/shared';
import { api } from '../lib/api';

const q = (endpoint: string) => `?endpoint=${encodeURIComponent(endpoint)}`;

/* Images */
export function useImages(endpoint: string) {
  return useQuery({
    queryKey: ['images', endpoint],
    queryFn: () => api.get<{ images: ImageSummary[] }>(`/api/images${q(endpoint)}`),
    select: (d) => d.images,
    refetchInterval: 15_000,
  });
}
export function useImageMutations(endpoint: string) {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['images', endpoint] });
  return {
    pull: useMutation({
      mutationFn: (image: string) => api.post(`/api/images/pull${q(endpoint)}`, { image }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: ({ id, force }: { id: string; force: boolean }) =>
        api.delete(`/api/images/${encodeURIComponent(id)}${q(endpoint)}&force=${force}`),
      onSuccess: invalidate,
    }),
    tag: useMutation({
      mutationFn: ({ id, repo, tag }: { id: string; repo: string; tag: string }) =>
        api.post(`/api/images/${encodeURIComponent(id)}/tag${q(endpoint)}`, { repo, tag }),
      onSuccess: invalidate,
    }),
    prune: useMutation({
      mutationFn: () => api.post<{ result: PruneResult }>(`/api/images/prune${q(endpoint)}`),
      onSuccess: invalidate,
    }),
  };
}

/* Volumes */
export function useVolumes(endpoint: string) {
  return useQuery({
    queryKey: ['volumes', endpoint],
    queryFn: () => api.get<{ volumes: VolumeSummary[] }>(`/api/volumes${q(endpoint)}`),
    select: (d) => d.volumes,
    refetchInterval: 15_000,
  });
}
export function useVolumeMutations(endpoint: string) {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['volumes', endpoint] });
  return {
    create: useMutation({
      mutationFn: (body: { name: string; driver: string }) =>
        api.post(`/api/volumes${q(endpoint)}`, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (name: string) => api.delete(`/api/volumes/${encodeURIComponent(name)}${q(endpoint)}`),
      onSuccess: invalidate,
    }),
    prune: useMutation({
      mutationFn: () => api.post<{ result: PruneResult }>(`/api/volumes/prune${q(endpoint)}`),
      onSuccess: invalidate,
    }),
  };
}

/* Networks */
export function useNetworks(endpoint: string) {
  return useQuery({
    queryKey: ['networks', endpoint],
    queryFn: () => api.get<{ networks: NetworkSummary[] }>(`/api/networks${q(endpoint)}`),
    select: (d) => d.networks,
    refetchInterval: 15_000,
  });
}
export function useNetworkMutations(endpoint: string) {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['networks', endpoint] });
  return {
    create: useMutation({
      mutationFn: (body: { name: string; driver: string; internal: boolean }) =>
        api.post(`/api/networks${q(endpoint)}`, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/api/networks/${encodeURIComponent(id)}${q(endpoint)}`),
      onSuccess: invalidate,
    }),
    prune: useMutation({
      mutationFn: () => api.post<{ result: PruneResult }>(`/api/networks/prune${q(endpoint)}`),
      onSuccess: invalidate,
    }),
  };
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ContainerAction,
  ContainerInspect,
  ContainerSummary,
} from '@containly/shared';
import { api } from '../lib/api';

export function useContainers(endpoint: string, options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: ['containers', endpoint],
    queryFn: () =>
      api.get<{ containers: ContainerSummary[] }>(
        `/api/containers?endpoint=${encodeURIComponent(endpoint)}`,
      ),
    refetchInterval: options?.refetchInterval ?? 5_000,
    select: (d) => d.containers,
  });
}

export function useContainerInspect(endpoint: string, id: string, enabled = true) {
  return useQuery({
    queryKey: ['container', endpoint, id],
    queryFn: () =>
      api.get<{ container: ContainerInspect }>(
        `/api/containers/${encodeURIComponent(id)}?endpoint=${encodeURIComponent(endpoint)}`,
      ),
    enabled,
    select: (d) => d.container,
    refetchInterval: 8_000,
  });
}

export function useContainerAction(endpoint: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: ContainerAction }) =>
      api.post(
        `/api/containers/${encodeURIComponent(id)}/${action}?endpoint=${encodeURIComponent(endpoint)}`,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['containers', endpoint] });
    },
  });
}

export function useRemoveContainer(endpoint: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, force, volumes }: { id: string; force: boolean; volumes: boolean }) =>
      api.delete(
        `/api/containers/${encodeURIComponent(id)}?endpoint=${encodeURIComponent(endpoint)}&force=${force}&volumes=${volumes}`,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['containers', endpoint] });
    },
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StackActionName, StackDetail, StackFile, StackSummary } from '@containly/shared';
import { api } from '../lib/api';

export function useStacks() {
  return useQuery({
    queryKey: ['stacks'],
    queryFn: () => api.get<{ stacks: StackSummary[] }>('/api/stacks'),
    select: (d) => d.stacks,
    refetchInterval: 10_000,
  });
}

/** Archivierte Stacks (in `<stackPath>/ARCHIV/`); nur laden, wenn die Ansicht offen ist. */
export function useArchivedStacks(enabled: boolean) {
  return useQuery({
    queryKey: ['stacks', 'archived'],
    queryFn: () => api.get<{ stacks: StackSummary[] }>('/api/stacks/archived'),
    select: (d) => d.stacks,
    enabled,
    refetchInterval: enabled ? 10_000 : false,
  });
}

export function useStack(id: string | null) {
  return useQuery({
    queryKey: ['stack', id],
    queryFn: () => api.get<{ stack: StackDetail }>(`/api/stacks/${id}`),
    select: (d) => d.stack,
    enabled: !!id,
  });
}

/** Inhalt eines (Unter-)Ordners im Stack; `path=''` ist die Projekt-Wurzel. */
export function useStackDir(id: string | null, path: string) {
  return useQuery({
    queryKey: ['stack-dir', id, path],
    queryFn: () => api.get<{ files: StackFile[] }>(`/api/stacks/${id}/ls?path=${encodeURIComponent(path)}`),
    select: (d) => d.files,
    enabled: !!id,
  });
}

export function useStackFile(id: string | null, file: string | null) {
  return useQuery({
    queryKey: ['stack-file', id, file],
    queryFn: () =>
      api.get<{ content: string }>(`/api/stacks/${id}/file?file=${encodeURIComponent(file!)}`),
    select: (d) => d.content,
    enabled: !!id && !!file,
  });
}

export function useStackMutations() {
  const qc = useQueryClient();
  const invalidate = (id?: string) => {
    void qc.invalidateQueries({ queryKey: ['stacks'] });
    if (id) {
      void qc.invalidateQueries({ queryKey: ['stack', id] });
      void qc.invalidateQueries({ queryKey: ['stack-dir', id] });
    }
  };
  return {
    create: useMutation({
      mutationFn: (body: { endpoint: string; basePath: string; name: string; content: string }) =>
        api.post<{ stack: StackDetail }>('/api/stacks', body),
      onSuccess: () => invalidate(),
    }),
    saveContent: useMutation({
      mutationFn: ({ id, content }: { id: string; content: string }) =>
        api.put(`/api/stacks/${id}`, { content }),
      onSuccess: (_d, v) => invalidate(v.id),
    }),
    saveFile: useMutation({
      mutationFn: ({ id, file, content }: { id: string; file: string; content: string }) =>
        api.put(`/api/stacks/${id}/file?file=${encodeURIComponent(file)}`, { content }),
      onSuccess: (_d, v) => {
        invalidate(v.id);
        void qc.invalidateQueries({ queryKey: ['stack-file', v.id, v.file] });
      },
    }),
    deleteFile: useMutation({
      mutationFn: ({ id, file }: { id: string; file: string }) =>
        api.delete(`/api/stacks/${id}/file?file=${encodeURIComponent(file)}`),
      onSuccess: (_d, v) => invalidate(v.id),
    }),
    deploy: useMutation({
      mutationFn: (id: string) => api.post<{ output: string }>(`/api/stacks/${id}/deploy`),
      onSuccess: (_d, id) => invalidate(id),
    }),
    down: useMutation({
      mutationFn: (id: string) => api.post<{ output: string }>(`/api/stacks/${id}/down`),
      onSuccess: (_d, id) => invalidate(id),
    }),
    action: useMutation({
      mutationFn: ({ id, action }: { id: string; action: StackActionName }) =>
        api.post<{ output: string }>(`/api/stacks/${id}/action`, { action }),
      onSuccess: (_d, v) => invalidate(v.id),
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/api/stacks/${id}`),
      onSuccess: () => invalidate(),
    }),
    archive: useMutation({
      mutationFn: (id: string) => api.post(`/api/stacks/${id}/archive`),
      onSuccess: () => invalidate(),
    }),
    unarchive: useMutation({
      mutationFn: (id: string) => api.post(`/api/stacks/${id}/unarchive`),
      onSuccess: () => invalidate(),
    }),
  };
}

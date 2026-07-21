import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateEndpoint,
  CreateUser,
  Endpoint,
  Role,
  UpdateEndpoint,
  User,
} from '@containly/shared';
import { api } from '../lib/api';

/* Users */
export function useUsers(enabled: boolean) {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<{ users: User[] }>('/api/users'),
    select: (d) => d.users,
    enabled,
  });
}
export function useUserMutations() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['users'] });
  return {
    create: useMutation({
      mutationFn: (body: CreateUser) => api.post<{ user: User }>('/api/users', body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: number) => api.delete(`/api/users/${id}`),
      onSuccess: invalidate,
    }),
  };
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api.post('/api/auth/password', body),
  });
}

/* Endpoints */
export function useEndpointMutations() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['endpoints'] });
  return {
    create: useMutation({
      mutationFn: (body: CreateEndpoint) => api.post<{ endpoint: Endpoint }>('/api/endpoints', body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: UpdateEndpoint }) =>
        api.put<{ endpoint: Endpoint }>(`/api/endpoints/${encodeURIComponent(id)}`, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/api/endpoints/${encodeURIComponent(id)}`),
      onSuccess: invalidate,
    }),
    check: useMutation({
      mutationFn: (id: string) => api.post(`/api/endpoints/${encodeURIComponent(id)}/check`),
      onSuccess: invalidate,
    }),
  };
}

/* Audit */
export interface AuditEntry {
  id: number;
  ts: string;
  username: string | null;
  action: string;
  endpoint_id: string | null;
  target: string | null;
  detail: string | null;
  ip: string | null;
  outcome: string;
}
export function useAudit(enabled: boolean) {
  return useQuery({
    queryKey: ['audit'],
    queryFn: () => api.get<{ entries: AuditEntry[] }>('/api/audit?limit=300'),
    select: (d) => d.entries,
    enabled,
    refetchInterval: 15_000,
  });
}

export type { Role };

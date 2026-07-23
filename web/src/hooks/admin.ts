import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateEndpoint,
  CreateUser,
  Endpoint,
  InviteCreate,
  InviteCreated,
  PendingInvite,
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

/* Einladungen */
export function usePendingInvites(enabled: boolean) {
  return useQuery({
    queryKey: ['invites'],
    queryFn: () => api.get<{ invites: PendingInvite[] }>('/api/users/invites'),
    select: (d) => d.invites,
    enabled,
  });
}
export function useInviteMutations() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['invites'] });
  return {
    create: useMutation({
      mutationFn: (body: InviteCreate) => api.post<InviteCreated>('/api/users/invite', body),
      onSuccess: invalidate,
    }),
    revoke: useMutation({
      mutationFn: (id: number) => api.delete(`/api/users/invites/${id}`),
      onSuccess: invalidate,
    }),
  };
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
    setEmail: useMutation({
      mutationFn: ({ id, email }: { id: number; email: string }) =>
        api.put<{ user: User }>(`/api/users/${id}/email`, { email }),
      onSuccess: invalidate,
    }),
    setRole: useMutation({
      mutationFn: ({ id, role }: { id: number; role: Role }) =>
        api.put<{ user: User }>(`/api/users/${id}/role`, { role }),
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

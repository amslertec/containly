import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogIn, Trash2, Container as RegistryIcon } from 'lucide-react';
import type { Registry } from '@containly/shared';
import { Button } from './ui/Button';
import { Card, Input, Label } from './ui/primitives';
import { TableWrap, THead, Th, Tr, Td } from './ui/Table';
import { LoadingState, EmptyState } from './States';
import { toast } from './Toaster';
import { api, ApiError } from '../lib/api';
import { relativeTime } from '../lib/time';

const KNOWN: Record<string, string> = {
  'docker.io': 'Docker Hub',
  'ghcr.io': 'GitHub Container Registry',
};

export function RegistriesPanel() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['registries'],
    queryFn: () => api.get<{ registries: Registry[] }>('/api/registries'),
    select: (d) => d.registries,
  });

  const [registry, setRegistry] = useState('docker.io');
  const [username, setUsername] = useState('');
  const [secret, setSecret] = useState('');

  const login = useMutation({
    mutationFn: () => api.put('/api/registries', { registry: registry.trim() || 'docker.io', username, secret }),
    onSuccess: () => {
      toast.success(t('registries.loggedIn'));
      setUsername('');
      setSecret('');
      void qc.invalidateQueries({ queryKey: ['registries'] });
      void qc.invalidateQueries({ queryKey: ['updates'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('common.error')),
  });

  const remove = useMutation({
    mutationFn: (reg: string) => api.delete(`/api/registries/${encodeURIComponent(reg)}`),
    onSuccess: () => {
      toast.success(t('registries.loggedOut'));
      void qc.invalidateQueries({ queryKey: ['registries'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('common.error')),
  });

  const registries = data ?? [];

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Anmelden */}
      <Card className="p-5">
        <div className="mb-1 flex items-center gap-2">
          <LogIn className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
            {t('registries.loginTitle')}
          </h2>
        </div>
        <p className="mb-4 text-sm text-muted">{t('registries.loginInfo')}</p>
        <div className="grid gap-3">
          <div>
            <Label htmlFor="reg">{t('registries.registry')}</Label>
            <Input id="reg" value={registry} onChange={(e) => setRegistry(e.target.value)} className="font-mono" placeholder="docker.io" />
            <p className="mt-1 text-xs text-faint">{t('registries.registryHint')}</p>
          </div>
          <div>
            <Label htmlFor="ruser">{t('registries.username')}</Label>
            <Input id="ruser" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
          </div>
          <div>
            <Label htmlFor="rsec">{t('registries.secret')}</Label>
            <Input id="rsec" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" placeholder={t('registries.secretHint')} />
          </div>
          <div>
            <Button variant="primary" size="sm" onClick={() => login.mutate()} loading={login.isPending} disabled={!username || !secret}>
              <LogIn className="h-4 w-4" /> {t('registries.loginButton')}
            </Button>
          </div>
        </div>
      </Card>

      {/* Angemeldete Registries */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <RegistryIcon className="h-5 w-5 text-muted" />
          <h2 className="text-base font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
            {t('registries.connectedTitle')}
          </h2>
        </div>
        {isLoading ? (
          <LoadingState />
        ) : registries.length === 0 ? (
          <EmptyState title={t('registries.none')} hint={t('registries.noneHint')} />
        ) : (
          <TableWrap>
            <THead>
              <Th>{t('registries.registry')}</Th>
              <Th>{t('registries.username')}</Th>
              <Th className="text-right">{t('common.actions')}</Th>
            </THead>
            <tbody>
              {registries.map((r) => (
                <Tr key={r.registry}>
                  <Td>
                    <div className="flex flex-col">
                      <span className="font-medium text-ink">{KNOWN[r.registry] ?? r.registry}</span>
                      <span className="font-mono text-[11px] text-faint">{r.registry}</span>
                    </div>
                  </Td>
                  <Td>
                    <span className="text-muted">{r.username}</span>
                    <span className="ml-2 text-[11px] text-faint">{relativeTime(r.createdAt)}</span>
                  </Td>
                  <Td className="text-right">
                    <button
                      onClick={() => remove.mutate(r.registry)}
                      title={t('registries.logout')}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}

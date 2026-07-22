import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import type { Endpoint } from '@containly/shared';
import { useAuth } from '../app/AuthContext';
import { useEndpoints } from '../app/EndpointContext';
import { useEndpointMutations } from '../hooks/admin';
import { useConfirm } from '../hooks/useConfirm';
import { Page, PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge, Card } from '../components/ui/primitives';
import { EmptyState } from '../components/States';
import { EndpointDialog } from '../components/EndpointDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { toast } from '../components/Toaster';
import { ApiError } from '../lib/api';
import { cn } from '../lib/utils';

export function EndpointsPage() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const { endpoints } = useEndpoints();
  const mut = useEndpointMutations();
  const { confirm, dialogProps } = useConfirm();
  // undefined = Dialog zu, null = Anlegen, Endpoint = Bearbeiten.
  const [dialogFor, setDialogFor] = useState<Endpoint | null | undefined>(undefined);

  const doRemove = async (id: string, name: string): Promise<void> => {
    const ok = await confirm({
      title: t('common.remove'),
      description: t('endpoint.deleteConfirm', { name }),
      danger: true,
      confirmLabel: t('common.remove'),
    });
    if (!ok) return;
    try {
      await mut.remove.mutateAsync(id);
      toast.success(t('common.remove'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  };

  if (!isAdmin) {
    return (
      <Page>
        <PageHeader title={t('endpoint.title')} />
        <EmptyState icon={<ShieldAlert className="h-8 w-8" />} title={t('roles.adminRequired')} hint="" />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        eyebrow={t('app.name')}
        title={t('endpoint.title')}
        subtitle={
          endpoints.length > 0
            ? `${endpoints.filter((e) => e.status === 'online').length} ${t('endpoint.online').toLowerCase()} · ${endpoints.filter((e) => e.status !== 'online').length} ${t('endpoint.offline').toLowerCase()} · ${endpoints.length} ${t('nav.endpoints').toLowerCase()}`
            : undefined
        }
        actions={
          <Button variant="primary" size="sm" onClick={() => setDialogFor(null)}>
            <Plus className="h-4 w-4" /> {t('endpoint.add')}
          </Button>
        }
      />

      <div className="space-y-2">
        {endpoints.map((e) => (
          <Card key={e.id} className="flex items-center gap-3 px-3 py-2.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{
                background:
                  e.status === 'online'
                    ? 'var(--w-run)'
                    : e.status === 'unauthorized'
                      ? 'var(--w-danger)'
                      : 'var(--w-stop)',
              }}
            />
            <Link to="/endpoints/$id" params={{ id: e.id }} className="group min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-ink group-hover:text-primary">{e.name}</span>
                <Badge tone="neutral">
                  {t(`endpoint.type${e.type[0]!.toUpperCase()}${e.type.slice(1)}`)}
                </Badge>
                {e.builtin && <Badge tone="primary">{t('endpoint.builtin')}</Badge>}
              </div>
              <span className="font-mono text-[11px] text-faint">
                {e.host ? `${e.host}:${e.port ?? ''}` : t('endpoint.typeSocket')} ·{' '}
                {e.dockerVersion ?? t(`endpoint.${e.status}`)}
              </span>
            </Link>
            <button
              title={t('endpoint.recheck')}
              onClick={() => mut.check.mutate(e.id)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-ink"
            >
              <RefreshCw className={cn('h-4 w-4', mut.check.isPending && 'animate-spin')} />
            </button>
            <button
              title={t('endpoint.edit')}
              onClick={() => setDialogFor(e)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-ink"
            >
              <Pencil className="h-4 w-4" />
            </button>
            {!e.builtin && (
              <button
                title={t('common.remove')}
                onClick={() => void doRemove(e.id, e.name)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </Card>
        ))}
      </div>

      <EndpointDialog
        open={dialogFor !== undefined}
        endpoint={dialogFor ?? null}
        onClose={() => setDialogFor(undefined)}
        mutations={mut}
      />
      <ConfirmDialog {...dialogProps} loading={mut.remove.isPending} />
    </Page>
  );
}

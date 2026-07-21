import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, Trash2, UserPlus } from 'lucide-react';
import type { Role } from '@containly/shared';
import { useAuth } from '../app/AuthContext';
import { useUserMutations, useUsers } from '../hooks/admin';
import { useConfirm } from '../hooks/useConfirm';
import { evaluatePassword } from '../lib/passwordStrength';
import { Page, PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge, Input, Label } from '../components/ui/primitives';
import { Select } from '../components/ui/Select';
import { TableWrap, THead, Th, Tr, Td } from '../components/ui/Table';
import { EmptyState } from '../components/States';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/Dialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from '../components/ui/Pagination';
import { toast } from '../components/Toaster';
import { ApiError } from '../lib/api';
import { relativeTime } from '../lib/time';

export function UsersPage() {
  const { t } = useTranslation();
  const { user, isAdmin } = useAuth();
  const { data: users } = useUsers(isAdmin);
  const mut = useUserMutations();
  const { confirm, dialogProps } = useConfirm();
  const [addOpen, setAddOpen] = useState(false);
  const pg = usePagination(users ?? [], 10);

  const doRemove = async (id: number, username: string): Promise<void> => {
    const ok = await confirm({
      title: t('common.delete'),
      description: t('settings.deleteUserConfirm', { name: username }),
      danger: true,
      confirmLabel: t('common.delete'),
    });
    if (!ok) return;
    try {
      await mut.remove.mutateAsync(id);
      toast.success(t('common.delete'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  };

  if (!isAdmin) {
    return (
      <Page>
        <PageHeader title={t('settings.users')} />
        <EmptyState icon={<ShieldAlert className="h-8 w-8" />} title={t('roles.adminRequired')} hint="" />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        eyebrow={t('app.name')}
        title={t('settings.users')}
        actions={
          <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
            <UserPlus className="h-4 w-4" /> {t('settings.addUser')}
          </Button>
        }
      />

      <TableWrap>
        <THead>
          <Th>{t('auth.usernameLabel')}</Th>
          <Th>{t('settings.role')}</Th>
          <Th>{t('common.created')}</Th>
          <Th className="text-right">{t('common.actions')}</Th>
        </THead>
        <tbody>
          {pg.pageItems.map((u) => (
            <Tr key={u.id}>
              <Td>
                <span className="font-medium text-ink">{u.username}</span>
                {u.id === user?.id && (
                  <Badge tone="primary" className="ml-2">
                    {t('settings.you')}
                  </Badge>
                )}
              </Td>
              <Td>
                <Badge tone={u.role === 'admin' ? 'primary' : 'neutral'}>
                  {u.role === 'admin' ? t('settings.roleAdmin') : t('settings.roleViewer')}
                </Badge>
              </Td>
              <Td>
                <span className="text-muted">{relativeTime(u.createdAt.replace(' ', 'T') + 'Z')}</span>
              </Td>
              <Td className="text-right">
                {u.id !== user?.id && (
                  <button
                    title={t('common.delete')}
                    onClick={() => void doRemove(u.id, u.username)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </TableWrap>

      {(users ?? []).length > 0 && <Pagination pg={pg} />}

      <AddUserDialog open={addOpen} onClose={() => setAddOpen(false)} onCreate={mut.create} />
      <ConfirmDialog {...dialogProps} loading={mut.remove.isPending} />
    </Page>
  );
}

function AddUserDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: ReturnType<typeof useUserMutations>['create'];
}) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const strength = useMemo(() => evaluatePassword(password), [password]);

  const submit = async (): Promise<void> => {
    try {
      await onCreate.mutateAsync({ username, password, role });
      toast.success(t('common.create'));
      onClose();
      setUsername('');
      setPassword('');
      setRole('viewer');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogTitle>{t('settings.addUser')}</DialogTitle>
        <div className="mt-4 space-y-3">
          <div>
            <Label>{t('auth.usernameLabel')}</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>{t('auth.passwordLabel')}</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            {password && !strength.valid && (
              <p className="mt-1 text-xs text-warn">{t('setup.requirements.length')} · A-z 0-9 !@#</p>
            )}
          </div>
          <div>
            <Label>{t('settings.role')}</Label>
            <Select
              value={role}
              onChange={(v) => setRole(v as Role)}
              className="w-full"
              options={[
                { value: 'viewer', label: t('settings.roleViewer') },
                { value: 'admin', label: t('settings.roleAdmin') },
              ]}
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            loading={onCreate.isPending}
            disabled={!username.trim() || !strength.valid}
          >
            {t('common.create')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

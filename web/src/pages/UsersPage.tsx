import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Mail, Pencil, ShieldAlert, Trash2, UserPlus, X } from 'lucide-react';
import type { Locale, Role, User } from '@containly/shared';
import { useAuth } from '../app/AuthContext';
import { useInviteMutations, usePendingInvites, useUserMutations, useUsers } from '../hooks/admin';
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
  const { data: invites } = usePendingInvites(isAdmin);
  const mut = useUserMutations();
  const inviteMut = useInviteMutations();
  const { confirm, dialogProps } = useConfirm();
  const [addOpen, setAddOpen] = useState(false);
  const pg = usePagination(users ?? [], 10);

  const doRevokeInvite = async (id: number, email: string): Promise<void> => {
    const ok = await confirm({
      title: t('invites.revoke'),
      description: t('invites.revokeConfirm', { email }),
      danger: true,
      confirmLabel: t('invites.revoke'),
    });
    if (!ok) return;
    try {
      await inviteMut.revoke.mutateAsync(id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  };

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
          <Th>{t('settings.emailColumn')}</Th>
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
                <EmailCell user={u} setEmail={mut.setEmail} />
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

      {(invites ?? []).length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-ink">{t('invites.pending')}</h2>
          <TableWrap>
            <THead>
              <Th>{t('settings.emailColumn')}</Th>
              <Th>{t('settings.role')}</Th>
              <Th>{t('invites.expires')}</Th>
              <Th className="text-right">{t('common.actions')}</Th>
            </THead>
            <tbody>
              {(invites ?? []).map((inv) => (
                <Tr key={inv.id}>
                  <Td><span className="text-ink">{inv.email}</span></Td>
                  <Td>
                    <Badge tone={inv.role === 'admin' ? 'primary' : 'neutral'}>
                      {inv.role === 'admin' ? t('settings.roleAdmin') : t('settings.roleViewer')}
                    </Badge>
                  </Td>
                  <Td><span className="text-muted">{relativeTime(new Date(inv.expiresAt).toISOString())}</span></Td>
                  <Td className="text-right">
                    <button
                      title={t('invites.revoke')}
                      onClick={() => void doRevokeInvite(inv.id, inv.email)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        </div>
      )}

      <AddUserDialog open={addOpen} onClose={() => setAddOpen(false)} onCreate={mut.create} />
      <ConfirmDialog {...dialogProps} loading={mut.remove.isPending} />
    </Page>
  );
}

function EmailCell({
  user,
  setEmail,
}: {
  user: User;
  setEmail: ReturnType<typeof useUserMutations>['setEmail'];
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(user.email ?? '');

  const start = (): void => {
    setValue(user.email ?? '');
    setEditing(true);
  };

  const save = async (): Promise<void> => {
    try {
      await setEmail.mutateAsync({ id: user.id, email: value.trim() });
      toast.success(t('settings.emailSet'));
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
            if (e.key === 'Escape') setEditing(false);
          }}
          placeholder={t('settings.emailPlaceholder')}
          className="h-8 max-w-[220px] text-sm"
          autoFocus
        />
        <button
          title={t('common.save')}
          onClick={() => void save()}
          disabled={setEmail.isPending}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-primary-soft hover:text-primary disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          title={t('common.cancel')}
          onClick={() => setEditing(false)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={start}
      title={t('common.edit')}
      className="group inline-flex items-center gap-1.5 rounded-md text-left"
    >
      {user.email ? (
        <span className="text-muted">{user.email}</span>
      ) : (
        <span className="text-faint">{t('settings.noEmail')}</span>
      )}
      <Pencil className="h-3 w-3 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
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
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<'create' | 'invite'>('create');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [language, setLanguage] = useState<Locale>(i18n.language === 'de' ? 'de' : 'en');
  const inviteMut = useInviteMutations();
  const [inviteLink, setInviteLink] = useState<{ url: string; emailed: boolean } | null>(null);
  const strength = useMemo(() => evaluatePassword(password), [password]);
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  const reset = (): void => {
    setUsername('');
    setEmail('');
    setPassword('');
    setRole('viewer');
    setInviteLink(null);
    setMode('create');
  };
  const close = (): void => {
    onClose();
    reset();
  };

  const submitCreate = async (): Promise<void> => {
    try {
      await onCreate.mutateAsync({ username, password, role, email: email.trim() || undefined });
      toast.success(t('common.create'));
      close();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  };

  const submitInvite = async (): Promise<void> => {
    try {
      const res = await inviteMut.create.mutateAsync({ email: email.trim(), role, language });
      setInviteLink({ url: res.url, emailed: res.emailed });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  };

  const copyLink = (): void => {
    if (!inviteLink) return;
    void navigator.clipboard.writeText(inviteLink.url).then(() => toast.success(t('invites.copied')));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent onClose={close}>
        <DialogTitle>{t('settings.addUser')}</DialogTitle>

        {/* Modus-Umschalter: direkt anlegen oder per E-Mail einladen. */}
        <div className="mt-4 flex gap-1 rounded-lg bg-surface-2 p-1">
          {(['create', 'invite'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={
                'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
                (mode === m ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')
              }
            >
              {m === 'create' ? t('settings.addUserDirect') : t('invites.mode')}
            </button>
          ))}
        </div>

        {inviteLink ? (
          // Einladung erstellt → Link zum Kopieren + Versand-Status.
          <div className="mt-5 space-y-3">
            <p className="flex items-start gap-2 text-sm text-muted">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
              {inviteLink.emailed ? t('invites.emailed', { email: email.trim() }) : t('invites.notEmailed')}
            </p>
            <div>
              <Label>{t('invites.link')}</Label>
              <div className="flex items-center gap-2">
                <Input value={inviteLink.url} readOnly className="font-mono text-[12px]" />
                <Button variant="secondary" size="sm" onClick={copyLink}>
                  <Copy className="h-4 w-4" /> {t('invites.copy')}
                </Button>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button variant="primary" onClick={close}>{t('common.done')}</Button>
            </div>
          </div>
        ) : mode === 'create' ? (
          <>
            <div className="mt-4 space-y-3">
              <div>
                <Label>{t('auth.usernameLabel')}</Label>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
              </div>
              <div>
                <Label>{t('settings.emailColumn')}</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('settings.emailPlaceholder')}
                  autoComplete="off"
                />
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
              <RoleSelect role={role} setRole={setRole} />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={close}>{t('common.cancel')}</Button>
              <Button
                variant="primary"
                onClick={() => void submitCreate()}
                loading={onCreate.isPending}
                disabled={!username.trim() || !strength.valid}
              >
                {t('common.create')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-4 space-y-3">
              <p className="text-sm text-muted">{t('invites.hint')}</p>
              <div>
                <Label>{t('settings.emailColumn')}</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('settings.emailPlaceholder')}
                  autoComplete="off"
                  autoFocus
                />
              </div>
              <RoleSelect role={role} setRole={setRole} />
              <div>
                <Label>{t('invites.language')}</Label>
                <Select
                  value={language}
                  onChange={(v) => setLanguage(v as Locale)}
                  className="w-full"
                  options={[
                    { value: 'de', label: 'Deutsch' },
                    { value: 'en', label: 'English' },
                  ]}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={close}>{t('common.cancel')}</Button>
              <Button
                variant="primary"
                onClick={() => void submitInvite()}
                loading={inviteMut.create.isPending}
                disabled={!emailValid}
              >
                {t('invites.send')}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RoleSelect({ role, setRole }: { role: Role; setRole: (r: Role) => void }) {
  const { t } = useTranslation();
  return (
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
  );
}

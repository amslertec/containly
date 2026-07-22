import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, ChevronDown, Mail, Send } from 'lucide-react';
import {
  NOTIFICATION_CATALOG,
  notificationMeta,
  type NotificationCategory,
  type NotificationSetting,
  type NotificationType,
  type SmtpConfig,
  type User,
} from '@containly/shared';
import { Button } from './ui/Button';
import { Checkbox } from './ui/Checkbox';
import { Card, Input, Label } from './ui/primitives';
import { LoadingState } from './States';
import { toast } from './Toaster';
import { api, ApiError } from '../lib/api';
import { cn } from '../lib/utils';

const CATEGORY_ORDER: NotificationCategory[] = [
  'endpoint',
  'container',
  'update',
  'security',
  'performance',
];

/** i18n-sicherer Key aus einem Typ mit Punkt (endpoint.offline → endpoint_offline). */
const tkey = (type: NotificationType): string => type.replace('.', '_');

export function NotificationsPanel() {
  return (
    <div className="grid gap-5">
      <SmtpCard />
      <CatalogCard />
    </div>
  );
}

/* ── SMTP-Konfiguration ───────────────────────────────────────────────────── */
function SmtpCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['smtp'],
    queryFn: () => api.get<SmtpConfig>('/api/notifications/smtp'),
  });

  const [form, setForm] = useState<SmtpConfig | null>(null);
  const [password, setPassword] = useState('');
  const [testTo, setTestTo] = useState('');
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      api.put('/api/notifications/smtp', {
        host: form!.host,
        port: form!.port,
        secure: form!.secure,
        username: form!.username,
        password: password || undefined,
        fromAddr: form!.fromAddr,
        fromName: form!.fromName,
        enabled: form!.enabled,
      }),
    onSuccess: () => {
      toast.success(t('notifications.smtp.saved'));
      setPassword('');
      void qc.invalidateQueries({ queryKey: ['smtp'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('common.error')),
  });

  const test = useMutation({
    mutationFn: () =>
      api.post<{ accepted: string[]; response: string }>('/api/notifications/smtp/test', { to: testTo }),
    onSuccess: (res) =>
      toast.success(t('notifications.smtp.testSent', { to: res.accepted[0] ?? testTo })),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('common.error')),
  });

  if (isLoading || !form) return <Card className="p-5"><LoadingState /></Card>;

  const set = <K extends keyof SmtpConfig>(k: K, v: SmtpConfig[K]): void =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2">
        <Mail className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
          {t('notifications.smtp.title')}
        </h2>
      </div>
      <p className="mb-4 text-sm text-muted">{t('notifications.smtp.info')}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <Checkbox checked={form.enabled} onChange={() => set('enabled', !form.enabled)} aria-label={t('notifications.smtp.enabled')} />
            {t('notifications.smtp.enabled')}
          </label>
        </div>
        <div>
          <Label htmlFor="smtp-host">{t('notifications.smtp.host')}</Label>
          <Input id="smtp-host" value={form.host} onChange={(e) => set('host', e.target.value)} className="font-mono" placeholder="smtp.example.com" />
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div>
            <Label htmlFor="smtp-port">{t('notifications.smtp.port')}</Label>
            <Input id="smtp-port" type="number" value={form.port} onChange={(e) => set('port', Number(e.target.value))} className="font-mono" />
          </div>
          <div>
            <Label htmlFor="smtp-secure">TLS</Label>
            <div className="flex h-9 items-center">
              <Checkbox checked={form.secure} onChange={() => set('secure', !form.secure)} aria-label="TLS" />
            </div>
          </div>
        </div>
        <div>
          <Label htmlFor="smtp-user">{t('notifications.smtp.username')}</Label>
          <Input id="smtp-user" value={form.username} onChange={(e) => set('username', e.target.value)} autoComplete="off" />
        </div>
        <div>
          <Label htmlFor="smtp-pass">{t('notifications.smtp.password')}</Label>
          <Input
            id="smtp-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder={form.hasPassword ? t('notifications.smtp.passwordSet') : ''}
          />
        </div>
        <div>
          <Label htmlFor="smtp-from">{t('notifications.smtp.fromAddr')}</Label>
          <Input id="smtp-from" value={form.fromAddr} onChange={(e) => set('fromAddr', e.target.value)} className="font-mono" placeholder="containly@example.com" />
        </div>
        <div>
          <Label htmlFor="smtp-fromname">{t('notifications.smtp.fromName')}</Label>
          <Input id="smtp-fromname" value={form.fromName} onChange={(e) => set('fromName', e.target.value)} placeholder="Containly" />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
        <Button variant="primary" size="sm" onClick={() => save.mutate()} loading={save.isPending} disabled={!form.host || !form.fromAddr}>
          {t('common.save')}
        </Button>
        <div className="flex-1" />
        <div className="min-w-[200px]">
          <Label htmlFor="smtp-test">{t('notifications.smtp.testTo')}</Label>
          <div className="flex gap-2">
            <Input id="smtp-test" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="name@example.com" />
            <Button variant="secondary" size="md" onClick={() => test.mutate()} loading={test.isPending} disabled={!testTo}>
              <Send className="h-4 w-4" /> {t('notifications.smtp.test')}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ── Benachrichtigungs-Katalog ────────────────────────────────────────────── */
function CatalogCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: settingsData, isLoading } = useQuery({
    queryKey: ['notification-settings'],
    queryFn: () => api.get<{ settings: NotificationSetting[] }>('/api/notifications/settings'),
    select: (d) => d.settings,
  });
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<{ users: User[] }>('/api/users'),
    select: (d) => d.users,
  });

  const save = useMutation({
    mutationFn: (s: NotificationSetting) =>
      api.put(`/api/notifications/settings/${s.type}`, {
        enabled: s.enabled,
        threshold: s.threshold,
        allAdmins: s.allAdmins,
        recipients: s.recipients,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notification-settings'] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('common.error')),
  });

  if (isLoading || !settingsData) return <Card className="p-5"><LoadingState /></Card>;

  const byType = new Map(settingsData.map((s) => [s.type, s]));
  const withEmail = (users ?? []).filter((u) => u.email);

  const update = (s: NotificationSetting, patch: Partial<NotificationSetting>): void =>
    save.mutate({ ...s, ...patch });

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2">
        <Bell className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
          {t('notifications.catalog.title')}
        </h2>
      </div>
      <p className="mb-4 text-sm text-muted">{t('notifications.catalog.info')}</p>

      {withEmail.length === 0 && (
        <p className="mb-4 rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-xs text-warn">
          {t('notifications.catalog.noRecipients')}
        </p>
      )}

      <div className="space-y-6">
        {CATEGORY_ORDER.map((cat) => {
          const types = NOTIFICATION_CATALOG.filter((m) => m.category === cat);
          return (
            <div key={cat}>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
                {t(`notifications.category.${cat}`)}
              </div>
              <div className="divide-y divide-border rounded-lg border border-border">
                {types.map((meta) => {
                  const s = byType.get(meta.type);
                  if (!s) return null;
                  return (
                    <NotificationRow
                      key={meta.type}
                      setting={s}
                      users={withEmail}
                      onChange={(patch) => update(s, patch)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function NotificationRow({
  setting,
  users,
  onChange,
}: {
  setting: NotificationSetting;
  users: User[];
  onChange: (patch: Partial<NotificationSetting>) => void;
}) {
  const { t } = useTranslation();
  const meta = notificationMeta(setting.type);
  const key = tkey(setting.type);

  return (
    <div className={cn('flex flex-wrap items-center gap-3 px-3 py-3', !setting.enabled && 'opacity-60')}>
      <Checkbox
        checked={setting.enabled}
        onChange={() => onChange({ enabled: !setting.enabled })}
        aria-label={t(`notifications.types.${key}.label`)}
      />
      <div className="min-w-[180px] flex-1">
        <div className="text-[13.5px] font-medium text-ink">{t(`notifications.types.${key}.label`)}</div>
        <div className="text-[11.5px] text-muted">{t(`notifications.types.${key}.desc`)}</div>
      </div>

      {meta.thresholdUnit && (
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-faint">{meta.thresholdAbove ? '>' : '<'}</span>
          <Input
            type="number"
            value={setting.threshold ?? meta.thresholdDefault ?? 0}
            onChange={(e) => onChange({ threshold: Number(e.target.value) })}
            disabled={!setting.enabled}
            className="h-8 w-20 text-center font-mono text-[13px]"
          />
          <span className="text-[11px] text-faint">{meta.thresholdUnit}</span>
        </div>
      )}

      <RecipientPicker setting={setting} users={users} onChange={onChange} />
    </div>
  );
}

/** „Alle Admins"-Schalter + Mehrfachauswahl konkreter Benutzer als Dropdown. */
function RecipientPicker({
  setting,
  users,
  onChange,
}: {
  setting: NotificationSetting;
  users: User[];
  onChange: (patch: Partial<NotificationSetting>) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const picked = new Set(setting.recipients);
  const toggleUser = (id: number): void => {
    const next = new Set(picked);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange({ recipients: [...next] });
  };

  const label = setting.allAdmins
    ? setting.recipients.length > 0
      ? t('notifications.recipients.adminsPlus', { count: setting.recipients.length })
      : t('notifications.recipients.allAdmins')
    : setting.recipients.length > 0
      ? t('notifications.recipients.count', { count: setting.recipients.length })
      : t('notifications.recipients.none');

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={!setting.enabled}
        className="inline-flex min-w-[150px] items-center justify-between gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12.5px] text-ink hover:border-border-strong disabled:opacity-50"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-faint" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 max-h-72 w-60 overflow-y-auto rounded-lg border border-border bg-surface p-1.5 shadow-lg">
          <PickRow
            label={t('notifications.recipients.allAdmins')}
            checked={setting.allAdmins}
            onToggle={() => onChange({ allAdmins: !setting.allAdmins })}
          />
          {users.length > 0 && <div className="my-1 h-px bg-border" />}
          {users.map((u) => (
            <PickRow
              key={u.id}
              label={u.username}
              sub={u.email ?? undefined}
              checked={picked.has(u.id)}
              onToggle={() => toggleUser(u.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PickRow({
  label,
  sub,
  checked,
  onToggle,
}: {
  label: string;
  sub?: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-hover"
    >
      <span className={cn('flex h-4 w-4 items-center justify-center rounded border', checked ? 'border-primary bg-primary text-primary-ink' : 'border-border-strong')}>
        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-ink">{label}</span>
        {sub && <span className="block truncate font-mono text-[11px] text-faint">{sub}</span>}
      </span>
    </button>
  );
}

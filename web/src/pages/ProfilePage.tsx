import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  Copy,
  Download,
  KeyRound,
  LogOut,
  Mail,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  UserRound,
} from 'lucide-react';
import type { TwoFactorSetup } from '@containly/shared';
import { useAuth } from '../app/AuthContext';
import { useChangePassword } from '../hooks/admin';
import { evaluatePassword } from '../lib/passwordStrength';
import { Page, PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge, Card, Input, Label } from '../components/ui/primitives';
import { PasswordInput } from '../components/ui/PasswordInput';
import { toast } from '../components/Toaster';
import { api, ApiError } from '../lib/api';
import { cn } from '../lib/utils';

type Tab = 'account' | 'password' | 'security';
const TABS: Tab[] = ['account', 'password', 'security'];

export function ProfilePage() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('account');

  return (
    <Page>
      <PageHeader eyebrow={t('app.name')} title={t('profile.title')} />

      <div className="mb-5 flex gap-1 border-b border-border">
        {TABS.map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={cn(
              'relative px-3.5 py-2 text-sm font-medium transition-colors',
              tab === tb ? 'text-primary' : 'text-muted hover:text-ink',
            )}
          >
            {t(`profile.tabs.${tb}`)}
            {tab === tb && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />}
            {tb === 'security' && user?.totpEnabled && (
              <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-run align-middle" />
            )}
          </button>
        ))}
      </div>

      {tab === 'account' && <AccountTab onLogout={() => void logout()} />}
      {tab === 'password' && <PasswordTab />}
      {tab === 'security' && <SecurityTab />}
    </Page>
  );
}

/* ── Konto ─────────────────────────────────────────────────────────────────── */
function AccountTab({ onLogout }: { onLogout: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  return (
    <div className="grid gap-5">
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <UserRound className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
              {user?.username}
            </span>
            <Badge tone="primary">{user?.role === 'admin' ? t('settings.roleAdmin') : t('settings.roleViewer')}</Badge>
            {user?.totpEnabled ? (
              <Badge tone="run">
                <ShieldCheck className="h-3.5 w-3.5" /> {t('twofa.badgeOn')}
              </Badge>
            ) : (
              <Badge tone="warn">
                <ShieldOff className="h-3.5 w-3.5" /> {t('twofa.badgeOff')}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted">{t('settings.account')}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onLogout}>
          <LogOut className="h-4 w-4" /> {t('auth.logout')}
        </Button>
      </Card>
      <EmailCard />
    </div>
  );
}

/** Self-Service: eigene E-Mail-Adresse für Login + Benachrichtigungen setzen. */
function EmailCard() {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const [email, setEmail] = useState(user?.email ?? '');
  const [saving, setSaving] = useState(false);
  const dirty = email.trim() !== (user?.email ?? '');

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await api.put('/api/auth/email', { email: email.trim() });
      await refresh();
      toast.success(t('profile.email.saved'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2">
        <Mail className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
          {t('profile.email.title')}
        </h2>
      </div>
      <p className="mb-4 text-sm text-muted">{t('profile.email.info')}</p>
      <div className="flex max-w-md flex-wrap items-end gap-2">
        <div className="flex-1" style={{ minWidth: 220 }}>
          <Label htmlFor="profile-email">{t('settings.emailColumn')}</Label>
          <Input
            id="profile-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('settings.emailPlaceholder')}
            className="font-mono"
          />
        </div>
        <Button variant="primary" size="sm" onClick={() => void save()} loading={saving} disabled={!dirty}>
          {t('common.save')}
        </Button>
      </div>
    </Card>
  );
}

/* ── Passwort ─────────────────────────────────────────────────────────────── */
function PasswordTab() {
  const { t } = useTranslation();
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const strength = useMemo(() => evaluatePassword(next), [next]);
  const mismatch = confirm.length > 0 && confirm !== next;
  const canSubmit = strength.valid && !!current && confirm === next;

  const submit = async (): Promise<void> => {
    if (!canSubmit) return;
    try {
      await change.mutateAsync({ currentPassword: current, newPassword: next });
      toast.success(t('auth.passwordChanged'));
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  };

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-base font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
        {t('auth.changePassword')}
      </h2>
      <div className="grid max-w-md gap-3">
        <div>
          <Label htmlFor="cur">{t('auth.currentPassword')}</Label>
          <PasswordInput id="cur" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </div>
        <div>
          <Label htmlFor="new">{t('auth.newPassword')}</Label>
          <PasswordInput id="new" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          {next && !strength.valid && (
            <p className="mt-1 text-xs text-warn">{t('setup.requirements.length')} · A-z 0-9 !@#</p>
          )}
        </div>
        <div>
          <Label htmlFor="confirm">{t('auth.confirmPasswordLabel')}</Label>
          <PasswordInput id="confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          {mismatch && <p className="mt-1 text-xs text-danger">{t('auth.passwordMismatch')}</p>}
        </div>
        <div>
          <Button variant="primary" size="sm" onClick={() => void submit()} loading={change.isPending} disabled={!canSubmit}>
            <KeyRound className="h-4 w-4" /> {t('auth.changePassword')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ── Sicherheit / 2FA ─────────────────────────────────────────────────────── */
function SecurityTab() {
  const { user, refresh } = useAuth();
  return user?.totpEnabled ? (
    <TwoFactorActive onChange={() => void refresh()} />
  ) : (
    <TwoFactorSetupFlow onEnabled={() => void refresh()} />
  );
}

function TwoFactorSetupFlow({ onEnabled }: { onEnabled: () => void }) {
  const { t } = useTranslation();
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [starting, setStarting] = useState(false);
  const [code, setCode] = useState('');
  const [enabling, setEnabling] = useState(false);
  const [recovery, setRecovery] = useState<string[] | null>(null);

  const start = async (): Promise<void> => {
    setStarting(true);
    try {
      setSetup(await api.post<TwoFactorSetup>('/api/auth/2fa/setup'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setStarting(false);
    }
  };

  const enable = async (): Promise<void> => {
    if (!/^\d{6}$/.test(code)) return;
    setEnabling(true);
    try {
      const res = await api.post<{ recoveryCodes: string[] }>('/api/auth/2fa/enable', { code });
      setRecovery(res.recoveryCodes);
      toast.success(t('twofa.enabled'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setEnabling(false);
    }
  };

  if (recovery) return <RecoveryCodes codes={recovery} onDone={onEnabled} />;

  return (
    <Card className="max-w-2xl p-5">
      <div className="mb-1 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
          {t('twofa.title')}
        </h2>
      </div>
      <p className="mb-4 text-sm text-muted">{t('twofa.intro')}</p>

      {!setup ? (
        <Button variant="primary" size="sm" onClick={() => void start()} loading={starting}>
          <Smartphone className="h-4 w-4" /> {t('twofa.setupStart')}
        </Button>
      ) : (
        <div className="grid gap-5 sm:grid-cols-[220px_1fr]">
          <div>
            <img src={setup.qr} alt="QR" className="rounded-lg border border-border bg-white p-2" width={220} height={220} />
            <p className="mt-2 text-xs text-muted">{t('twofa.manualHint')}</p>
            <code className="mt-1 block select-all break-all rounded bg-surface-2 px-2 py-1 font-mono text-[11px] text-ink">
              {setup.secret}
            </code>
          </div>
          <div>
            <p className="mb-3 text-sm text-ink">{t('twofa.scanThenCode')}</p>
            <Label htmlFor="code">{t('twofa.codeLabel')}</Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && void enable()}
              placeholder="123456"
              className="max-w-[160px] font-mono text-lg tracking-[0.3em]"
            />
            <div className="mt-4">
              <Button variant="primary" size="sm" onClick={() => void enable()} loading={enabling} disabled={!/^\d{6}$/.test(code)}>
                <ShieldCheck className="h-4 w-4" /> {t('twofa.activate')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { t } = useTranslation();
  const text = codes.join('\n');

  const copy = (): void => {
    void navigator.clipboard.writeText(text);
    toast.success(t('common.copied'));
  };
  const download = (): void => {
    const blob = new Blob([`Containly 2FA Recovery Codes\n\n${text}\n`], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'containly-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Card className="max-w-2xl p-5">
      <div className="mb-1 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-run" />
        <h2 className="text-base font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
          {t('twofa.recoveryTitle')}
        </h2>
      </div>
      <p className="mb-4 text-sm text-warn">{t('twofa.recoveryWarn')}</p>
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface-2 p-4">
        {codes.map((c) => (
          <code key={c} className="select-all font-mono text-[13px] text-ink">
            {c}
          </code>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={copy}>
          <Copy className="h-4 w-4" /> {t('common.copy')}
        </Button>
        <Button variant="secondary" size="sm" onClick={download}>
          <Download className="h-4 w-4" /> {t('twofa.download')}
        </Button>
        <Button variant="primary" size="sm" onClick={onDone}>
          <Check className="h-4 w-4" /> {t('twofa.savedDone')}
        </Button>
      </div>
    </Card>
  );
}

function TwoFactorActive({ onChange }: { onChange: () => void }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const disable = async (): Promise<void> => {
    if (!password || code.length < 6) return;
    setBusy(true);
    try {
      await api.post('/api/auth/2fa/disable', { password, code });
      toast.success(t('twofa.disabled'));
      onChange();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="max-w-2xl p-5">
      <div className="mb-1 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-run" />
        <h2 className="text-base font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
          {t('twofa.title')}
        </h2>
        <Badge tone="run">{t('twofa.badgeOn')}</Badge>
      </div>
      <p className="mb-4 text-sm text-muted">{t('twofa.activeInfo')}</p>

      {!confirming ? (
        <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
          <ShieldOff className="h-4 w-4" /> {t('twofa.disable')}
        </Button>
      ) : (
        <div className="grid max-w-md gap-3 rounded-lg border border-danger-soft p-4">
          <p className="text-sm text-ink">{t('twofa.disableConfirm')}</p>
          <div>
            <Label htmlFor="dpw">{t('auth.currentPassword')}</Label>
            <Input id="dpw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <div>
            <Label htmlFor="dcode">{t('twofa.codeOrRecovery')}</Label>
            <Input id="dcode" value={code} onChange={(e) => setCode(e.target.value.trim())} className="font-mono" placeholder="123456" />
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" size="sm" onClick={() => void disable()} loading={busy} disabled={!password || code.length < 6}>
              <ShieldOff className="h-4 w-4" /> {t('twofa.disable')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

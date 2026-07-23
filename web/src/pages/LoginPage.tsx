import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { User } from '@containly/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../app/AuthContext';
import { AuthLayout } from './AuthLayout';
import { Button } from '../components/ui/Button';
import { Input, Label } from '../components/ui/primitives';
import { Checkbox } from '../components/ui/Checkbox';

type LoginResponse =
  | { user: User; csrfToken: string }
  | { twoFactorRequired: true; ticket: string };

export function LoginPage() {
  const { t } = useTranslation();
  const { applyAuth } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ticket, setTicket] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<LoginResponse>('/api/auth/login', {
        username,
        password,
        rememberMe: remember,
      });
      if ('twoFactorRequired' in res) {
        setTicket(res.ticket);
        setLoading(false);
      } else {
        applyAuth(res.user, res.csrfToken);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.loginFailed'));
      setLoading(false);
    }
  };

  const submitCode = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!ticket) return;
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ user: User; csrfToken: string }>('/api/auth/login/2fa', {
        ticket,
        code: code.trim(),
      });
      applyAuth(res.user, res.csrfToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.loginFailed'));
      setLoading(false);
    }
  };

  if (ticket) {
    return (
      <AuthLayout>
        <div className="mb-8">
          <span className="eyebrow">{t('app.name')}</span>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink" style={{ fontFamily: 'var(--font-display)' }}>
            {t('twofa.loginTitle')}
          </h1>
          <p className="mt-1 text-sm text-muted">{t('twofa.loginSubtitle')}</p>
        </div>
        <form onSubmit={submitCode} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="code">{t('twofa.codeLabel')}</Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              className="font-mono text-lg tracking-[0.3em]"
              required
            />
            <p className="mt-1 text-xs text-muted">{t('twofa.loginRecoveryHint')}</p>
          </div>
          {error && (
            <p className="rounded-md border border-danger-soft bg-danger-soft/50 px-3 py-2 text-sm text-danger">{error}</p>
          )}
          <Button type="submit" variant="primary" size="md" loading={loading} className="w-full">
            {t('twofa.verify')}
          </Button>
          <button
            type="button"
            onClick={() => { setTicket(null); setCode(''); setError(null); }}
            className="w-full text-center text-xs text-muted transition-colors hover:text-ink"
          >
            ← {t('common.back')}
          </button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="mb-8">
        <span className="eyebrow">{t('app.name')}</span>
        <h1
          className="mt-2 text-2xl font-bold tracking-tight text-ink"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {t('auth.loginTitle')}
        </h1>
        <p className="mt-1 text-sm text-muted">{t('auth.loginSubtitle')}</p>
      </div>

      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="username">{t('auth.loginIdentifier')}</Label>
          <Input
            id="username"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="password">{t('auth.passwordLabel')}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted select-none">
          <Checkbox checked={remember} onChange={() => setRemember((v) => !v)} aria-label={t('auth.rememberMe')} />
          {t('auth.rememberMe')}
        </label>

        {error && (
          <p className="rounded-md border border-danger-soft bg-danger-soft/50 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" size="md" loading={loading} className="w-full">
          {loading ? t('auth.loggingIn') : t('auth.login')}
        </Button>
      </form>
    </AuthLayout>
  );
}

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import type { User } from '@containly/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../app/AuthContext';
import { AuthLayout } from './AuthLayout';
import { Button } from '../components/ui/Button';
import { Input, Label } from '../components/ui/primitives';
import { PasswordInput } from '../components/ui/PasswordInput';
import { evaluatePassword } from '../lib/passwordStrength';
import { cn } from '../lib/utils';

const strengthColor = {
  weak: 'var(--w-danger)',
  fair: 'var(--w-warn)',
  good: 'var(--w-pause)',
  strong: 'var(--w-run)',
} as const;

export function SetupPage() {
  const { t } = useTranslation();
  const { applyAuth } = useAuth();
  const [setupToken, setSetupToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => evaluatePassword(password), [password]);
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit =
    setupToken.trim().length > 0 &&
    username.trim().length >= 3 &&
    strength.valid &&
    confirm === password &&
    !loading;

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ user: User; csrfToken: string }>('/api/setup', {
        username,
        password,
        setupToken,
      });
      applyAuth(res.user, res.csrfToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
      setLoading(false);
    }
  };

  const req = (ok: boolean, label: string) => (
    <li className={cn('flex items-center gap-1.5 text-xs', ok ? 'text-run' : 'text-faint')}>
      {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
      {label}
    </li>
  );

  return (
    <AuthLayout securityNote={t('setup.securityNote')}>
      <div className="mb-7">
        <span className="eyebrow">{t('setup.step', { current: 1, total: 1 })}</span>
        <h1
          className="mt-2 text-2xl font-bold tracking-tight text-ink"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {t('setup.title')}
        </h1>
        <p className="mt-1 text-sm text-muted">{t('setup.adminTitle')}</p>
      </div>

      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="token">{t('setup.tokenLabel')}</Label>
          <Input
            id="token"
            value={setupToken}
            onChange={(e) => setSetupToken(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            required
          />
          <p className="mt-1.5 text-xs text-faint">{t('setup.tokenHint')}</p>
        </div>

        <div>
          <Label htmlFor="su-user">{t('auth.usernameLabel')}</Label>
          <Input
            id="su-user"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </div>

        <div>
          <Label htmlFor="su-pass">{t('auth.passwordLabel')}</Label>
          <PasswordInput
            id="su-pass"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />

          {password.length > 0 && (
            <div className="mt-2.5">
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="h-1 w-9 rounded-full transition-colors"
                      style={{
                        background:
                          i < strength.score ? strengthColor[strength.level] : 'var(--w-border)',
                      }}
                    />
                  ))}
                </div>
                <span
                  className="text-xs font-medium"
                  style={{ color: strengthColor[strength.level] }}
                >
                  {t(`setup.strength.${strength.level}`)}
                </span>
              </div>
              <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1">
                {req(strength.checks.length, t('setup.requirements.length'))}
                {req(strength.checks.upper, t('setup.requirements.upper'))}
                {req(strength.checks.lower, t('setup.requirements.lower'))}
                {req(strength.checks.digit, t('setup.requirements.digit'))}
                {req(strength.checks.special, t('setup.requirements.special'))}
              </ul>
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="su-pass2">{t('auth.confirmPasswordLabel')}</Label>
          <PasswordInput
            id="su-pass2"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
          {mismatch && <p className="mt-1 text-xs text-danger">{t('auth.passwordMismatch')}</p>}
        </div>

        {error && (
          <p className="rounded-md border border-danger-soft bg-danger-soft/50 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          size="md"
          loading={loading}
          disabled={!canSubmit}
          className="w-full"
        >
          {loading ? t('setup.creating') : t('setup.createAdmin')}
        </Button>
      </form>
    </AuthLayout>
  );
}

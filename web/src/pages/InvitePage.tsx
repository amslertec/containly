import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { InviteInfo, User } from '@containly/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../app/AuthContext';
import { AuthLayout } from './AuthLayout';
import { Button } from '../components/ui/Button';
import { Input, Label } from '../components/ui/primitives';
import { PasswordInput } from '../components/ui/PasswordInput';
import { LogoMark } from '../components/Logo';

/** Token aus dem Pfad /invite/<token> lesen. */
function tokenFromPath(): string {
  const m = window.location.pathname.match(/^\/invite\/([^/?#]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : '';
}

/**
 * Öffentliche Annahme-Seite einer Einladung (kein Login nötig). Gleiches Layout wie die
 * Login-Seite: E-Mail vorausgefüllt (readonly), der Eingeladene setzt Username + Passwort
 * (doppelt, mit Sichtbarkeits-Umschalter). Nach dem Absenden ist er direkt eingeloggt.
 */
export function InvitePage() {
  const { t, i18n } = useTranslation();
  const { applyAuth } = useAuth();
  const token = tokenFromPath();

  const { data: invite, isLoading, isError } = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api.get<InviteInfo>(`/api/invites/${encodeURIComponent(token)}`),
    retry: false,
    enabled: !!token,
  });

  // Annahme-Seite in der beim Einladen gewählten Sprache darstellen.
  useEffect(() => {
    if (invite?.language && i18n.language !== invite.language) {
      void i18n.changeLanguage(invite.language);
    }
  }, [invite?.language, i18n]);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t('invite.mismatch'));
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ user: User; csrfToken: string }>(
        `/api/invites/${encodeURIComponent(token)}/accept`,
        { username, password },
      );
      // Token aus der Adressleiste entfernen, dann als frisch eingeloggter User in die App.
      window.history.replaceState({}, '', '/');
      applyAuth(res.user, res.csrfToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('invite.failed'));
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <LogoMark className="h-12 w-12 animate-pulse" />
      </div>
    );
  }

  // Ungültige / abgelaufene / bereits eingelöste Einladung.
  if (isError || !invite) {
    return (
      <AuthLayout>
        <div className="mb-8">
          <span className="eyebrow">{t('app.name')}</span>
          <h1
            className="mt-2 text-2xl font-bold tracking-tight text-ink"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {t('invite.invalidTitle')}
          </h1>
          <p className="mt-1 text-sm text-muted">{t('invite.invalidText')}</p>
        </div>
        <Button variant="secondary" size="md" className="w-full" onClick={() => (window.location.href = '/')}>
          {t('invite.backToLogin')}
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout securityNote={t('invite.securityNote')}>
      <div className="mb-8">
        <span className="eyebrow">{t('app.name')}</span>
        <h1
          className="mt-2 text-2xl font-bold tracking-tight text-ink"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {t('invite.title')}
        </h1>
        <p className="mt-1 text-sm text-muted">{t('invite.subtitle')}</p>
      </div>

      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="invite-email">{t('invite.emailLabel')}</Label>
          <Input id="invite-email" value={invite.email} readOnly disabled autoComplete="email" />
        </div>
        <div>
          <Label htmlFor="invite-username">{t('invite.usernameLabel')}</Label>
          <Input
            id="invite-username"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="invite-password">{t('invite.passwordLabel')}</Label>
          <PasswordInput
            id="invite-password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="invite-confirm">{t('invite.confirmLabel')}</Label>
          <PasswordInput
            id="invite-confirm"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>

        {error && (
          <p className="rounded-md border border-danger-soft bg-danger-soft/50 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" size="md" loading={loading} className="w-full">
          {loading ? t('invite.submitting') : t('invite.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}

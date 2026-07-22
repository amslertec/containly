import { useTranslation } from 'react-i18next';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemeMode } from '../lib/theme';
import { SUPPORTED_LANGUAGES } from '../i18n';
import { useAuth } from '../app/AuthContext';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

const icons: Record<ThemeMode, React.ReactNode> = {
  system: <Monitor className="h-4 w-4" />,
  light: <Sun className="h-4 w-4" />,
  dark: <Moon className="h-4 w-4" />,
};

export function ThemeToggle({ className }: { className?: string }) {
  const { mode, cycle } = useTheme();
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={cycle}
      title={`${t('theme.toggle')} — ${t(`theme.${mode}`)}`}
      aria-label={t('theme.toggle')}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-md text-muted',
        'hover:bg-surface-hover hover:text-ink transition-colors border border-transparent',
        className,
      )}
    >
      {icons[mode]}
    </button>
  );
}

export function LangToggle({ className }: { className?: string }) {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const current = (i18n.resolvedLanguage ?? 'en').slice(0, 2);

  const change = (lng: string): void => {
    void i18n.changeLanguage(lng);
    // Angemeldet: Wahl serverseitig am Benutzer speichern (für E-Mail-Sprache).
    if (user && (lng === 'de' || lng === 'en')) {
      void api.put('/api/auth/language', { language: lng }).catch(() => undefined);
    }
  };

  return (
    <div className={cn('inline-flex items-center rounded-md border border-border p-0.5', className)}>
      {SUPPORTED_LANGUAGES.map((lng) => (
        <button
          key={lng}
          type="button"
          onClick={() => change(lng)}
          className={cn(
            'rounded px-2 py-1 text-xs font-medium uppercase tracking-wide transition-colors',
            current === lng ? 'bg-primary text-primary-ink' : 'text-muted hover:text-ink',
          )}
        >
          {lng}
        </button>
      ))}
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemeMode } from '../lib/theme';
import { SUPPORTED_LANGUAGES } from '../i18n';
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
  const current = (i18n.resolvedLanguage ?? 'en').slice(0, 2);
  return (
    <div className={cn('inline-flex items-center rounded-md border border-border p-0.5', className)}>
      {SUPPORTED_LANGUAGES.map((lng) => (
        <button
          key={lng}
          type="button"
          onClick={() => void i18n.changeLanguage(lng)}
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

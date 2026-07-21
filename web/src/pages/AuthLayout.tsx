import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { LogoMark, Wordmark } from '../components/Logo';
import { LangToggle, ThemeToggle } from '../components/ThemeLangControls';

/**
 * Split-Screen für Setup/Login. Linkes Panel trägt die Marke (großes Schild-Logo
 * auf ruhigem, geometrischem Raster), rechts das Formular.
 */
export function AuthLayout({
  children,
  securityNote,
}: {
  children: React.ReactNode;
  securityNote?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
      {/* Brand-Panel */}
      <aside
        className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between p-12"
        style={{ background: 'var(--w-primary)' }}
      >
        <BrandPattern />
        <div className="relative z-10">
          <Wordmark onPrimary />
        </div>

        <div className="relative z-10 max-w-md">
          <LogoMark variant="onPrimary" className="mb-6 h-16 w-16 opacity-95" />
          <p
            className="text-[2.4rem] leading-[1.1] font-semibold tracking-tight"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--w-primary-ink)' }}
          >
            {t('app.tagline')}
          </p>
        </div>

        <div
          className="relative z-10 flex items-center gap-2 text-xs"
          style={{ color: 'var(--w-primary-ink)', opacity: 0.75 }}
        >
          <ShieldCheck className="h-4 w-4" />
          <span>Argon2id · Session-Cookies · CSRF · Audit-Log</span>
        </div>
      </aside>

      {/* Formular-Panel */}
      <main className="relative flex flex-col bg-bg">
        <div className="flex items-center justify-between p-5">
          <div className="lg:hidden">
            <Wordmark />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <LangToggle />
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 pb-16">
          <div className="w-full max-w-sm">
            {children}
            {securityNote && (
              <p className="mt-6 flex items-start gap-2 text-xs text-muted">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" />
                <span>{securityNote}</span>
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/** Dezentes geometrisches Punkt-Raster als Hintergrund (kein Motiv, nur Struktur). */
function BrandPattern() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <svg className="absolute inset-0 h-full w-full" style={{ opacity: 0.16 }}>
        <defs>
          <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.4" fill="var(--w-primary-ink)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots)" />
      </svg>
    </div>
  );
}

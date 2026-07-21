import { cn } from '../lib/utils';

/**
 * Containly-Marke: ein geometrisches Perimeter-Schild umschließt drei ausgerichtete
 * Knoten. Der mittlere Amber-Knoten markiert den aktiven Host.
 * `variant='onPrimary'` rendert für farbige (teal) Hintergründe in Kontrastfarbe.
 */
export function LogoMark({
  className,
  variant = 'primary',
}: {
  className?: string;
  variant?: 'primary' | 'onPrimary';
}) {
  const main = variant === 'onPrimary' ? 'var(--w-primary-ink)' : 'var(--w-primary)';
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <path
        d="M24 7 L39 12 L39 24 C39 32 32 38 24 41 C16 38 9 32 9 24 L9 12 Z"
        stroke={main}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="22" r="2.6" fill={main} />
      <circle cx="24" cy="22" r="2.6" fill="var(--w-signal)" />
      <circle cx="32" cy="22" r="2.6" fill={main} />
    </svg>
  );
}

export function Wordmark({
  className,
  subtitle,
  onPrimary,
}: {
  className?: string;
  subtitle?: string;
  onPrimary?: boolean;
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className="h-8 w-8 shrink-0" variant={onPrimary ? 'onPrimary' : 'primary'} />
      <div className="leading-none">
        <div
          className="text-[19px] font-semibold tracking-tight"
          style={{
            fontFamily: 'var(--font-display)',
            color: onPrimary ? 'var(--w-primary-ink)' : 'var(--w-ink)',
          }}
        >
          Containly
        </div>
        {subtitle && (
          <div
            className="mt-1 font-mono"
            style={{
              fontSize: 9.5,
              letterSpacing: '0.02em',
              color: onPrimary ? 'var(--w-primary-ink)' : 'var(--w-faint)',
              opacity: onPrimary ? 0.8 : 1,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

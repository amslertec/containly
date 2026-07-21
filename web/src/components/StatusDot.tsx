import { cn } from '../lib/utils';

type DotTone = 'run' | 'pause' | 'stop' | 'danger' | 'warn' | 'neutral';

const toneColor: Record<DotTone, string> = {
  run: 'var(--w-run)',
  pause: 'var(--w-pause)',
  stop: 'var(--w-stop)',
  danger: 'var(--w-danger)',
  warn: 'var(--w-warn)',
  neutral: 'var(--w-faint)',
};

/** Container-State → Signal-Ton (Signalflaggen-Logik). */
export function stateTone(state: string): DotTone {
  switch (state) {
    case 'running':
      return 'run';
    case 'paused':
      return 'pause';
    case 'restarting':
      return 'warn';
    case 'dead':
      return 'danger';
    case 'exited':
    case 'removing':
      return 'stop';
    default:
      return 'neutral';
  }
}

/**
 * Status-Indikator: pulst bei laufendem Zustand sanft.
 * Respektiert prefers-reduced-motion.
 */
export function StatusDot({
  tone,
  pulse,
  className,
}: {
  tone: DotTone;
  pulse?: boolean;
  className?: string;
}) {
  const color = toneColor[tone];
  return (
    <span className={cn('relative inline-flex h-2.5 w-2.5 shrink-0', className)}>
      {pulse && (
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
          style={{ background: color }}
        />
      )}
      <span
        className="relative inline-flex h-2.5 w-2.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 18%, transparent)` }}
      />
    </span>
  );
}

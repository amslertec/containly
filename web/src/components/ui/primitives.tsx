import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink',
          'placeholder:text-faint transition-[border-color,box-shadow] outline-none',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          className,
        )}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink font-mono',
        'placeholder:text-faint transition-[border-color,box-shadow] outline-none resize-y',
        className,
      )}
      {...props}
    />
  );
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn('block text-[13px] font-medium text-muted mb-1.5', className)} {...props} />
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-border bg-surface', className)}
      style={{ boxShadow: 'var(--w-shadow)' }}
      {...props}
    />
  );
}

export function Eyebrow({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('eyebrow', className)} {...props} />;
}

type BadgeTone = 'neutral' | 'run' | 'pause' | 'stop' | 'danger' | 'warn' | 'primary' | 'signal';

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-muted border-border',
  run: 'bg-run-soft text-run border-transparent',
  pause: 'bg-pause-soft text-pause border-transparent',
  stop: 'bg-stop-soft text-stop border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
  warn: 'bg-warn-soft text-warn border-transparent',
  primary: 'bg-primary-soft text-primary border-transparent',
  signal: 'bg-signal-soft text-signal border-transparent',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        badgeTones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin text-muted', className)} />;
}

export function KeyValue({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 py-2">
      <dt className="eyebrow">{label}</dt>
      <dd className={cn('text-sm text-ink break-words', mono && 'font-mono text-[13px]')}>
        {children}
      </dd>
    </div>
  );
}

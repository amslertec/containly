import { useTranslation } from 'react-i18next';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { Button } from './ui/Button';
import { cn } from '../lib/utils';

export function LoadingState({ label, className }: { label?: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-16 text-muted', className)}>
      <Loader2 className="h-6 w-6 animate-spin" />
      <p className="text-sm">{label ?? t('common.loading')}</p>
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  icon,
  action,
  className,
}: {
  title?: string;
  hint?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 px-6 text-center',
        className,
      )}
    >
      <div className="text-faint">{icon ?? <Inbox className="h-8 w-8" />}</div>
      <div>
        <p className="text-sm font-medium text-ink">{title ?? t('states.emptyTitle')}</p>
        <p className="mt-1 text-sm text-muted">{hint ?? t('states.emptyHint')}</p>
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-danger-soft bg-danger-soft/40 py-14 px-6 text-center',
        className,
      )}
    >
      <AlertTriangle className="h-7 w-7 text-danger" />
      <div>
        <p className="text-sm font-medium text-ink">{t('states.errorTitle')}</p>
        {message && <p className="mt-1 max-w-md text-sm text-muted">{message}</p>}
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}

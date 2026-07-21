import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpCircle, CheckCircle2, ExternalLink, RefreshCw } from 'lucide-react';
import { useVersion, useVersionCheck } from '../hooks/version';
import { ReleaseNotes } from './ReleaseNotes';
import { Button } from './ui/Button';
import { Badge, Card } from './ui/primitives';
import { toast } from './Toaster';
import { relativeTime } from '../lib/time';
import { cn } from '../lib/utils';

export function VersionPanel() {
  const { t } = useTranslation();
  const { data } = useVersion();
  const check = useVersionCheck();
  const [checking, setChecking] = useState(false);

  const doCheck = async (): Promise<void> => {
    setChecking(true);
    try {
      const res = await check();
      if (res.updateAvailable) toast.info(t('version.toastUpdate', { version: res.latest }));
      else toast.success(t('version.toastUptodate'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card className="max-w-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
              {t('version.title')}
            </h2>
            {data?.updateAvailable ? (
              <Badge tone="signal">
                <ArrowUpCircle className="h-3.5 w-3.5" /> {t('version.updateAvailable')}
              </Badge>
            ) : (
              <Badge tone="run">
                <CheckCircle2 className="h-3.5 w-3.5" /> {t('version.upToDate')}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            {t('version.installed', { version: data?.current ?? '—' })}
            {data?.updateAvailable && data.latest ? ` · ${t('version.newest', { version: data.latest })}` : ''}
          </p>
          {data?.checkedAt && (
            <p className="mt-1 text-xs text-faint">
              {t('version.lastChecked')} {relativeTime(data.checkedAt)}
            </p>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={() => void doCheck()} loading={checking}>
          <RefreshCw className={cn('h-4 w-4', checking && 'animate-spin')} /> {t('version.checkNow')}
        </Button>
      </div>

      {data?.updateAvailable && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-ink">{data.releaseName || t('version.changes')}</p>
          {data.notes && (
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border bg-surface-2 p-4">
              <ReleaseNotes text={data.notes} />
            </div>
          )}
          <a
            href={data.releaseUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary underline underline-offset-2"
          >
            {t('version.viewRelease')} <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      )}
    </Card>
  );
}

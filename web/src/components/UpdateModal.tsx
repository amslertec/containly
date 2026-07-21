import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpCircle, ExternalLink } from 'lucide-react';
import { useVersion } from '../hooks/version';
import { Button } from './ui/Button';

const ACK_KEY = 'containly-update-ack';

/**
 * Appears once a newer GitHub release than the running version exists. Shows the
 * release notes and must be acknowledged; acknowledged per version (localStorage),
 * so it reappears when an even newer version ships.
 */
export function UpdateModal() {
  const { t } = useTranslation();
  const { data } = useVersion();
  const [ack, setAck] = useState(() => localStorage.getItem(ACK_KEY));

  if (!data?.updateAvailable || !data.latest) return null;
  if (ack === data.latest) return null;

  const confirm = (): void => {
    localStorage.setItem(ACK_KEY, data.latest as string);
    setAck(data.latest);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6" style={{ boxShadow: 'var(--w-shadow-lg)' }}>
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
            <ArrowUpCircle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="update-modal-title" className="text-lg font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
              {t('update.title')}
            </h2>
            <p className="text-sm text-muted">
              {t('update.subtitle', { latest: data.latest, current: data.current })}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-ink">{data.releaseName || t('update.changesHeading')}</p>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border bg-surface-2 p-4">
            {data.notes ? (
              <pre className="whitespace-pre-wrap break-words font-sans text-sm text-ink">{data.notes}</pre>
            ) : (
              <p className="text-sm text-muted">{t('update.noNotes')}</p>
            )}
          </div>
          <a
            href={data.releaseUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary underline underline-offset-2"
          >
            {t('update.releaseDetails')} <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        <div className="mt-6 flex justify-end">
          <Button variant="primary" onClick={confirm}>{t('update.acknowledge')}</Button>
        </div>
      </div>
    </div>
  );
}

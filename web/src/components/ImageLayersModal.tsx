import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Layers } from 'lucide-react';
import type { ImageLayer } from '@containly/shared';
import { api } from '../lib/api';
import { Dialog, DialogContent, DialogTitle } from './ui/Dialog';
import { LoadingState } from './States';
import { relativeTime } from '../lib/time';
import { formatBytes } from '../lib/utils';

/**
 * Zeigt die Layer eines Images (`docker history`): Befehl, Größe (als Balken relativ
 * zum größten Layer) und Alter. Hilft zu verstehen, warum ein Image groß ist.
 */
export function ImageLayersModal({
  endpointId,
  imageId,
  imageName,
  onClose,
}: {
  endpointId: string;
  imageId: string;
  imageName: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['image-history', endpointId, imageId],
    queryFn: () =>
      api.get<{ layers: ImageLayer[] }>(
        `/api/images/history?endpoint=${encodeURIComponent(endpointId)}&ref=${encodeURIComponent(imageId)}`,
      ),
    select: (d) => d.layers,
  });

  const layers = data ?? [];
  const total = layers.reduce((n, l) => n + l.size, 0);
  const maxSize = Math.max(1, ...layers.map((l) => l.size));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose} className="max-w-3xl">
        <DialogTitle>
          <span className="flex items-center gap-2">
            <Layers className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate font-mono text-[15px]" title={imageName}>{imageName}</span>
          </span>
        </DialogTitle>
        <p className="mt-1 text-xs text-muted">
          {t('layers.summary', { count: layers.length, size: formatBytes(total) })}
        </p>

        <div className="mt-3 max-h-[60vh] overflow-y-auto rounded-lg border border-border">
          {isLoading ? (
            <LoadingState />
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-border text-left">
                  <th className="eyebrow w-8 py-2 pl-3 font-semibold">#</th>
                  <th className="eyebrow py-2 font-semibold">{t('layers.command')}</th>
                  <th className="eyebrow w-40 py-2 pr-3 text-right font-semibold">{t('layers.size')}</th>
                </tr>
              </thead>
              <tbody>
                {layers.map((l, i) => (
                  <tr key={i} className="border-b border-border align-top last:border-0">
                    <td className="py-2 pl-3 text-[11px] text-faint tabular">{i + 1}</td>
                    <td className="py-2 pr-2">
                      <span className="block whitespace-pre-wrap break-all font-mono text-[11.5px] text-ink">
                        {l.createdBy || '—'}
                      </span>
                      {l.comment && <span className="text-[11px] text-faint">{l.comment}</span>}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className={l.size > 0 ? 'h-full bg-primary' : 'h-full'}
                            style={{ width: `${(l.size / maxSize) * 100}%` }}
                          />
                        </div>
                        <span className="w-16 text-right font-mono text-[11.5px] text-muted tabular">
                          {l.size > 0 ? formatBytes(l.size) : '0 B'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {!isLoading && layers.length > 0 && (
          <p className="mt-2 text-[11px] text-faint">
            {t('layers.oldest', { when: relativeTime(new Date(layers[0]!.created * 1000).toISOString()) })}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

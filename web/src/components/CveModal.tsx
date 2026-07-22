import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import type { CveDetail, VulnDetails } from '@containly/shared';
import { api } from '../lib/api';
import { Dialog, DialogContent, DialogTitle } from './ui/Dialog';
import { LoadingState } from './States';
import { relativeTime } from '../lib/time';
import { cn } from '../lib/utils';

type SevFilter = 'ALL' | CveDetail['severity'];

const SEV_STYLE: Record<CveDetail['severity'], string> = {
  CRITICAL: 'bg-danger text-white',
  HIGH: 'bg-warn text-white',
  MEDIUM: 'bg-amber-500/85 text-white',
  LOW: 'bg-surface-2 text-muted',
  UNKNOWN: 'bg-surface-2 text-faint',
};

/**
 * Detail-Modal zu den Vulnerability-Badges eines Images: listet die einzelnen CVEs
 * (Paket, Version, Fix, Link). Öffnet gefiltert auf den angeklickten Schweregrad.
 */
export function CveModal({
  endpointId,
  imageId,
  imageName,
  initialSeverity,
  onClose,
}: {
  endpointId: string;
  imageId: string;
  imageName: string;
  initialSeverity: SevFilter;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<SevFilter>(initialSeverity);

  const { data, isLoading } = useQuery({
    queryKey: ['vuln-details', endpointId, imageId],
    queryFn: () =>
      api.get<VulnDetails>(
        `/api/images/vulnerabilities/details?endpoint=${encodeURIComponent(endpointId)}&imageId=${encodeURIComponent(imageId)}`,
      ),
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
    for (const v of data?.cves ?? []) c[v.severity] = (c[v.severity] ?? 0) + 1;
    return c;
  }, [data]);

  const shown = useMemo(
    () => (data?.cves ?? []).filter((v) => filter === 'ALL' || v.severity === filter),
    [data, filter],
  );

  const tabs: SevFilter[] = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose} className="max-w-3xl">
        <DialogTitle>
          <span className="font-mono text-[15px]">{imageName}</span>
        </DialogTitle>
        <p className="mt-1 text-xs text-muted">
          {t('vulns.modal.subtitle')}
          {data?.scannedAt && <> · {t('vulns.modal.scanned', { when: relativeTime(data.scannedAt) })}</>}
        </p>

        {/* Schweregrad-Filter */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {tabs.map((s) => {
            const n = s === 'ALL' ? (data?.cves.length ?? 0) : (counts[s] ?? 0);
            if (s !== 'ALL' && n === 0) return null;
            return (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                  filter === s
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-border text-muted hover:text-ink',
                )}
              >
                {s === 'ALL' ? t('vulns.modal.all') : t(`vulns.sev.${s.toLowerCase()}`)} ({n})
              </button>
            );
          })}
        </div>

        <div className="mt-3 max-h-[55vh] overflow-y-auto rounded-lg border border-border">
          {isLoading ? (
            <LoadingState />
          ) : shown.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted">
              <ShieldCheck className="h-7 w-7 text-run" />
              {t('vulns.clean')}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-border text-left">
                  <Th>{t('vulns.modal.cve')}</Th>
                  <Th>{t('vulns.modal.severity')}</Th>
                  <Th>{t('vulns.modal.package')}</Th>
                  <Th>{t('vulns.modal.fix')}</Th>
                </tr>
              </thead>
              <tbody>
                {shown.map((v, i) => (
                  <tr key={`${v.id}-${v.pkg}-${i}`} className="border-b border-border last:border-0 align-top">
                    <td className="py-2 pl-3 pr-2">
                      {v.url ? (
                        <a
                          href={v.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-[12px] text-primary hover:underline"
                        >
                          {v.id} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="font-mono text-[12px] text-ink">{v.id}</span>
                      )}
                      {v.title && <span className="mt-0.5 block max-w-md text-[11px] text-muted">{v.title}</span>}
                    </td>
                    <td className="py-2 pr-2">
                      <span className={cn('rounded px-1.5 py-0.5 text-[10.5px] font-semibold', SEV_STYLE[v.severity])}>
                        {t(`vulns.sev.${v.severity.toLowerCase()}`)}
                      </span>
                    </td>
                    <td className="py-2 pr-2">
                      <span className="font-mono text-[12px] text-ink">{v.pkg}</span>
                      {v.installed && <span className="block font-mono text-[11px] text-faint">{v.installed}</span>}
                    </td>
                    <td className="py-2 pr-3">
                      {v.fixed ? (
                        <span className="font-mono text-[12px] text-run">{v.fixed}</span>
                      ) : (
                        <span className="text-[11px] text-faint">{t('vulns.modal.noFix')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="eyebrow whitespace-nowrap px-2 py-2 font-semibold first:pl-3 last:pr-3">{children}</th>;
}

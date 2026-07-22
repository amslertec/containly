import { useTranslation } from 'react-i18next';
import { Loader2, ShieldCheck, ShieldAlert } from 'lucide-react';
import type { CveDetail, ImageVuln } from '@containly/shared';
import { cn } from '../lib/utils';

type Severity = CveDetail['severity'];

/**
 * Kompakte Vulnerability-Anzeige je Image (Trivy): vier Zahlen nach Schweregrad
 * (Critical│High│Medium│Low). Sauberes Image → grüner Haken; noch nicht gescannt →
 * dezenter Hinweis; Scan läuft → Spinner; Scan-Fehler → Warnsymbol.
 * Klick auf eine Zahl öffnet über `onOpen(severity)` das CVE-Detail-Modal.
 */
export function VulnBadges({
  vuln,
  onOpen,
}: {
  vuln: ImageVuln | undefined;
  onOpen?: (severity: Severity | 'ALL') => void;
}) {
  const { t } = useTranslation();

  if (!vuln) return <span className="text-[11px] text-faint">{t('vulns.notScanned')}</span>;
  if (vuln.status === 'scanning')
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('vulns.scanning')}
      </span>
    );
  if (vuln.status === 'error')
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-warn" title={t('vulns.error')}>
        <ShieldAlert className="h-3.5 w-3.5" /> {t('vulns.error')}
      </span>
    );

  const total = vuln.critical + vuln.high + vuln.medium + vuln.low;
  if (total === 0)
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-run" title={t('vulns.clean')}>
        <ShieldCheck className="h-4 w-4" /> {t('vulns.clean')}
      </span>
    );

  return (
    <span className="inline-flex items-center gap-1" title={t('vulns.tooltip')}>
      <Sev n={vuln.critical} sev="CRITICAL" className="bg-danger text-white" onOpen={onOpen} />
      <Sev n={vuln.high} sev="HIGH" className="bg-warn text-white" onOpen={onOpen} />
      <Sev n={vuln.medium} sev="MEDIUM" className="bg-amber-500/85 text-white" onOpen={onOpen} />
      <Sev n={vuln.low} sev="LOW" className="bg-surface-2 text-muted" onOpen={onOpen} />
    </span>
  );
}

/** Eine anklickbare Schweregrad-Pille; bei 0 abgedimmt und nicht klickbar. */
function Sev({
  n,
  sev,
  className,
  onOpen,
}: {
  n: number;
  sev: Severity;
  className: string;
  onOpen?: (severity: Severity | 'ALL') => void;
}) {
  const clickable = n > 0 && !!onOpen;
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={clickable ? () => onOpen!(sev) : undefined}
      className={cn(
        'inline-flex min-w-[22px] items-center justify-center rounded px-1 py-0.5 text-[11px] font-semibold tabular transition-transform',
        n > 0 ? className : 'bg-surface-2 text-faint',
        clickable ? 'cursor-pointer hover:brightness-110 active:scale-95' : 'cursor-default',
      )}
    >
      {n}
    </button>
  );
}

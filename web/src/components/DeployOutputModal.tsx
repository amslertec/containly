import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, X, XCircle } from 'lucide-react';
import { Button } from './ui/Button';

export interface DeployLog {
  title: string;
  text: string;
  error: boolean;
  running?: boolean;
}

/** Terminal-style modal showing the output of a stack deploy/down/action. */
export function DeployOutputModal({ log, onClose }: { log: DeployLog | null; onClose: () => void }) {
  const { t } = useTranslation();
  const preRef = useRef<HTMLPreElement>(null);
  // Wächst der Stream, immer ans Ende scrollen (wie ein Terminal).
  useEffect(() => {
    const el = preRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log?.text]);
  if (!log) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-surface"
        style={{ boxShadow: 'var(--w-shadow-lg)' }}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            {log.running ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : log.error ? (
              <XCircle className="h-5 w-5 text-danger" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-run" />
            )}
            <span className="font-medium text-ink">{log.title}</span>
          </div>
          {!log.running && (
            <button onClick={onClose} className="text-muted transition-colors hover:text-ink" aria-label={t('common.close')}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <pre
          ref={preRef}
          className="flex-1 overflow-auto whitespace-pre-wrap break-words bg-[#0a1417] p-4 font-mono text-[12.5px] leading-relaxed text-[#d6e0dd]"
        >
          {log.text || '…'}
        </pre>
        <div className="flex justify-end border-t border-border px-4 py-3">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={log.running}>
            {t('common.close')}
          </Button>
        </div>
      </div>
    </div>
  );
}

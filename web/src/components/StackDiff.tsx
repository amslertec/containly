import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { GitCompare } from 'lucide-react';
import type { StackDiff as StackDiffData } from '@containly/shared';
import { api } from '../lib/api';
import { Button } from './ui/Button';
import { Dialog, DialogContent, DialogTitle } from './ui/Dialog';
import { LoadingState } from './States';
import { cn } from '../lib/utils';

/**
 * Zeigt die Änderungen des Compose-Inhalts seit dem letzten Deploy (Zeilen-Diff),
 * bevor man erneut deployt. Als Button, der ein Modal öffnet.
 */
export function StackDiffButton({ id }: { id: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['stack-diff', id],
    queryFn: () => api.get<StackDiffData>(`/api/stacks/${encodeURIComponent(id)}/diff`),
    enabled: open,
  });

  return (
    <>
      <Button
        variant="subtle"
        size="sm"
        onClick={() => {
          setOpen(true);
          void refetch();
        }}
        title={t('stackdiff.title')}
      >
        <GitCompare className="h-4 w-4" /> {t('stackdiff.changes')}
      </Button>

      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent onClose={() => setOpen(false)} className="max-w-3xl">
            <DialogTitle>{t('stackdiff.title')}</DialogTitle>
            {isLoading ? (
              <LoadingState />
            ) : !data?.hasPrevious ? (
              <p className="mt-4 text-sm text-muted">{t('stackdiff.firstDeploy')}</p>
            ) : !data.changed ? (
              <p className="mt-4 text-sm text-run">{t('stackdiff.noChanges')}</p>
            ) : (
              <div className="mt-3 max-h-[60vh] overflow-auto rounded-lg border border-border bg-bg-sunken">
                <pre className="min-w-max py-2 font-mono text-[12px] leading-relaxed">
                  {data.lines.map((l, i) => (
                    <div
                      key={i}
                      className={cn(
                        'px-3',
                        l.type === 'add' && 'bg-run/10 text-run',
                        l.type === 'del' && 'bg-danger/10 text-danger',
                        l.type === 'ctx' && 'text-muted',
                      )}
                    >
                      <span className="select-none opacity-60">
                        {l.type === 'add' ? '+ ' : l.type === 'del' ? '- ' : '  '}
                      </span>
                      {l.text}
                    </div>
                  ))}
                </pre>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

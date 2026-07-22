import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GitStack } from '@containly/shared';
import { useEndpoints } from '../app/EndpointContext';
import { Button } from './ui/Button';
import { Checkbox } from './ui/Checkbox';
import { Input, Label } from './ui/primitives';
import { Select } from './ui/Select';
import { Dialog, DialogContent, DialogTitle } from './ui/Dialog';
import { toast } from './Toaster';
import { api, ApiError } from '../lib/api';

/** Dialog: einen Stack aus einem Git-Repo in einen Stack-Pfad klonen. */
export function GitStackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { endpoints, selected } = useEndpoints();
  const withPaths = endpoints.filter((e) => e.stackPaths.length > 0);

  const [endpoint, setEndpoint] = useState('');
  const [basePath, setBasePath] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [name, setName] = useState('');
  const [autoSync, setAutoSync] = useState(false);

  useEffect(() => {
    if (!open) return;
    const pref = withPaths.find((e) => e.id === selected) ?? withPaths[0];
    if (pref) {
      setEndpoint(pref.id);
      setBasePath(pref.stackPaths[0] ?? '');
    }
    setRepoUrl('');
    setBranch('main');
    setName('');
    setAutoSync(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const paths = endpoints.find((e) => e.id === endpoint)?.stackPaths ?? [];
  const nameValid = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name);

  // Repo-URL → Default-Name vorschlagen (letztes Pfadsegment ohne .git).
  const onRepoBlur = (): void => {
    if (name.trim()) return;
    const m = repoUrl.trim().replace(/\.git$/, '').split(/[/:]/).pop();
    if (m) setName(m);
  };

  const add = useMutation({
    mutationFn: () =>
      api.post<{ stack: GitStack }>('/api/gitops', {
        endpoint,
        basePath,
        name,
        repoUrl: repoUrl.trim(),
        branch: branch.trim() || 'main',
        autoSync,
      }),
    onSuccess: () => {
      toast.success(t('gitops.added'));
      void qc.invalidateQueries({ queryKey: ['gitops'] });
      void qc.invalidateQueries({ queryKey: ['stacks'] });
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('common.error')),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose} className="max-w-lg">
        <DialogTitle>{t('gitops.addTitle')}</DialogTitle>
        <p className="mt-1 text-[12px] text-muted">{t('gitops.addHint')}</p>
        <div className="mt-4 space-y-3">
          <div>
            <Label>{t('gitops.repoUrl')}</Label>
            <Input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              onBlur={onRepoBlur}
              placeholder="https://github.com/user/repo.git"
              className="font-mono text-[12px]"
              autoFocus
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t('gitops.branch')}</Label>
              <Input value={branch} onChange={(e) => setBranch(e.target.value)} className="font-mono" placeholder="main" />
            </div>
            <div>
              <Label>{t('gitops.name')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="font-mono" placeholder="my-stack" />
              {name && !nameValid && <p className="mt-1 text-xs text-danger">{t('gitops.nameInvalid')}</p>}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t('endpoint.select')}</Label>
              <Select
                value={endpoint}
                onChange={(v) => { setEndpoint(v); setBasePath(endpoints.find((e) => e.id === v)?.stackPaths[0] ?? ''); }}
                className="w-full"
                options={withPaths.map((e) => ({ value: e.id, label: e.name }))}
              />
            </div>
            <div>
              <Label>{t('stacks.path')}</Label>
              <Select
                value={basePath}
                onChange={setBasePath}
                className="w-full"
                options={paths.map((p) => ({ value: p, label: p }))}
              />
            </div>
          </div>
          <button type="button" onClick={() => setAutoSync((v) => !v)} className="flex items-center gap-2 text-sm text-muted">
            <Checkbox checked={autoSync} onChange={() => setAutoSync((v) => !v)} aria-label={t('gitops.autoSync')} />
            {t('gitops.autoSync')}
          </button>
          <p className="text-[11px] text-faint">{t('gitops.autoSyncHint')}</p>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            onClick={() => add.mutate()}
            loading={add.isPending}
            disabled={!repoUrl.trim() || !nameValid || !endpoint || !basePath}
          >
            {t('gitops.clone')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

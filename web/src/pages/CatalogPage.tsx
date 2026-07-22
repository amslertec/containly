import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Plus, Rocket, Search, Settings2, Trash2 } from 'lucide-react';
import type { CatalogSource, CatalogTemplate } from '@containly/shared';
import { useEndpoints } from '../app/EndpointContext';
import { useAuth } from '../app/AuthContext';
import { Page, PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge, Card, Input, Label } from '../components/ui/primitives';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/Dialog';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from '../components/ui/Pagination';
import { toast } from '../components/Toaster';
import { api, ApiError } from '../lib/api';

export function CatalogPage() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [query, setQuery] = useState('');
  const [deployTpl, setDeployTpl] = useState<CatalogTemplate | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['catalog-templates'],
    queryFn: () => api.get<{ templates: CatalogTemplate[] }>('/api/catalog/templates'),
    select: (d) => d.templates,
    staleTime: 5 * 60_000,
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data ?? [];
    if (!q) return list;
    return list.filter(
      (tpl) =>
        tpl.title.toLowerCase().includes(q) ||
        tpl.description.toLowerCase().includes(q) ||
        tpl.categories.some((c) => c.toLowerCase().includes(q)),
    );
  }, [data, query]);

  const pg = usePagination(filtered, 25);

  return (
    <Page>
      <PageHeader
        eyebrow={t('app.name')}
        title={t('catalog.title')}
        subtitle={data ? t('catalog.count', { count: data.length }) : undefined}
        actions={
          isAdmin && (
            <Button variant="subtle" size="sm" onClick={() => setSourcesOpen(true)}>
              <Settings2 className="h-4 w-4" /> {t('catalog.sources')}
            </Button>
          )
        }
      />

      <div className="relative mb-5 max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('catalog.searchPlaceholder')} className="pl-8" />
      </div>

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Boxes className="h-8 w-8" />} title={t('catalog.empty')} hint={t('catalog.emptyHint')} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pg.pageItems.map((tpl) => (
              <TemplateCard key={tpl.id} tpl={tpl} canDeploy={isAdmin} onDeploy={() => setDeployTpl(tpl)} />
            ))}
          </div>
          <Pagination pg={pg} />
        </>
      )}

      {deployTpl && <DeployDialog template={deployTpl} onClose={() => setDeployTpl(null)} />}
      {sourcesOpen && <SourcesDialog onClose={() => setSourcesOpen(false)} />}
    </Page>
  );
}

function TemplateCard({ tpl, canDeploy, onDeploy }: { tpl: CatalogTemplate; canDeploy: boolean; onDeploy: () => void }) {
  const { t } = useTranslation();
  const [logoOk, setLogoOk] = useState(true);
  return (
    <Card className="flex flex-col p-4">
      <div className="mb-2 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2">
          {tpl.logo && logoOk ? (
            <img src={tpl.logo} alt="" className="h-8 w-8 object-contain" onError={() => setLogoOk(false)} />
          ) : (
            <Boxes className="h-5 w-5 text-muted" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold text-ink">{tpl.title}</div>
          <div className="truncate font-mono text-[11px] text-faint">{tpl.image}</div>
        </div>
      </div>
      <p className="mb-3 line-clamp-2 flex-1 text-[12px] text-muted">{tpl.description}</p>
      <div className="mb-3 flex flex-wrap gap-1">
        {tpl.categories.slice(0, 3).map((c) => (
          <Badge key={c} tone="neutral">{c}</Badge>
        ))}
      </div>
      {canDeploy && (
        <Button variant="primary" size="sm" onClick={onDeploy} className="w-full">
          <Rocket className="h-4 w-4" /> {t('catalog.deploy')}
        </Button>
      )}
    </Card>
  );
}

function DeployDialog({ template, onClose }: { template: CatalogTemplate; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { endpoints } = useEndpoints();
  const deployable = endpoints.filter((e) => e.stackPaths.length > 0);
  const [endpoint, setEndpoint] = useState(deployable[0]?.id ?? '');
  const ep = deployable.find((e) => e.id === endpoint);
  const [basePath, setBasePath] = useState(ep?.stackPaths[0] ?? '');
  const [name, setName] = useState(template.title.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'app');
  const [env, setEnv] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const e of template.env) init[e.name] = e.default ?? '';
    return init;
  });

  const onEndpointChange = (id: string): void => {
    setEndpoint(id);
    const next = deployable.find((e) => e.id === id);
    setBasePath(next?.stackPaths[0] ?? '');
  };

  const deploy = useMutation({
    mutationFn: () =>
      api.post<{ result: { name: string } }>('/api/catalog/deploy', {
        endpoint,
        basePath,
        name,
        templateId: template.id,
        env,
      }),
    onSuccess: () => {
      toast.success(t('catalog.deployed', { name }));
      onClose();
      void navigate({ to: '/stacks' });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('common.error')),
  });

  const valid = endpoint && basePath && /^[a-zA-Z0-9._-]+$/.test(name);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose} className="max-w-lg">
        <DialogTitle>{t('catalog.deployTitle', { title: template.title })}</DialogTitle>
        <div className="mt-4 max-h-[65vh] space-y-3 overflow-y-auto">
          {deployable.length === 0 ? (
            <p className="rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-xs text-warn">
              {t('catalog.noStackPaths')}
            </p>
          ) : (
            <>
              <div>
                <Label>{t('common.host')}</Label>
                <Select value={endpoint} onChange={onEndpointChange} options={deployable.map((e) => ({ value: e.id, label: e.name }))} />
              </div>
              <div>
                <Label>{t('catalog.path')}</Label>
                <Select value={basePath} onChange={setBasePath} options={(ep?.stackPaths ?? []).map((p) => ({ value: p, label: p }))} />
              </div>
              <div>
                <Label htmlFor="tpl-name">{t('catalog.name')}</Label>
                <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} className="font-mono" />
              </div>
              {template.env.length > 0 && (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">{t('catalog.envVars')}</div>
                  {template.env.map((e) => (
                    <div key={e.name}>
                      <Label htmlFor={`env-${e.name}`}>{e.label ?? e.name}</Label>
                      <Input
                        id={`env-${e.name}`}
                        value={env[e.name] ?? ''}
                        onChange={(ev) => setEnv((s) => ({ ...s, [e.name]: ev.target.value }))}
                        className="font-mono"
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => deploy.mutate()} loading={deploy.isPending} disabled={!valid || deployable.length === 0}>
            <Rocket className="h-4 w-4" /> {t('catalog.deploy')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SourcesDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['catalog-sources'],
    queryFn: () => api.get<{ sources: CatalogSource[] }>('/api/catalog/sources'),
    select: (d) => d.sources,
  });
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const invalidate = (): void => {
    void qc.invalidateQueries({ queryKey: ['catalog-sources'] });
    void qc.invalidateQueries({ queryKey: ['catalog-templates'] });
  };

  const add = useMutation({
    mutationFn: () => api.post('/api/catalog/sources', { name, url }),
    onSuccess: () => {
      setName('');
      setUrl('');
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('common.error')),
  });
  const toggle = useMutation({
    mutationFn: (s: CatalogSource) => api.put(`/api/catalog/sources/${s.id}`, { name: s.name, url: s.url, enabled: !s.enabled }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/api/catalog/sources/${id}`),
    onSuccess: invalidate,
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose} className="max-w-xl">
        <DialogTitle>{t('catalog.sourcesTitle')}</DialogTitle>
        <p className="mt-1 text-xs text-muted">{t('catalog.sourcesInfo')}</p>
        <div className="mt-4 space-y-2">
          {(data ?? []).map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
              <Checkbox checked={s.enabled} onChange={() => toggle.mutate(s)} aria-label={s.name} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-ink">{s.name}</div>
                <div className="truncate font-mono text-[11px] text-faint">{s.url}</div>
              </div>
              <button
                onClick={() => remove.mutate(s.id)}
                title={t('common.remove')}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-2 border-t border-border pt-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
          <div>
            <Label htmlFor="src-name">{t('common.name')}</Label>
            <Input id="src-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My templates" />
          </div>
          <div>
            <Label htmlFor="src-url">URL</Label>
            <Input id="src-url" value={url} onChange={(e) => setUrl(e.target.value)} className="font-mono" placeholder="https://.../templates.json" />
          </div>
          <Button variant="primary" size="md" onClick={() => add.mutate()} loading={add.isPending} disabled={!name.trim() || !url.trim()}>
            <Plus className="h-4 w-4" /> {t('common.create')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

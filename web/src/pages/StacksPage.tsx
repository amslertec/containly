import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ArrowLeft,
  ArrowUpCircle,
  Check,
  File,
  FileCode,
  Folder,
  GitBranch,
  MoreVertical,
  Pause,
  Play,
  Plus,
  Power,
  RotateCw,
  Save,
  Search,
  Server,
  Ship,
  Square,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import type { GitStack, StackActionName, StackStatus, StackSummary } from '@containly/shared';
import { useAuth } from '../app/AuthContext';
import { useEndpoints } from '../app/EndpointContext';
import { useStack, useStackDir, useStackFile, useStackMutations, useStacks } from '../hooks/stacks';
import { useUpdateFlags } from '../hooks/updates';
import { useConfirm } from '../hooks/useConfirm';
import { Page, PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge, Card, Input, Label, Textarea } from '../components/ui/primitives';
import { TableWrap, THead, Th, Tr, Td, ResizableTable, useColumnResize, type Column } from '../components/ui/Table';
import { useTablePrefs, sortRows } from '../hooks/useTablePrefs';
import { Select } from '../components/ui/Select';
import { StatusDot, stateTone } from '../components/StatusDot';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from '../components/ui/Pagination';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/Dialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DeployOutputModal, type DeployLog } from '../components/DeployOutputModal';
import { GitStackDialog } from '../components/GitStackDialog';
import { toast } from '../components/Toaster';
import { api, ApiError } from '../lib/api';
import { relativeTime } from '../lib/time';
import { formatBytes, shortId, cn } from '../lib/utils';
import { runToCompose } from '../lib/composerize';

const statusTone: Record<StackStatus, 'run' | 'warn' | 'stop' | 'neutral'> = {
  running: 'run',
  partial: 'warn',
  stopped: 'stop',
  unknown: 'neutral',
};

const TEMPLATE = `services:
  app:
    image: nginx:alpine
    ports:
      - "8080:80"
    restart: unless-stopped
`;

const STK_WIDTHS: Record<string, number> = {
  name: 260,
  host: 130,
  status: 130,
  services: 110,
  path: 340,
  created: 150,
  actions: 120,
};
const STK_SORT: Record<string, (s: StackSummary) => string | number> = {
  name: (s) => s.name.toLowerCase(),
  status: (s) => s.status,
  services: (s) => s.services,
  created: (s) => s.updatedAt ?? '',
};

/* ── Liste ─────────────────────────────────────────────────────────────────── */
export function StacksPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { endpoints, selected, isAll } = useEndpoints();
  const { data, isLoading, isError, error, refetch } = useStacks();
  const mut = useStackMutations();
  const { confirm, dialogProps } = useConfirm();
  const [creating, setCreating] = useState(false);
  const [gitOpen, setGitOpen] = useState(false);
  const [query, setQuery] = useState('');

  const { widths, setWidth, commitWidths, sort, toggleSort } = useTablePrefs('stacks', STK_WIDTHS, {
    col: 'name',
    dir: 'asc',
  });
  const startResize = useColumnResize(widths, setWidth, commitWidths);
  const columns = useMemo<Column[]>(() => {
    const cols: Column[] = [{ key: 'name', label: t('common.name'), sortable: true, resizable: true, align: 'left' }];
    if (isAll) cols.push({ key: 'host', label: t('common.host'), resizable: true, align: 'left' });
    cols.push({ key: 'status', label: t('stacks.status'), sortable: true, resizable: true, align: 'left' });
    cols.push({ key: 'services', label: t('stacks.services'), sortable: true, resizable: true, align: 'right' });
    cols.push({ key: 'path', label: t('stacks.path'), resizable: true, align: 'left' });
    cols.push({ key: 'created', label: t('common.created'), sortable: true, resizable: true, align: 'right' });
    if (isAdmin) cols.push({ key: 'actions', label: t('common.actions'), align: 'right' });
    return cols;
  }, [t, isAll, isAdmin]);

  // Nur den gewählten Endpoint zeigen; „Alle Hosts" kombiniert alle.
  const all = data ?? [];
  const scoped = isAll ? all : all.filter((s) => s.endpoint === selected);
  const q = query.trim().toLowerCase();
  const stacks = useMemo(() => {
    const list = q
      ? scoped.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.endpointName.toLowerCase().includes(q) ||
            s.containerNames.some((n) => n.toLowerCase().includes(q)) ||
            s.images.some((i) => i.toLowerCase().includes(q)),
        )
      : scoped;
    const acc = STK_SORT[sort.col];
    return acc ? sortRows(list, acc, sort.dir, (s) => s.id) : list;
  }, [scoped, q, sort]);
  const pg = usePagination(stacks, 10);

  const scopeEndpoints = isAll ? endpoints : endpoints.filter((e) => e.id === selected);
  const hasPaths = scopeEndpoints.some((e) => e.stackPaths.length > 0);

  const open = (id: string) => void navigate({ to: '/stacks/$id', params: { id } });

  const runAction = async (s: StackSummary, action: StackActionName): Promise<void> => {
    if (action === 'kill') {
      const ok = await confirm({
        title: t(`stacks.${action}`),
        description: t('stacks.killConfirm', { name: s.name }),
        danger: true,
        confirmLabel: t(`stacks.${action}`),
      });
      if (!ok) return;
    }
    try {
      await mut.action.mutateAsync({ id: s.id, action });
      toast.success(t('stacks.actionDone', { action: t(`stacks.${action}`) }));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow={t('app.name')}
        title={t('stacks.title')}
        subtitle={t('stacks.subtitle')}
        actions={
          isAdmin &&
          hasPaths && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setGitOpen(true)}>
                <GitBranch className="h-4 w-4" /> {t('gitops.addTitle')}
              </Button>
              <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" /> {t('stacks.new')}
              </Button>
            </div>
          )
        }
      />

      {isAdmin && <GitStacksSection />}

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
      ) : !hasPaths ? (
        <EmptyState
          icon={<Server className="h-8 w-8" />}
          title={t('stacks.noPaths')}
          hint={t('stacks.noPathsHint')}
          action={
            <Button variant="secondary" size="sm" asChild>
              <Link to="/endpoints">{t('endpoint.title')} →</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="relative mb-4 max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('stacks.searchPlaceholder')}
              className="pl-8"
            />
          </div>

          {scoped.length === 0 ? (
            <EmptyState icon={<Ship className="h-8 w-8" />} title={t('stacks.noStacks')} hint={t('stacks.scanHint')} />
          ) : stacks.length === 0 ? (
            <EmptyState icon={<Search className="h-8 w-8" />} title={t('stacks.noResults')} hint="" />
          ) : (
            <>
          <ResizableTable
            columns={columns}
            widths={widths}
            sort={sort}
            onSort={toggleSort}
            onResizeStart={startResize}
          >
            <tbody>
              {pg.pageItems.map((s: StackSummary) => (
                <Tr key={s.id} className="cursor-pointer" onClick={() => open(s.id)}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <FileCode className="h-4 w-4 shrink-0 text-primary" />
                      <span className="font-semibold text-ink">{s.name}</span>
                    </div>
                  </Td>
                  {isAll && (
                    <Td>
                      <Badge tone="neutral">{s.endpointName}</Badge>
                    </Td>
                  )}
                  <Td>
                    <Badge tone={statusTone[s.status]}>{t(`stacks.${s.status === 'unknown' ? 'stopped' : s.status}`)}</Badge>
                  </Td>
                  <Td className="text-right">
                    <span className="font-mono text-ink tabular">{s.running}</span>
                    <span className="text-faint">/{s.services}</span>
                  </Td>
                  <Td>
                    <span className="font-mono text-[12px] text-muted">{s.path}</span>
                  </Td>
                  <Td className="text-right">
                    <span className="text-muted">{s.updatedAt ? relativeTime(s.updatedAt) : '—'}</span>
                  </Td>
                  {isAdmin && (
                    <Td className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <RowAction title={t('stacks.stop')} onClick={() => void runAction(s, 'stop')} disabled={mut.action.isPending}>
                          <Square className="h-4 w-4" />
                        </RowAction>
                        <RowAction title={t('stacks.restart')} onClick={() => void runAction(s, 'restart')} disabled={mut.action.isPending}>
                          <RotateCw className="h-4 w-4" />
                        </RowAction>
                        <StackRowMenu stack={s} onAction={runAction} />
                      </div>
                    </Td>
                  )}
                </Tr>
              ))}
            </tbody>
          </ResizableTable>
          <Pagination pg={pg} />
            </>
          )}
        </>
      )}

      <NewStackDialog open={creating} onClose={() => setCreating(false)} onCreated={open} />
      <GitStackDialog open={gitOpen} onClose={() => setGitOpen(false)} />
      <ConfirmDialog {...dialogProps} loading={mut.action.isPending} />
    </Page>
  );
}

function RowAction({
  children,
  title,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function StackRowMenu({ stack, onAction }: { stack: StackSummary; onAction: (s: StackSummary, a: StackActionName) => void }) {
  const { t } = useTranslation();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink">
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-[180px] rounded-lg border border-border bg-surface p-1.5"
          style={{ boxShadow: 'var(--w-shadow-lg)' }}
        >
          <MenuItem onSelect={() => onAction(stack, 'start')} icon={<Play className="h-4 w-4" />}>
            {t('stacks.start')}
          </MenuItem>
          <MenuItem onSelect={() => onAction(stack, 'pause')} icon={<Pause className="h-4 w-4" />}>
            {t('stacks.pause')}
          </MenuItem>
          <MenuItem onSelect={() => onAction(stack, 'unpause')} icon={<Play className="h-4 w-4" />}>
            {t('stacks.unpause')}
          </MenuItem>
          <MenuItem danger onSelect={() => onAction(stack, 'kill')} icon={<Zap className="h-4 w-4" />}>
            {t('stacks.kill')}
          </MenuItem>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MenuItem({
  children,
  icon,
  onSelect,
  danger,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] outline-none',
        danger ? 'text-danger data-[highlighted]:bg-danger-soft' : 'text-ink data-[highlighted]:bg-surface-hover',
      )}
    >
      {icon}
      {children}
    </DropdownMenu.Item>
  );
}

/* ── Detail: Datei-Browser + Editor + Container-Übersicht ──────────────────── */
export function StackDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/stacks/$id' });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { setSelected } = useEndpoints();
  const { isAdmin } = useAuth();
  const mut = useStackMutations();
  const { confirm, dialogProps } = useConfirm();
  const { data: stack, isLoading } = useStack(id);
  const [cwd, setCwd] = useState('');
  const { data: dirFiles } = useStackDir(id, cwd);
  const files = dirFiles ?? [];
  const updates = useUpdateFlags();
  const [selected, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [addingFile, setAddingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [deployLog, setDeployLog] = useState<DeployLog | null>(null);

  const back = () => void navigate({ to: '/stacks' });
  const joinRel = (base: string, name: string): string => (base ? `${base}/${name}` : name);

  const newFileValid =
    /^\.?[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(newFileName) && !['.', '..'].includes(newFileName);

  const createFile = async (): Promise<void> => {
    const f = newFileName.trim();
    if (!newFileValid) return;
    if (files.some((x) => x.name === f)) {
      toast.error(t('stacks.fileExists'));
      return;
    }
    const rel = joinRel(cwd, f);
    try {
      await mut.saveFile.mutateAsync({ id, file: rel, content: '' });
      setAddingFile(false);
      setNewFileName('');
      setSel(rel);
      setDraft('');
      setDirty(false);
      toast.success(t('common.create'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  };

  // Standardmäßig die Compose-Datei öffnen.
  useEffect(() => {
    if (stack && selected === null) setSel(stack.composeFile);
  }, [stack, selected]);

  const { data: fileContent } = useStackFile(id, selected);
  useEffect(() => {
    if (fileContent !== undefined) {
      setDraft(fileContent);
      setDirty(false);
    }
  }, [fileContent, selected]);

  const saveFile = async (): Promise<boolean> => {
    if (!selected) return false;
    try {
      await mut.saveFile.mutateAsync({ id, file: selected, content: draft });
      toast.success(t('common.save'));
      setDirty(false);
      return true;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
      return false;
    }
  };

  // Live-Streaming der `docker compose`-Ausgabe über WebSocket (Terminal-Ansicht).
  const streamOp = (title: string, op: string): void => {
    setDeployLog({ title, text: '', error: false, running: true });
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/api/stacks/${id}/deploy/stream?op=${op}`);
    let buf = '';
    ws.onmessage = (e) => {
      let msg: { type: string; data?: string; code?: number; message?: string };
      try {
        msg = JSON.parse(typeof e.data === 'string' ? e.data : '');
      } catch {
        return;
      }
      if (msg.type === 'data') {
        buf += msg.data ?? '';
        setDeployLog((l) => (l && l.running ? { ...l, text: buf } : l));
      } else if (msg.type === 'end') {
        setDeployLog((l) => (l ? { ...l, running: false, error: msg.code !== 0, text: buf || t('stacks.opDone') } : l));
        void qc.invalidateQueries({ queryKey: ['stack', id] });
        void qc.invalidateQueries({ queryKey: ['stacks'] });
        ws.close();
      } else if (msg.type === 'error') {
        setDeployLog((l) => (l ? { ...l, running: false, error: true, text: (buf ? `${buf}\n` : '') + (msg.message ?? '') } : l));
        ws.close();
      }
    };
    ws.onerror = () => setDeployLog((l) => (l && l.running ? { ...l, running: false, error: true, text: `${buf}\n[${t('common.error')}]` } : l));
  };

  const deploy = async (): Promise<void> => {
    if (dirty && !(await saveFile())) return;
    streamOp(t('stacks.redeploy'), 'up');
  };

  const down = async (): Promise<void> => {
    const ok = await confirm({ title: t('stacks.down'), description: t('stacks.downConfirm', { name: stack?.name }), danger: true, confirmLabel: t('stacks.down') });
    if (!ok) return;
    streamOp(t('stacks.down'), 'down');
  };

  const runAction = (action: StackActionName): void => streamOp(t(`stacks.${action}`), action);
  const opRunning = !!deployLog?.running;

  const removeStack = async (): Promise<void> => {
    const ok = await confirm({ title: t('common.delete'), description: t('stacks.deleteConfirm', { name: stack?.name }), danger: true, confirmLabel: t('common.delete'), confirmText: stack?.name });
    if (!ok) return;
    try {
      await mut.remove.mutateAsync(id);
      toast.success(t('common.delete'));
      back();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  };

  const removeEntry = async (rel: string, isDir: boolean): Promise<void> => {
    const name = rel.split('/').pop() ?? rel;
    const ok = await confirm({
      title: t('common.delete'),
      description: isDir ? t('stacks.deleteFolderConfirm', { name }) : t('stacks.deleteFileConfirm', { name }),
      danger: true,
      confirmLabel: t('common.delete'),
      confirmText: isDir ? name : undefined, // Ordner: Name tippen (rekursives Löschen absichern)
    });
    if (!ok) return;
    try {
      await mut.deleteFile.mutateAsync({ id, file: rel });
      // Gelöschte Datei/Ordner aus Auswahl bzw. aktuellem Pfad entfernen.
      if (selected === rel || (selected && selected.startsWith(`${rel}/`))) setSel(stack?.composeFile ?? null);
      if (cwd === rel || cwd.startsWith(`${rel}/`)) setCwd(rel.split('/').slice(0, -1).join('/'));
      toast.success(t('common.delete'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  };

  if (isLoading || !stack) {
    return (
      <Page>
        <BackButton onClick={back} />
        <LoadingState />
      </Page>
    );
  }

  return (
    <Page>
      <BackButton onClick={back} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-2xl font-bold tracking-tight text-ink" style={{ fontFamily: 'var(--font-display)' }}>
            {stack.name}
          </h1>
          <Badge tone="neutral">{stack.endpointName}</Badge>
          <Badge tone={statusTone[stack.status]}>{t(`stacks.${stack.status === 'unknown' ? 'stopped' : stack.status}`)}</Badge>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void saveFile()} loading={mut.saveFile.isPending} disabled={!dirty || opRunning}>
              <Save className="h-4 w-4" /> {t('common.save')}
            </Button>
            <div className="mx-1 h-6 w-px bg-border" />
            <Button variant="subtle" size="sm" onClick={() => runAction('start')} disabled={opRunning}>
              <Play className="h-4 w-4" /> {t('stacks.start')}
            </Button>
            <Button variant="subtle" size="sm" onClick={() => runAction('stop')} disabled={opRunning}>
              <Square className="h-4 w-4" /> {t('stacks.stop')}
            </Button>
            <Button variant="subtle" size="sm" onClick={() => runAction('restart')} disabled={opRunning}>
              <RotateCw className="h-4 w-4" /> {t('stacks.restart')}
            </Button>
            <div className="mx-1 h-6 w-px bg-border" />
            <Button variant="subtle" size="sm" onClick={() => void down()} disabled={opRunning}>
              <Power className="h-4 w-4" /> {t('stacks.down')}
            </Button>
            <Button variant="primary" size="sm" onClick={() => void deploy()} loading={opRunning} disabled={opRunning}>
              <Ship className="h-4 w-4" /> {t('stacks.redeploy')}
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        {/* Datei-Browser */}
        <Card className="h-max overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border bg-surface-2 px-3 py-2">
            <span className="eyebrow">{t('stacks.files')}</span>
            {isAdmin && (
              <button onClick={() => void removeStack()} className="inline-flex items-center gap-1 text-xs text-danger hover:underline">
                <Trash2 className="h-3.5 w-3.5" /> {t('stacks.deleteStack')}
              </button>
            )}
          </div>
          {cwd && (
            <div className="flex flex-wrap items-center gap-x-1 border-b border-border px-3 py-1.5 text-[11px]">
              <button onClick={() => setCwd('')} className="font-mono text-muted hover:text-ink">
                {stack.name}
              </button>
              {cwd.split('/').map((seg, i, arr) => (
                <span key={i} className="flex items-center gap-x-1">
                  <span className="text-faint">/</span>
                  <button
                    onClick={() => setCwd(arr.slice(0, i + 1).join('/'))}
                    className="max-w-[120px] truncate font-mono text-muted hover:text-ink"
                  >
                    {seg}
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="max-h-[60vh] overflow-y-auto p-1.5">
            {cwd && (
              <div
                onClick={() => setCwd(cwd.split('/').slice(0, -1).join('/'))}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-surface-hover"
              >
                <Folder className="h-4 w-4 shrink-0" />
                <span className="font-mono">..</span>
              </div>
            )}
            {files.map((f) => {
              const rel = joinRel(cwd, f.name);
              return (
                <div
                  key={f.name}
                  className={cn(
                    'group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px]',
                    selected === rel ? 'bg-primary-soft text-primary' : 'text-ink hover:bg-surface-hover',
                  )}
                  onClick={() => (f.isDir ? setCwd(rel) : setSel(rel))}
                >
                  {f.isDir ? (
                    <Folder className="h-4 w-4 shrink-0 text-signal" />
                  ) : f.isCompose ? (
                    <FileCode className="h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <File className="h-4 w-4 shrink-0 text-faint" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-mono">{f.name}</span>
                  {!f.isDir && <span className="shrink-0 text-[10px] text-faint tabular">{formatBytes(f.size)}</span>}
                  {isAdmin && !f.isCompose && (
                    <button
                      onClick={(e) => { e.stopPropagation(); void removeEntry(rel, f.isDir); }}
                      className="shrink-0 text-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                      title={f.isDir ? t('stacks.deleteFolder') : t('common.delete')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {/* Neue Datei anlegen */}
          {isAdmin && (
            <div className="border-t border-border p-1.5">
              {addingFile ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    autoFocus
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void createFile();
                      if (e.key === 'Escape') { setAddingFile(false); setNewFileName(''); }
                    }}
                    placeholder=".env"
                    className="h-8 font-mono text-[12px]"
                  />
                  <Button variant="primary" size="icon-sm" onClick={() => void createFile()} disabled={!newFileValid} title={t('common.create')}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => { setAddingFile(false); setNewFileName(''); }} title={t('common.cancel')}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingFile(true)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted transition-colors hover:bg-surface-hover hover:text-ink"
                >
                  <Plus className="h-4 w-4" /> {t('stacks.newFile')}
                </button>
              )}
            </div>
          )}
        </Card>

        {/* Editor */}
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border bg-surface-2 px-3 py-2">
            <span className="font-mono text-[12px] text-muted">{selected ?? '—'}</span>
            {dirty && <span className="text-[11px] text-signal">●</span>}
          </div>
          <Textarea
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
            readOnly={!isAdmin}
            spellCheck={false}
            rows={22}
            className="min-h-[60vh] rounded-none border-0 text-[12.5px] leading-relaxed focus-visible:outline-0"
          />
        </Card>
      </div>

      {/* Container-Übersicht (unterhalb von Datei-Browser + Editor) */}
      <div className="mt-6">
        <span className="eyebrow">{t('stacks.containers')}</span>
        {stack.containers.length === 0 ? (
          <Card className="mt-2 px-4 py-3 text-sm text-muted">{t('stacks.noContainers')}</Card>
        ) : (
          <div className="mt-2">
            <TableWrap>
              <THead>
                <Th>{t('stacks.service')}</Th>
                <Th>{t('containers.columns.name')}</Th>
                <Th>{t('containers.columns.image')}</Th>
                <Th>{t('containers.columns.status')}</Th>
              </THead>
              <tbody>
                {stack.containers.map((c) => (
                  <Tr key={c.id}>
                    <Td>
                      <span className="font-medium text-ink">{c.service || '—'}</span>
                    </Td>
                    <Td>
                      <Link
                        to="/containers/$id"
                        params={{ id: c.id }}
                        onClick={() => setSelected(stack.endpoint)}
                        className="flex items-center gap-2 hover:text-primary"
                      >
                        <StatusDot tone={stateTone(c.state)} pulse={c.state === 'running'} />
                        <span className="text-ink">{c.name || shortId(c.id)}</span>
                      </Link>
                    </Td>
                    <Td>
                      <span className="font-mono text-[12px] text-muted">{c.image}</span>
                      {updates.has(stack.endpoint, c.image) && (
                        <Badge tone="signal" className="ml-2 align-middle" title={t('updates.statusUpdate')}>
                          <ArrowUpCircle className="h-3.5 w-3.5" /> {t('updates.statusUpdate')}
                        </Badge>
                      )}
                    </Td>
                    <Td>
                      <span className="text-[13px] text-muted tabular">{c.status}</span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        )}
      </div>

      <ConfirmDialog {...dialogProps} loading={mut.deploy.isPending || mut.down.isPending || mut.remove.isPending || mut.deleteFile.isPending} />
      <DeployOutputModal log={deployLog} onClose={() => setDeployLog(null)} />
    </Page>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button onClick={onClick} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink">
      <ArrowLeft className="h-4 w-4" /> {t('stacks.title')}
    </button>
  );
}

/* ── Neuer Stack ───────────────────────────────────────────────────────────── */
/** Übersicht der aus Git verwalteten Stacks mit Sync/Entfernen-Aktionen. */
function GitStacksSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['gitops'],
    queryFn: () => api.get<{ stacks: GitStack[] }>('/api/gitops'),
    select: (d) => d.stacks,
  });
  const stacks = data ?? [];

  const sync = useMutation({
    mutationFn: (id: number) => api.post<{ stack: GitStack }>(`/api/gitops/${id}/sync`, {}),
    onSuccess: (res) => {
      if (res.stack.lastStatus === 'error') toast.error(res.stack.lastDetail ?? t('common.error'));
      else toast.success(res.stack.lastDetail ?? t('gitops.synced'));
      void qc.invalidateQueries({ queryKey: ['gitops'] });
      void qc.invalidateQueries({ queryKey: ['stacks'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('common.error')),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/api/gitops/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['gitops'] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('common.error')),
  });

  if (stacks.length === 0) return null;

  return (
    <Card className="mb-4 p-4">
      <div className="mb-2 flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-ink">{t('gitops.title')}</h2>
      </div>
      <div className="divide-y divide-border">
        {stacks.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-3 py-2">
            <div className="min-w-[160px] flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-ink">{s.name}</span>
                {s.autoSync && <Badge tone="primary">{t('gitops.autoSync')}</Badge>}
                {s.lastCommit && <span className="font-mono text-[11px] text-faint">{s.lastCommit}</span>}
              </div>
              <div className="truncate font-mono text-[11px] text-muted">{s.repoUrl}</div>
              {s.lastSync && (
                <div className="text-[11px]">
                  <span className="text-faint">{t('gitops.lastSync', { when: relativeTime(s.lastSync) })}</span>{' '}
                  <span className={s.lastStatus === 'error' ? 'text-danger' : 'text-run'}>{s.lastDetail}</span>
                </div>
              )}
            </div>
            <Button variant="secondary" size="sm" onClick={() => sync.mutate(s.id)} loading={sync.isPending && sync.variables === s.id}>
              <RotateCw className="h-3.5 w-3.5" /> {t('gitops.sync')}
            </Button>
            <button
              title={t('gitops.unlink')}
              onClick={() => remove.mutate(s.id)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function NewStackDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { endpoints, selected: selectedEp } = useEndpoints();
  const mut = useStackMutations();
  const withPaths = endpoints.filter((e) => e.stackPaths.length > 0);
  const [endpoint, setEndpoint] = useState('');
  const [basePath, setBasePath] = useState('');
  const [name, setName] = useState('');
  const [content, setContent] = useState(TEMPLATE);
  const [runCmd, setRunCmd] = useState('');

  useEffect(() => {
    if (!open) return;
    const preferred = withPaths.find((e) => e.id === selectedEp) ?? withPaths[0];
    if (preferred) {
      setEndpoint(preferred.id);
      setBasePath(preferred.stackPaths[0] ?? '');
    }
    setName('');
    setContent(TEMPLATE);
    setRunCmd('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedEndpoint = endpoints.find((e) => e.id === endpoint);
  const paths = selectedEndpoint?.stackPaths ?? [];
  const isRemote = selectedEndpoint && selectedEndpoint.type !== 'socket';
  const nameValid = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name);

  const convertRun = (): void => {
    if (!runCmd.trim()) return;
    const { yaml, serviceName, warnings } = runToCompose(runCmd);
    setContent(yaml);
    if (!name.trim()) setName(serviceName);
    if (warnings.length) warnings.forEach((w) => toast.info(w));
    else toast.success(t('stacks.converted'));
  };

  const submit = async (): Promise<void> => {
    try {
      const res = await mut.create.mutateAsync({ endpoint, basePath, name, content });
      toast.success(t('common.create'));
      onClose();
      if (res.stack) onCreated(res.stack.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose} className="max-w-xl">
        <DialogTitle>{t('stacks.new')}</DialogTitle>
        <div className="mt-4 space-y-3">
          {/* docker run → compose */}
          <div className="rounded-lg border border-dashed border-border bg-surface-2 p-3">
            <Label>{t('stacks.fromRun')}</Label>
            <p className="mb-2 text-[12px] text-muted">{t('stacks.fromRunHint')}</p>
            <Textarea
              value={runCmd}
              onChange={(e) => setRunCmd(e.target.value)}
              rows={3}
              spellCheck={false}
              placeholder="docker run -d --name web -p 8080:80 -v data:/data nginx:alpine"
              className="font-mono text-[12px]"
            />
            <div className="mt-2 flex justify-end">
              <Button variant="secondary" size="sm" onClick={convertRun} disabled={!runCmd.trim()}>
                <FileCode className="h-4 w-4" /> {t('stacks.convert')}
              </Button>
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
          {isRemote && (
            <p className="flex items-start gap-1.5 text-[12px] text-muted">
              <Server className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t('stacks.remoteFsHint')}
            </p>
          )}
          <div>
            <Label>{t('stacks.stackName')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="font-mono" placeholder="mein-projekt" />
          </div>
          <div>
            <Label>{t('stacks.composeContent')}</Label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={10} spellCheck={false} className="text-[12px]" />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => void submit()} loading={mut.create.isPending} disabled={!endpoint || !basePath || !nameValid || !content.trim()}>
            {t('common.create')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

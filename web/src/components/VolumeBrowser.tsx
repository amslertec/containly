import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  Download,
  File as FileIcon,
  Folder,
  HardDrive,
  Home,
  Trash2,
  Upload,
} from 'lucide-react';
import type { VolumeListing } from '@containly/shared';
import { Dialog, DialogContent, DialogTitle } from './ui/Dialog';
import { Button } from './ui/Button';
import { LoadingState, EmptyState } from './States';
import { ConfirmDialog } from './ConfirmDialog';
import { useConfirm } from '../hooks/useConfirm';
import { toast } from './Toaster';
import { api, ApiError } from '../lib/api';
import { formatBytes } from '../lib/utils';
import { relativeTime } from '../lib/time';
import { useAuth } from '../app/AuthContext';

/** Datei-Browser für ein Named Volume (list/navigate/download/upload/delete). */
export function VolumeBrowser({
  endpoint,
  volume,
  onClose,
}: {
  endpoint: string;
  volume: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { confirm, dialogProps } = useConfirm();
  const [path, setPath] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const key = ['volume-browse', endpoint, volume, path];
  const { data, isLoading, isError, error } = useQuery({
    queryKey: key,
    queryFn: () =>
      api.get<VolumeListing>(
        `/api/volumes/browse?endpoint=${encodeURIComponent(endpoint)}&volume=${encodeURIComponent(volume)}&path=${encodeURIComponent(path)}`,
      ),
  });
  const reload = (): void => void qc.invalidateQueries({ queryKey: key });

  const join = (name: string): string => (path ? `${path}/${name}` : name);

  const download = (name: string): void => {
    const url = `/api/volumes/download?endpoint=${encodeURIComponent(endpoint)}&volume=${encodeURIComponent(volume)}&path=${encodeURIComponent(join(name))}`;
    // Same-origin GET → Session-Cookie wird automatisch mitgesendet.
    window.open(url, '_blank');
  };

  const del = useMutation({
    mutationFn: (name: string) =>
      api.delete(
        `/api/volumes/file?endpoint=${encodeURIComponent(endpoint)}&volume=${encodeURIComponent(volume)}&path=${encodeURIComponent(join(name))}`,
      ),
    onSuccess: () => {
      toast.success(t('common.remove'));
      reload();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('common.error')),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const base64 = await fileToBase64(file);
      return api.post('/api/volumes/upload', {
        endpoint,
        volume,
        path: join(file.name),
        contentBase64: base64,
      });
    },
    onSuccess: () => {
      toast.success(t('volbrowse.uploaded'));
      reload();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('common.error')),
  });

  const askDelete = async (name: string, isDir: boolean): Promise<void> => {
    const ok = await confirm({
      title: t('common.remove'),
      description: t('volbrowse.deleteConfirm', { name, kind: isDir ? t('volbrowse.folder') : t('volbrowse.file') }),
      danger: true,
      confirmLabel: t('common.remove'),
    });
    if (ok) del.mutate(name);
  };

  const segments = path ? path.split('/') : [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose} className="max-w-3xl">
        <DialogTitle>
          <span className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate font-mono text-[15px]" title={volume}>{volume}</span>
          </span>
        </DialogTitle>

        {/* Breadcrumb */}
        <div className="mt-3 flex flex-wrap items-center gap-1 text-[12.5px]">
          <button onClick={() => setPath('')} className="inline-flex items-center gap-1 text-muted hover:text-ink">
            <Home className="h-3.5 w-3.5" />
          </button>
          {segments.map((seg, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-faint" />
              <button
                onClick={() => setPath(segments.slice(0, i + 1).join('/'))}
                className="font-mono text-muted hover:text-ink"
              >
                {seg}
              </button>
            </span>
          ))}
          <div className="flex-1" />
          {isAdmin && (
            <>
              <input
                ref={fileInput}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload.mutate(f);
                  e.target.value = '';
                }}
              />
              <Button variant="subtle" size="sm" onClick={() => fileInput.current?.click()} loading={upload.isPending}>
                <Upload className="h-3.5 w-3.5" /> {t('volbrowse.upload')}
              </Button>
            </>
          )}
        </div>

        <div className="mt-3 max-h-[55vh] overflow-y-auto rounded-lg border border-border">
          {isLoading ? (
            <LoadingState />
          ) : isError ? (
            <div className="px-3 py-6 text-center text-sm text-danger">
              {error instanceof Error ? error.message : t('common.error')}
            </div>
          ) : !data || data.entries.length === 0 ? (
            <EmptyState title={t('volbrowse.empty')} />
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {data.entries.map((entry) => (
                  <tr key={entry.name} className="group border-b border-border last:border-0 hover:bg-surface-hover">
                    <td className="py-2 pl-3 pr-2">
                      {entry.isDir ? (
                        <button
                          onClick={() => setPath(join(entry.name))}
                          className="inline-flex items-center gap-2 text-left font-medium text-ink hover:text-primary"
                        >
                          <Folder className="h-4 w-4 shrink-0 text-primary" />
                          <span className="break-all">{entry.name}</span>
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <FileIcon className="h-4 w-4 shrink-0 text-faint" />
                          <span className="break-all text-ink">{entry.name}</span>
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-2 text-right text-[11px] text-faint tabular">
                      {entry.isDir ? '—' : formatBytes(entry.size)}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-2 text-[11px] text-faint">
                      {entry.mtime ? relativeTime(new Date(entry.mtime * 1000).toISOString()) : ''}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {!entry.isDir && (
                          <button
                            title={t('volbrowse.download')}
                            onClick={() => download(entry.name)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            title={t('common.remove')}
                            onClick={() => void askDelete(entry.name, entry.isDir)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-danger-soft hover:text-danger"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <ConfirmDialog {...dialogProps} />
      </DialogContent>
    </Dialog>
  );
}

/** Liest eine Datei als base64 (ohne data:-Präfix). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      resolve(res.slice(res.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('read error'));
    reader.readAsDataURL(file);
  });
}

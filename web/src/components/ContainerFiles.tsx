import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Download, File as FileIcon, Folder, Home, Trash2, Upload } from 'lucide-react';
import type { VolumeListing } from '@containly/shared';
import { useAuth } from '../app/AuthContext';
import { useConfirm } from '../hooks/useConfirm';
import { ConfirmDialog } from './ConfirmDialog';
import { Card } from './ui/primitives';
import { LoadingState, ErrorState } from './States';
import { toast } from './Toaster';
import { api, ApiError } from '../lib/api';
import { formatBytes } from '../lib/utils';

/**
 * Datei-Browser für einen laufenden Container (über die Docker-API). Navigieren,
 * herunterladen, hochladen, löschen — wie der Volume-Browser, aber im Container.
 */
export function ContainerFiles({
  endpoint,
  id,
  running,
}: {
  endpoint: string;
  id: string;
  running: boolean;
}) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { confirm, dialogProps } = useConfirm();
  const [path, setPath] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError, error } = useQuery({
    // Datei-Zugriff braucht exec → nur bei laufendem Container.
    enabled: running,
    queryKey: ['cfiles', endpoint, id, path],
    queryFn: () =>
      api.get<VolumeListing>(
        `/api/containers/${encodeURIComponent(id)}/files?endpoint=${encodeURIComponent(endpoint)}&path=${encodeURIComponent(path)}`,
      ),
  });

  if (!running) {
    return (
      <Card className="flex h-full items-center justify-center p-8">
        <p className="text-center text-sm text-faint">{t('cfiles.notRunning')}</p>
      </Card>
    );
  }

  const join = (name: string): string => (path ? `${path}/${name}` : name);
  const invalidate = (): void => void qc.invalidateQueries({ queryKey: ['cfiles', endpoint, id] });

  const download = (name: string): void => {
    const url = `/api/containers/${encodeURIComponent(id)}/files/download?endpoint=${encodeURIComponent(endpoint)}&path=${encodeURIComponent(join(name))}`;
    window.open(url, '_blank');
  };

  const remove = async (name: string, isDir: boolean): Promise<void> => {
    const ok = await confirm({
      title: t('common.remove'),
      description: t('volbrowse.deleteConfirm', { name, kind: isDir ? t('volbrowse.folder') : t('volbrowse.file') }),
      danger: true,
      confirmLabel: t('common.remove'),
    });
    if (!ok) return;
    try {
      await api.delete(`/api/containers/${encodeURIComponent(id)}/files?endpoint=${encodeURIComponent(endpoint)}&path=${encodeURIComponent(join(name))}`);
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  };

  const upload = async (file: File): Promise<void> => {
    const buf = await file.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    try {
      await api.post(`/api/containers/${encodeURIComponent(id)}/files/upload`, {
        endpoint,
        path: join(file.name),
        contentBase64: b64,
      });
      toast.success(t('volbrowse.uploaded'));
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  };

  const crumbs = path ? path.split('/') : [];

  return (
    <Card className="flex h-full flex-col p-0">
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2 text-[12.5px]">
        <button onClick={() => setPath('')} className="inline-flex items-center gap-1 text-muted hover:text-ink">
          <Home className="h-3.5 w-3.5" />
        </button>
        {crumbs.map((c, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-faint" />
            <button onClick={() => setPath(crumbs.slice(0, i + 1).join('/'))} className="text-muted hover:text-ink">{c}</button>
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
                if (f) void upload(f);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => fileInput.current?.click()}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted hover:bg-surface-2 hover:text-ink"
            >
              <Upload className="h-3.5 w-3.5" /> {t('volbrowse.upload')}
            </button>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={error instanceof Error ? error.message : undefined} />
        ) : (data?.entries.length ?? 0) === 0 ? (
          <p className="py-8 text-center text-sm text-faint">{t('volbrowse.empty')}</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {data!.entries.map((e) => (
                <tr key={e.name} className="group border-b border-border last:border-0 hover:bg-surface-hover">
                  <td className="py-2 pl-3">
                    {e.isDir ? (
                      <button onClick={() => setPath(join(e.name))} className="flex items-center gap-2 text-ink">
                        <Folder className="h-4 w-4 text-primary" /> {e.name}
                      </button>
                    ) : (
                      <span className="flex items-center gap-2 text-ink">
                        <FileIcon className="h-4 w-4 text-faint" /> {e.name}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-2 text-right font-mono text-[11px] text-faint">{e.isDir ? '' : formatBytes(e.size)}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100">
                      {!e.isDir && (
                        <button onClick={() => download(e.name)} title={t('volbrowse.download')} className="text-muted hover:text-ink">
                          <Download className="h-4 w-4" />
                        </button>
                      )}
                      {isAdmin && (
                        <button onClick={() => void remove(e.name, e.isDir)} title={t('common.remove')} className="text-muted hover:text-danger">
                          <Trash2 className="h-4 w-4" />
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
    </Card>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, ShieldAlert, TriangleAlert, Info } from 'lucide-react';
import type { FeedResponse } from '@containly/shared';
import { api } from '../lib/api';
import { relativeTime } from '../lib/time';
import { cn } from '../lib/utils';

const SEV_ICON = {
  critical: { Icon: ShieldAlert, cls: 'text-danger' },
  warning: { Icon: TriangleAlert, cls: 'text-warn' },
  info: { Icon: Info, cls: 'text-primary' },
} as const;

/** i18n-sicherer Key aus einem Typ mit Punkt (endpoint.offline → endpoint_offline). */
const tkey = (type: string): string => type.replace('.', '_');

/**
 * Glocken-Icon mit Ungelesen-Zähler + Dropdown der letzten Ereignisse. Zeigt den
 * In-App-Feed (vom Monitor gefüllt) — funktioniert auch ohne SMTP. Pollt moderat.
 */
export function NotificationBell({ className }: { className?: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['feed'],
    queryFn: () => api.get<FeedResponse>('/api/notifications/feed'),
    refetchInterval: 20_000,
  });
  const unread = data?.unread ?? 0;
  const items = data?.items ?? [];

  useEffect(() => {
    const h = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const markRead = (): void => {
    void api.post('/api/notifications/feed/read', {}).finally(() => void qc.invalidateQueries({ queryKey: ['feed'] }));
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open && unread > 0) markRead();
        }}
        title={t('feed.title')}
        className={cn(
          'relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-ink',
          className,
        )}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 max-h-[70vh] w-80 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-[13px] font-semibold text-ink">{t('feed.title')}</span>
            {items.length > 0 && (
              <button onClick={markRead} className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-ink">
                <CheckCheck className="h-3.5 w-3.5" /> {t('feed.markRead')}
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-muted">{t('feed.empty')}</div>
            ) : (
              items.map((it) => {
                const { Icon, cls } = SEV_ICON[it.severity];
                return (
                  <div
                    key={it.id}
                    className="flex items-start gap-2.5 border-b border-border px-3 py-2.5 last:border-0"
                  >
                    <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', cls)} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-ink">{t(`notifications.types.${tkey(it.type)}.label`)}</span>
                      {(it.target || it.detail) && (
                        <span className="block break-all font-mono text-[11px] text-muted">
                          {[it.target, it.detail].filter(Boolean).join(' · ')}
                        </span>
                      )}
                      <span className="block text-[10.5px] text-faint">{relativeTime(new Date(it.createdAt).toISOString())}</span>
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

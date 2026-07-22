import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  ArrowUpCircle,
  Boxes,
  CornerDownLeft,
  HardDrive,
  Layers,
  Network,
  Search,
  Server,
  Settings,
  Ship,
  UserRound,
  Users,
} from 'lucide-react';
import type { ContainerSummary, ImageSummary } from '@containly/shared';
import { useEndpoints } from '../app/EndpointContext';
import { useAuth } from '../app/AuthContext';
import { useScopedList } from '../hooks/useScopedList';
import { StatusDot, stateTone } from './StatusDot';
import { shortId, cn } from '../lib/utils';

interface Command {
  key: string;
  group: string;
  label: string;
  sub?: string;
  icon: React.ReactNode;
  run: () => void;
}

/**
 * Globale Befehls-/Sprungsuche (Cmd/Ctrl+K). Durchsucht Navigation, Endpoints,
 * Container und Images des aktuellen Scopes und springt per Tastatur dorthin.
 * Wird nur gemountet, während sie offen ist (kein Dauer-Polling).
 */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { endpoints, selected, setSelected } = useEndpoints();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const containers = useScopedList<ContainerSummary, { containers: ContainerSummary[] }>(
    'containers',
    (d) => d.containers,
    30_000,
  );
  const images = useScopedList<ImageSummary, { images: ImageSummary[] }>('images', (d) => d.images, 30_000);

  const go = (to: string, params?: Record<string, string>, endpointId?: string): void => {
    if (endpointId) setSelected(endpointId);
    void navigate(params ? { to, params } : { to });
    onClose();
  };

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = [
      { key: 'nav:/', group: t('cmdk.pages'), label: t('nav.dashboard'), icon: <Boxes className="h-4 w-4" />, run: () => go('/') },
      { key: 'nav:/containers', group: t('cmdk.pages'), label: t('nav.containers'), icon: <Boxes className="h-4 w-4" />, run: () => go('/containers') },
      { key: 'nav:/images', group: t('cmdk.pages'), label: t('nav.images'), icon: <Layers className="h-4 w-4" />, run: () => go('/images') },
      { key: 'nav:/volumes', group: t('cmdk.pages'), label: t('nav.volumes'), icon: <HardDrive className="h-4 w-4" />, run: () => go('/volumes') },
      { key: 'nav:/networks', group: t('cmdk.pages'), label: t('nav.networks'), icon: <Network className="h-4 w-4" />, run: () => go('/networks') },
      { key: 'nav:/stacks', group: t('cmdk.pages'), label: t('nav.stacks'), icon: <Ship className="h-4 w-4" />, run: () => go('/stacks') },
      { key: 'nav:/updates', group: t('cmdk.pages'), label: t('nav.updates'), icon: <ArrowUpCircle className="h-4 w-4" />, run: () => go('/updates') },
      { key: 'nav:/settings', group: t('cmdk.pages'), label: t('nav.settings'), icon: <Settings className="h-4 w-4" />, run: () => go('/settings') },
      { key: 'nav:/profile', group: t('cmdk.pages'), label: t('nav.profile'), icon: <UserRound className="h-4 w-4" />, run: () => go('/profile') },
    ];
    if (isAdmin) {
      nav.push(
        { key: 'nav:/endpoints', group: t('cmdk.pages'), label: t('nav.endpoints'), icon: <Server className="h-4 w-4" />, run: () => go('/endpoints') },
        { key: 'nav:/users', group: t('cmdk.pages'), label: t('nav.users'), icon: <Users className="h-4 w-4" />, run: () => go('/users') },
      );
    }
    const eps: Command[] = endpoints.map((e) => ({
      key: `ep:${e.id}`,
      group: t('cmdk.endpoints'),
      label: e.name,
      sub: e.id === selected ? t('cmdk.current') : undefined,
      icon: <Server className="h-4 w-4" />,
      run: () => go('/containers', undefined, e.id),
    }));
    const cs: Command[] = containers.data.map((c) => ({
      key: `c:${c._endpointId}:${c.id}`,
      group: t('cmdk.containers'),
      label: c.names[0] ?? shortId(c.id),
      sub: `${c.image}${endpoints.length > 1 ? ` · ${c._endpointName}` : ''}`,
      icon: <StatusDot tone={stateTone(c.state)} pulse={c.state === 'running'} />,
      run: () => go('/containers/$id', { id: c.id }, c._endpointId),
    }));
    const seen = new Set<string>();
    const imgs: Command[] = [];
    for (const img of images.data) {
      const tag = img.repoTags[0];
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      imgs.push({
        key: `i:${img._endpointId}:${img.id}`,
        group: t('cmdk.images'),
        label: tag,
        sub: img._endpointName,
        icon: <Layers className="h-4 w-4" />,
        run: () => go('/images', undefined, img._endpointId),
      });
    }
    return [...nav, ...eps, ...cs, ...imgs];
  }, [t, isAdmin, endpoints, selected, containers.data, images.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? commands.filter((c) => c.label.toLowerCase().includes(q) || c.sub?.toLowerCase().includes(q))
      : commands;
    return list.slice(0, 50);
  }, [commands, query]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => inputRef.current?.focus(), []);
  // Aktiven Eintrag in den sichtbaren Bereich scrollen.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      results[active]?.run();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  // Ergebnisse für die Anzeige nach Gruppe bündeln, dabei den globalen Index behalten.
  let idx = -1;
  const grouped = results.reduce<{ group: string; items: { cmd: Command; i: number }[] }[]>((acc, cmd) => {
    idx += 1;
    const last = acc[acc.length - 1];
    const entry = { cmd, i: idx };
    if (last && last.group === cmd.group) last.items.push(entry);
    else acc.push({ group: cmd.group, items: [entry] });
    return acc;
  }, []);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3.5">
          <Search className="h-4 w-4 shrink-0 text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('cmdk.placeholder')}
            className="w-full bg-transparent py-3 text-[15px] text-ink outline-none placeholder:text-faint"
          />
          <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-faint sm:block">ESC</kbd>
        </div>

        <div ref={listRef} className="overflow-y-auto py-1.5">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted">{t('cmdk.noResults')}</div>
          ) : (
            grouped.map((g) => (
              <div key={g.group} className="mb-1">
                <div className="px-3.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-faint">{g.group}</div>
                {g.items.map(({ cmd, i }) => (
                  <button
                    key={cmd.key}
                    data-idx={i}
                    onMouseMove={() => setActive(i)}
                    onClick={() => cmd.run()}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-3.5 py-2 text-left',
                      i === active ? 'bg-primary-soft' : 'hover:bg-surface-hover',
                    )}
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted">{cmd.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-ink">{cmd.label}</span>
                      {cmd.sub && <span className="block truncate font-mono text-[11px] text-faint">{cmd.sub}</span>}
                    </span>
                    {i === active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-faint" />}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Building2, Globe, Loader2, Lock, Search, Star } from 'lucide-react';
import type { ImageSearchResponse, ImageSearchResult, ImageTag } from '@containly/shared';
import { api } from '../lib/api';
import { Input } from './ui/primitives';
import { relativeTime } from '../lib/time';
import { formatBytes } from '../lib/utils';

const DEBOUNCE_MS = 220;
const MIN_CHARS = 2;

/** Kompakte Pull-Zahl: 12300000 → „12.3M". */
function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Image-Eingabefeld mit Docker-Hub-Autocomplete: zeigt beim Tippen die eigenen/
 * privaten Repos (verbundener Account) und öffentliche Treffer; nach Auswahl eines
 * Repos werden dessen Tags nachgeladen. Auf Tempo ausgelegt: debounced, laufende
 * Anfragen werden abgebrochen, das Backend cached Login/Repos/Treffer.
 */
export function ImageSearchInput({ value, onChange, onEnter, placeholder, disabled }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ImageSearchResponse>({ own: [], hub: [] });
  const [repo, setRepo] = useState<string | null>(null); // im Tag-Modus: gewähltes Repo
  const [tags, setTags] = useState<ImageTag[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced Repo-Suche (nur im Repo-Modus, also solange kein Repo gewählt ist).
  useEffect(() => {
    if (repo) return;
    const q = value.trim();
    if (q.length < MIN_CHARS) {
      setResults({ own: [], hub: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = window.setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await api.get<ImageSearchResponse>(
          `/api/registries/search?q=${encodeURIComponent(q)}`,
          ctrl.signal,
        );
        setResults(res);
      } catch {
        /* abgebrochen oder Fehler → still */
      } finally {
        if (abortRef.current === ctrl) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [value, repo]);

  // Klick außerhalb schließt das Dropdown.
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const pickRepo = async (name: string): Promise<void> => {
    onChange(name);
    setRepo(name);
    setTags([]);
    setLoading(true);
    try {
      const res = await api.get<{ tags: ImageTag[] }>(
        `/api/registries/tags?repo=${encodeURIComponent(name)}`,
      );
      setTags(res.tags);
    } catch {
      setTags([]);
    } finally {
      setLoading(false);
    }
  };

  const pickTag = (tag: string): void => {
    onChange(`${repo}:${tag}`);
    setOpen(false);
    setRepo(null);
  };

  const backToSearch = (): void => {
    setRepo(null);
    setTags([]);
  };

  const hasResults = results.own.length > 0 || results.hub.length > 0;

  return (
    <div ref={wrapRef} className="relative flex-1">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
      <Input
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          if (repo) setRepo(null); // manuelles Tippen verlässt den Tag-Modus
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            setOpen(false);
            onEnter();
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className="pl-8 font-mono"
      />

      {open && (value.trim().length >= MIN_CHARS || repo) && (
        <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-border bg-surface-1 shadow-lg">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('common.loading')}
            </div>
          )}

          {/* Tag-Modus */}
          {repo ? (
            <>
              <button
                onClick={backToSearch}
                className="flex w-full items-center gap-1.5 border-b border-border px-3 py-2 text-left text-xs text-muted hover:bg-surface-2"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span className="font-mono text-ink">{repo}</span>
                <span className="text-faint">· {t('images.search.pickTag')}</span>
              </button>
              {!loading && tags.length === 0 && (
                <div className="px-3 py-3 text-xs text-muted">{t('images.search.noTags')}</div>
              )}
              {tags.map((tg) => (
                <button
                  key={tg.name}
                  onClick={() => pickTag(tg.name)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-surface-2"
                >
                  <span className="font-mono text-[12.5px] text-ink">{tg.name}</span>
                  <span className="shrink-0 text-[11px] text-faint">
                    {tg.size != null && <span className="tabular">{formatBytes(tg.size)}</span>}
                    {tg.lastUpdated && <span> · {relativeTime(tg.lastUpdated)}</span>}
                  </span>
                </button>
              ))}
            </>
          ) : (
            <>
              {/* Repo-Modus */}
              {results.own.length > 0 && (
                <Group label={t('images.search.yourRepos')}>
                  {results.own.map((r) => (
                    <RepoRow key={r.name} r={r} onPick={() => void pickRepo(r.name)} />
                  ))}
                </Group>
              )}
              {results.hub.length > 0 && (
                <Group label={t('images.search.dockerHub')}>
                  {results.hub.map((r) => (
                    <RepoRow key={r.name} r={r} onPick={() => void pickRepo(r.name)} compactPulls />
                  ))}
                </Group>
              )}
              {!loading && !hasResults && (
                <div className="px-3 py-3 text-xs text-muted">{t('images.search.noResults')}</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="sticky top-0 bg-surface-1/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-faint backdrop-blur">
        {label}
      </div>
      {children}
    </div>
  );
}

function RepoRow({
  r,
  onPick,
  compactPulls,
}: {
  r: ImageSearchResult;
  onPick: () => void;
  compactPulls?: boolean;
}) {
  return (
    <button
      onClick={onPick}
      className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-surface-2"
    >
      <span className="mt-0.5 shrink-0 text-faint">
        {r.isPrivate ? (
          <Lock className="h-3.5 w-3.5 text-warn" />
        ) : r.official ? (
          <Building2 className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Globe className="h-3.5 w-3.5" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-mono text-[12.5px] text-ink">{r.name}</span>
          {!r.isPrivate && r.stars > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[10.5px] text-faint">
              <Star className="h-3 w-3" /> {compactPulls ? compact(r.stars) : r.stars}
            </span>
          )}
        </span>
        {r.description && <span className="block truncate text-[11px] text-muted">{r.description}</span>}
      </span>
    </button>
  );
}

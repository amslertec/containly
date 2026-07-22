import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownToLine, Download, Eraser, WrapText } from 'lucide-react';
import type { ServerLogMessage } from '@containly/shared';
import { wsUrl } from '../lib/api';
import { cn } from '../lib/utils';

interface LogLine {
  key: number;
  stream: 'stdout' | 'stderr';
  message: string;
  timestamp: string | null;
}

type ConnState = 'connecting' | 'open' | 'ended' | 'error';
const MAX_LINES = 5000;

export function LogViewer({ endpoint, id, name }: { endpoint: string; id: string; name: string }) {
  const { t } = useTranslation();
  const [lines, setLines] = useState<LogLine[]>([]);
  const [state, setState] = useState<ConnState>('connecting');
  const [follow, setFollow] = useState(true);
  const [wrap, setWrap] = useState(true);
  const [tail, setTail] = useState(400);
  const scrollRef = useRef<HTMLDivElement>(null);
  const keyRef = useRef(0);

  useEffect(() => {
    setLines([]);
    setState('connecting');
    const ws = new WebSocket(wsUrl(`/api/containers/${encodeURIComponent(id)}/logs/stream?endpoint=${encodeURIComponent(endpoint)}&tail=${tail}`));

    ws.onmessage = (ev) => {
      let msg: ServerLogMessage;
      try {
        msg = JSON.parse(ev.data as string) as ServerLogMessage;
      } catch {
        return;
      }
      if (msg.type === 'ready') setState('open');
      else if (msg.type === 'log') {
        setLines((prev) => {
          const next = prev.length >= MAX_LINES ? prev.slice(prev.length - MAX_LINES + 1) : prev;
          return [...next, { key: keyRef.current++, stream: msg.stream, message: msg.message, timestamp: msg.timestamp }];
        });
      } else if (msg.type === 'end') setState('ended');
      else if (msg.type === 'error') setState('error');
    };
    ws.onerror = () => setState('error');
    ws.onclose = () => setState((s) => (s === 'open' || s === 'connecting' ? 'ended' : s));

    return () => ws.close();
  }, [endpoint, id, tail]);

  useLayoutEffect(() => {
    if (follow && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, follow]);

  const onScroll = (): void => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom !== follow) setFollow(atBottom);
  };

  const download = (): void => {
    const text = lines.map((l) => `${l.timestamp ?? ''} ${l.message}`).join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-bg-sunken">
      <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <ConnBadge state={state} />
        <label className="ml-3 flex items-center gap-1.5 text-[11px] text-muted">
          <span className="hidden sm:inline">{t('logs.tail')}</span>
          <select
            value={tail}
            onChange={(e) => setTail(Number(e.target.value))}
            className="rounded-md border border-border bg-surface px-1.5 py-1 text-[12px] text-ink outline-none"
          >
            {[100, 400, 1000, 2000, 5000].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-1">
          <ToolBtn active={wrap} onClick={() => setWrap((w) => !w)} title={t('logs.wrap')}>
            <WrapText className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn active={follow} onClick={() => setFollow((f) => !f)} title={t('logs.follow')}>
            <ArrowDownToLine className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn onClick={() => setLines([])} title={t('logs.clear')}>
            <Eraser className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn onClick={download} title={t('logs.download')}>
            <Download className="h-4 w-4" />
          </ToolBtn>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-auto px-3 py-2 font-mono text-[12.5px] leading-relaxed"
      >
        {lines.length === 0 ? (
          <p className="py-8 text-center text-muted">{t('logs.waiting')}</p>
        ) : (
          lines.map((l) => (
            <div
              key={l.key}
              className={cn(
                'flex gap-2',
                wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre',
                l.stream === 'stderr' ? 'text-danger' : 'text-ink',
              )}
            >
              {l.timestamp && (
                <span className="shrink-0 select-none text-faint">
                  {l.timestamp.slice(11, 19)}
                </span>
              )}
              <span>{l.message}</span>
            </div>
          ))
        )}
      </div>

      {!follow && lines.length > 0 && (
        <button
          onClick={() => setFollow(true)}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted shadow"
        >
          {t('logs.follow')} ↓
        </button>
      )}
    </div>
  );
}

function ToolBtn({
  children,
  onClick,
  active,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors',
        active ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-surface-hover hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function ConnBadge({ state }: { state: ConnState }) {
  const { t } = useTranslation();
  const map = {
    connecting: { c: 'var(--w-warn)', label: t('states.reconnecting') },
    open: { c: 'var(--w-run)', label: t('logs.follow') },
    ended: { c: 'var(--w-stop)', label: t('logs.streamEnded') },
    error: { c: 'var(--w-danger)', label: t('states.connectionLost') },
  }[state];
  return (
    <span className="flex items-center gap-2 text-xs text-muted">
      <span className="h-2 w-2 rounded-full" style={{ background: map.c }} />
      {map.label}
    </span>
  );
}

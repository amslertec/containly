import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Terminal as TerminalIcon, Plug, PlugZap } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { ExecClientMessage } from '@containly/shared';
import { useAuth } from '../app/AuthContext';
import { wsUrl } from '../lib/api';
import { Card, Input } from './ui/primitives';
import { Button } from './ui/Button';
import { cn } from '../lib/utils';

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';
}

type Conn = 'idle' | 'connecting' | 'open' | 'closed';

export function ExecConsole({
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
  const [conn, setConn] = useState<Conn>('idle');
  const [shell, setShell] = useState('auto');
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
      termRef.current?.dispose();
    };
  }, []);

  const connect = (): void => {
    if (!containerRef.current || conn === 'open' || conn === 'connecting') return;
    setConn('connecting');

    const term = new Terminal({
      fontFamily: 'var(--font-mono), monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: {
        background: cssVar('--w-bg-sunken'),
        foreground: cssVar('--w-ink'),
        cursor: cssVar('--w-primary'),
        selectionBackground: cssVar('--w-primary-soft'),
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    // 'auto' (Default): serverseitig die erste vorhandene Shell wählen (bash → ash → sh).
    // Sonst genau den eingegebenen Pfad verwenden.
    const cmdParams =
      shell === 'auto' || shell.trim() === ''
        ? [
            '/bin/sh',
            '-c',
            'for s in /bin/bash /usr/bin/bash /bin/ash /bin/sh; do [ -x "$s" ] && exec "$s"; done; exec /bin/sh',
          ]
        : [shell.trim()];
    const query = cmdParams.map((c) => `cmd=${encodeURIComponent(c)}`).join('&');
    const ws = new WebSocket(
      wsUrl(`/api/containers/${encodeURIComponent(id)}/exec/stream?endpoint=${encodeURIComponent(endpoint)}&${query}`),
    );
    wsRef.current = ws;

    const sendResize = (): void => {
      const msg: ExecClientMessage = { type: 'resize', cols: term.cols, rows: term.rows };
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as { type: string; data?: string; message?: string };
        if (msg.type === 'ready') {
          setConn('open');
          sendResize();
          term.focus();
        } else if (msg.type === 'data' && msg.data) {
          term.write(msg.data);
        } else if (msg.type === 'end') {
          term.write('\r\n\x1b[90m— ' + t('console.ended') + ' —\x1b[0m\r\n');
          setConn('closed');
        } else if (msg.type === 'error') {
          term.write(`\r\n\x1b[31m${msg.message ?? 'error'}\x1b[0m\r\n`);
        }
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => setConn((c) => (c === 'idle' ? c : 'closed'));
    ws.onerror = () => setConn('closed');

    term.onData((d) => {
      const msg: ExecClientMessage = { type: 'stdin', data: d };
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    });
    term.onResize(() => sendResize());

    const onWinResize = (): void => fit.fit();
    window.addEventListener('resize', onWinResize);
    ws.addEventListener('close', () => window.removeEventListener('resize', onWinResize));
  };

  const disconnect = (): void => {
    wsRef.current?.close();
    setConn('closed');
  };

  if (!isAdmin) {
    return <Card className="p-8 text-center text-sm text-muted">{t('console.adminOnly')}</Card>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-md border border-signal-soft bg-signal-soft/50 px-3 py-2 text-xs text-signal">
        <TerminalIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{t('console.warning')}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {(['auto', '/bin/sh', '/bin/bash', '/bin/ash'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setShell(s)}
              disabled={conn === 'open' || conn === 'connecting'}
              className={cn(
                'rounded-md border px-2 py-1 font-mono text-[11px] transition-colors disabled:opacity-50',
                shell === s
                  ? 'border-transparent bg-primary-soft text-primary'
                  : 'border-border text-muted hover:text-ink',
              )}
            >
              {s === 'auto' ? t('console.shellAuto') : s}
            </button>
          ))}
        </div>
        <Input
          value={shell === 'auto' ? '' : shell}
          onChange={(e) => setShell(e.target.value.trim() === '' ? 'auto' : e.target.value)}
          disabled={conn === 'open' || conn === 'connecting'}
          placeholder={t('console.shellCustom')}
          spellCheck={false}
          aria-label={t('console.shell')}
          className="h-9 w-40 font-mono text-[13px]"
        />
        {conn === 'open' ? (
          <Button variant="danger" size="sm" onClick={disconnect}>
            <PlugZap className="h-4 w-4" /> {t('console.disconnect')}
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={connect} disabled={!running || conn === 'connecting'}>
            <Plug className="h-4 w-4" /> {t('console.connect')}
          </Button>
        )}
        <span className="ml-1 flex items-center gap-1.5 text-xs text-muted">
          <span
            className={cn('h-2 w-2 rounded-full')}
            style={{
              background:
                conn === 'open' ? 'var(--w-run)' : conn === 'connecting' ? 'var(--w-warn)' : 'var(--w-stop)',
            }}
          />
          {conn === 'open' ? t('console.connected') : conn === 'connecting' ? '…' : t('console.disconnected')}
        </span>
      </div>

      <div
        ref={containerRef}
        className={cn(
          'h-[calc(100dvh-380px)] min-h-[320px] overflow-hidden rounded-lg border border-border bg-bg-sunken p-2',
          conn === 'idle' && 'flex items-center justify-center',
        )}
      >
        {conn === 'idle' && <p className="text-sm text-faint">{t('console.connect')} →</p>}
      </div>
    </div>
  );
}

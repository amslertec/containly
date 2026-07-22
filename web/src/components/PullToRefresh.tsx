import { useRef, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

const THRESHOLD = 70; // px Zug bis zum Auslösen
const MAX = 110; // maximaler Indikator-Weg

/**
 * Pull-to-Refresh für Touch-Geräte: am oberen Rand nach unten ziehen lädt die Seite
 * neu. Wird nur ausgelöst, wenn der Inhalt ganz oben steht; der eigene Container
 * scrollt normal. Auf Desktop (Maus) passiert nichts.
 */
export function PullToRefresh({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onTouchStart = (e: React.TouchEvent): void => {
    // Nur starten, wenn ganz oben gescrollt.
    if ((ref.current?.scrollTop ?? 0) <= 0) startY.current = e.touches[0]!.clientY;
    else startY.current = null;
  };

  const onTouchMove = (e: React.TouchEvent): void => {
    if (startY.current === null || refreshing) return;
    const delta = e.touches[0]!.clientY - startY.current;
    if (delta <= 0) {
      setPull(0);
      return;
    }
    // Gedämpfter Zug (fühlt sich elastisch an).
    setPull(Math.min(MAX, delta * 0.5));
  };

  const onTouchEnd = (): void => {
    if (pull >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      // Kurzer sichtbarer Moment, dann Seite neu laden.
      setTimeout(() => window.location.reload(), 300);
    } else {
      setPull(0);
    }
    startY.current = null;
  };

  const active = pull > 0 || refreshing;

  return (
    <div
      ref={ref}
      className={className}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ overscrollBehaviorY: 'contain' }}
    >
      {/* Indikator */}
      <div
        className="pointer-events-none flex items-center justify-center overflow-hidden transition-[height] duration-150"
        style={{ height: refreshing ? 44 : pull }}
      >
        <RefreshCw
          className={cn(
            'h-5 w-5 text-primary transition-transform',
            refreshing && 'animate-spin',
          )}
          style={{ transform: refreshing ? undefined : `rotate(${(pull / THRESHOLD) * 270}deg)`, opacity: active ? 1 : 0 }}
        />
      </div>
      {children}
    </div>
  );
}

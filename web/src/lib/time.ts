import { formatDistanceToNow, format } from 'date-fns';
import { de, enUS } from 'date-fns/locale';
import i18n from '../i18n';

function loc() {
  return (i18n.resolvedLanguage ?? 'en').startsWith('de') ? de : enUS;
}

/** „vor 3 Stunden" / „3 hours ago". Akzeptiert Unix-Sekunden, ms oder ISO-String. */
export function relativeTime(input: number | string): string {
  const date = toDate(input);
  if (!date) return '—';
  return formatDistanceToNow(date, { addSuffix: true, locale: loc() });
}

export function absoluteTime(input: number | string): string {
  const date = toDate(input);
  if (!date) return '—';
  return format(date, 'yyyy-MM-dd HH:mm:ss');
}

/** Lokalisiertes Datum + Uhrzeit: de → „21.07.2026 21:07:22", en → „07/21/2026 9:07:22 PM". */
export function absoluteTimeLocalized(input: number | string): string {
  const date = toDate(input);
  if (!date) return '—';
  return format(date, 'P pp', { locale: loc() });
}

function toDate(input: number | string): Date | null {
  if (typeof input === 'number') {
    const ms = input < 1e12 ? input * 1000 : input;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (!input || input.startsWith('0001-01-01')) return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

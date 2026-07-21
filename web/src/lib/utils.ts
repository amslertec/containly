import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Bytes menschenlesbar (Basis 1024). */
export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

/** Kurze Docker-ID (12 Zeichen), ohne evtl. `sha256:`-Präfix. */
export function shortId(id: string): string {
  return id.replace(/^sha256:/, '').slice(0, 12);
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)} %`;
}

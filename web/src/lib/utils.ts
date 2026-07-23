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

/**
 * Anklickbarer Link zu einem veröffentlichten Port. Host = spezifische Bind-IP (falls
 * öffentlich), sonst der Endpoint-Host (Remote) bzw. der Host, über den der Browser
 * Containly erreicht (lokal). Nur TCP + veröffentlichte Ports werden verlinkt.
 */
export function portHref(
  p: { ip?: string; publicPort?: number; type: string },
  endpointHost: string | null,
): string | null {
  if (!p.publicPort || p.type !== 'tcp') return null;
  const bind = p.ip && !['0.0.0.0', '::', '', '127.0.0.1', '::1'].includes(p.ip) ? p.ip : null;
  const host = bind ?? endpointHost ?? (typeof window !== 'undefined' ? window.location.hostname : 'localhost');
  return `http://${host}:${p.publicPort}`;
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)} %`;
}

/**
 * Kopiert Text in die Zwischenablage — robust auch außerhalb sicherer Kontexte.
 * `navigator.clipboard` gibt es nur unter HTTPS/localhost; über http://<LAN-IP> ist es
 * `undefined`. Fällt dann auf das (deprecated, aber überall unterstützte) execCommand
 * mit temporärem Textarea zurück. Liefert true bei Erfolg.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fällt auf execCommand zurück */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

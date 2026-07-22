import type { NotificationSeverity } from '@containly/shared';

/**
 * Baut das HTML für eine Benachrichtigungs-E-Mail (E-Mail-sicheres Inline-CSS,
 * Tabellen-Layout). Das Logo wird als CID-Anhang referenziert (siehe mailer.ts).
 */

const BRAND = '#0B7D72';
const ACCENT = '#E2934E';

const SEVERITY_COLOR: Record<NotificationSeverity, string> = {
  info: '#0B7D72',
  warning: '#C97A16',
  critical: '#C0392B',
};

export interface EmailContent {
  severity: NotificationSeverity;
  /** Kurzer Titel, z. B. „Endpoint offline". */
  heading: string;
  /** Ein Satz Zusammenfassung. */
  intro: string;
  /** Detailzeilen (Label → Wert), als Tabelle gerendert. */
  rows: { label: string; value: string }[];
  /** Optionaler Button (Text + URL). */
  action?: { label: string; url: string };
  /** Fußzeile, z. B. „Du erhältst diese E-Mail, weil …". */
  footer: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Reiner Text-Fallback (für Clients ohne HTML). */
export function renderText(c: EmailContent): string {
  const lines = [c.heading, '', c.intro, ''];
  for (const r of c.rows) lines.push(`${r.label}: ${r.value}`);
  if (c.action) lines.push('', `${c.action.label}: ${c.action.url}`);
  lines.push('', c.footer, '', 'Containly');
  return lines.join('\n');
}

export function renderHtml(c: EmailContent): string {
  const accent = SEVERITY_COLOR[c.severity];
  const rows = c.rows
    .map(
      (r) => `
      <tr>
        <td style="padding:6px 0;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top;">${esc(r.label)}</td>
        <td style="padding:6px 0 6px 16px;color:#111827;font-size:13px;font-family:ui-monospace,Menlo,Consolas,monospace;word-break:break-all;">${esc(r.value)}</td>
      </tr>`,
    )
    .join('');

  const button = c.action
    ? `
    <tr><td style="padding:22px 0 4px;">
      <a href="${esc(c.action.url)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;">${esc(c.action.label)}</a>
    </td></tr>`
    : '';

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:520px;max-width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
        <!-- Header mit Logo -->
        <tr><td style="padding:22px 28px;background:#ffffff;border-bottom:1px solid #eef0f2;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;"><img src="cid:containly-logo" width="32" height="32" alt="Containly" style="display:block;border-radius:8px;"></td>
            <td style="vertical-align:middle;padding-left:11px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;color:#111827;letter-spacing:-0.01em;">Containly</td>
          </tr></table>
        </td></tr>
        <!-- Severity-Band -->
        <tr><td style="height:4px;background:${accent};line-height:4px;font-size:0;">&nbsp;</td></tr>
        <!-- Body -->
        <tr><td style="padding:26px 28px 8px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
          <div style="font-size:19px;font-weight:700;color:#111827;margin:0 0 8px;">${esc(c.heading)}</div>
          <div style="font-size:14px;color:#4b5563;line-height:1.5;margin:0 0 18px;">${esc(c.intro)}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eef0f2;border-bottom:1px solid #eef0f2;margin:0;">
            ${rows}
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0">${button}</table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 28px 24px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
          <div style="font-size:12px;color:#9ca3af;line-height:1.5;border-top:1px solid #eef0f2;padding-top:16px;">
            ${esc(c.footer)}<br>
            <span style="color:#b8bcc2;">Containly · <span style="color:${ACCENT};">●</span> selbst-gehostete Docker-Verwaltung</span>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

import nodemailer, { type Transporter } from 'nodemailer';
import type { Locale, SmtpConfig, SmtpConfigInput } from '@containly/shared';
import { db } from '../db/index.js';
import { encryptSecret, decryptSecret } from './crypto.js';
import { renderHtml, renderText } from './email-template.js';
import type { EmailContent } from './email-template.js';
import { et } from './email-i18n.js';
import { LOGO_PNG_BASE64 } from './email-logo.js';
import { logger } from '../logger.js';

interface SmtpRow {
  host: string;
  port: number;
  secure: number;
  username: string;
  password_enc: string;
  from_addr: string;
  from_name: string;
  enabled: number;
}

function getRow(): SmtpRow | undefined {
  return db.prepare('SELECT * FROM smtp_config WHERE id = 1').get() as SmtpRow | undefined;
}

/** Ob SMTP so weit konfiguriert ist, dass tatsächlich Mails versendet würden. */
export function isSmtpConfigured(): boolean {
  const r = getRow();
  return !!(r && r.host && r.from_addr);
}

/** SMTP-Konfiguration ohne Passwort (für die UI). */
export function getSmtpConfig(): SmtpConfig {
  const r = getRow();
  return {
    host: r?.host ?? '',
    port: r?.port ?? 587,
    secure: !!r?.secure,
    username: r?.username ?? '',
    fromAddr: r?.from_addr ?? '',
    fromName: r?.from_name ?? 'Containly',
    enabled: !!r?.enabled,
    hasPassword: !!r?.password_enc,
  };
}

export function saveSmtpConfig(input: SmtpConfigInput): void {
  const existing = getRow();
  // Passwort nur überschreiben, wenn eines übergeben wurde (leer = unverändert lassen).
  const passwordEnc =
    input.password && input.password.length > 0
      ? encryptSecret(input.password)
      : (existing?.password_enc ?? '');
  db.prepare(`
    INSERT INTO smtp_config (id, host, port, secure, username, password_enc, from_addr, from_name, enabled, updated_at)
    VALUES (1, @host, @port, @secure, @username, @password_enc, @from_addr, @from_name, @enabled, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      host=excluded.host, port=excluded.port, secure=excluded.secure, username=excluded.username,
      password_enc=excluded.password_enc, from_addr=excluded.from_addr, from_name=excluded.from_name,
      enabled=excluded.enabled, updated_at=datetime('now')
  `).run({
    host: input.host,
    port: input.port,
    secure: input.secure ? 1 : 0,
    username: input.username,
    password_enc: passwordEnc,
    from_addr: input.fromAddr,
    from_name: input.fromName,
    enabled: input.enabled ? 1 : 0,
  });
}

function buildTransport(): { transport: Transporter; from: string } | null {
  const r = getRow();
  if (!r || !r.host || !r.from_addr) return null;
  const transport = nodemailer.createTransport({
    host: r.host,
    port: r.port,
    secure: !!r.secure, // true = 465/TLS; false = STARTTLS/plain
    auth: r.username ? { user: r.username, pass: decryptSecret(r.password_enc) } : undefined,
  });
  const from = r.from_name ? `"${r.from_name}" <${r.from_addr}>` : r.from_addr;
  return { transport, from };
}

const LOGO_ATTACHMENT = {
  filename: 'containly.png',
  content: Buffer.from(LOGO_PNG_BASE64, 'base64'),
  cid: 'containly-logo',
  contentType: 'image/png',
};

/** Verschickt eine gerenderte Benachrichtigung an mehrere Empfänger. */
export async function sendNotificationEmail(
  to: string[],
  subject: string,
  content: EmailContent,
): Promise<void> {
  if (to.length === 0) return;
  const t = buildTransport();
  if (!t) {
    logger.debug('SMTP nicht konfiguriert — E-Mail wird nicht gesendet');
    return;
  }
  await t.transport.sendMail({
    from: t.from,
    to: to.join(', '),
    subject,
    text: renderText(content),
    html: renderHtml(content),
    attachments: [LOGO_ATTACHMENT],
  });
  logger.info({ subject, recipients: to.length }, 'Benachrichtigungs-E-Mail gesendet');
}

/** Einladungs-Mail mit Annahme-Link. Liefert true, wenn tatsächlich versendet wurde. */
export async function sendInviteEmail(to: string, url: string, lang: 'de' | 'en'): Promise<boolean> {
  const t = buildTransport();
  if (!t) return false;
  const txt =
    lang === 'de'
      ? {
          subject: 'Containly · Einladung zu deinem Konto',
          heading: 'Du wurdest zu Containly eingeladen',
          intro:
            'Erstelle dein Konto über den Button unten. Der Link ist 7 Tage gültig und nur einmal nutzbar.',
          label: 'E-Mail',
          action: 'Konto erstellen',
          footer: 'Du erhältst diese E-Mail, weil dich ein Administrator zu Containly eingeladen hat.',
        }
      : {
          subject: 'Containly · Invitation to your account',
          heading: 'You have been invited to Containly',
          intro:
            'Create your account using the button below. The link is valid for 7 days and can be used once.',
          label: 'Email',
          action: 'Create account',
          footer: 'You received this email because an administrator invited you to Containly.',
        };
  const content: EmailContent = {
    severity: 'info',
    heading: txt.heading,
    intro: txt.intro,
    rows: [{ label: txt.label, value: to }],
    action: { label: txt.action, url },
    footer: txt.footer,
  };
  await t.transport.sendMail({
    from: t.from,
    to,
    subject: txt.subject,
    text: renderText(content),
    html: renderHtml(content),
    attachments: [LOGO_ATTACHMENT],
  });
  logger.info({ to }, 'Einladungs-E-Mail gesendet');
  return true;
}

export interface TestEmailResult {
  accepted: string[];
  rejected: string[];
  response: string;
}

/**
 * Sendet eine Test-E-Mail und liefert die SMTP-Server-Antwort zurück (angenommene/
 * abgelehnte Empfänger + Roh-Antwort). „gesendet" heißt nur, dass der Server die Mail
 * ANGENOMMEN hat — landet sie danach im Spam oder in einem noreply-Postfach, das die
 * Mail verwirft, kann Containly das nicht sehen.
 */
export async function sendTestEmail(to: string, lang: Locale = 'en'): Promise<TestEmailResult> {
  const t = buildTransport();
  if (!t) throw new Error('SMTP ist nicht konfiguriert (Host und Absender erforderlich).');
  const content: EmailContent = {
    severity: 'info',
    heading: et(lang, 'test.heading'),
    intro: et(lang, 'test.intro'),
    rows: [],
    footer: et(lang, 'test.footer'),
  };
  const info = (await t.transport.sendMail({
    from: t.from,
    to,
    subject: et(lang, 'test.subject'),
    text: renderText(content),
    html: renderHtml(content),
    attachments: [LOGO_ATTACHMENT],
  })) as { accepted?: string[]; rejected?: string[]; response?: string };
  const result: TestEmailResult = {
    accepted: (info.accepted ?? []).map(String),
    rejected: (info.rejected ?? []).map(String),
    response: info.response ?? '',
  };
  logger.info({ to, ...result }, 'Test-E-Mail gesendet');
  return result;
}

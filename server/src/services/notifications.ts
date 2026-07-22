import {
  NOTIFICATION_CATALOG,
  notificationMeta,
  type Locale,
  type NotificationSetting,
  type NotificationSettingInput,
  type NotificationType,
} from '@containly/shared';
import { db } from '../db/index.js';
import { usersWithEmail } from './users.js';
import { sendNotificationEmail } from './mailer.js';
import { addFeedItem } from './inapp.js';
import type { EmailContent } from './email-template.js';
import { logger } from '../logger.js';

// Interne Ziel-Route je Typ (für den Klick in der In-App-Benachrichtigung).
const LINK: Record<NotificationType, string> = {
  'endpoint.offline': '/endpoints',
  'endpoint.online': '/endpoints',
  'container.exited': '/containers',
  'container.unhealthy': '/containers',
  'container.oom': '/containers',
  'container.restart_loop': '/containers',
  'image.update': '/updates',
  'containly.update': '/settings',
  'vuln.critical': '/images',
  'perf.cpu': '/containers',
  'perf.memory': '/containers',
  'host.disk': '/endpoints',
};

/**
 * Verwaltet die Benachrichtigungs-Einstellungen je Typ (aktiv, Schwellwert, Empfänger)
 * und verschickt Benachrichtigungen an die aufgelösten Empfänger — mit Cooldown, damit
 * dasselbe Ereignis nicht wiederholt mailt.
 */

interface SettingRow {
  type: string;
  enabled: number;
  threshold: number | null;
  all_admins: number;
  recipients: string;
}

function rowToSetting(type: NotificationType, r: SettingRow | undefined): NotificationSetting {
  const meta = notificationMeta(type);
  return {
    type,
    enabled: r ? r.enabled === 1 : true,
    threshold: r?.threshold ?? meta.thresholdDefault ?? null,
    allAdmins: r ? r.all_admins === 1 : true,
    recipients: r ? (JSON.parse(r.recipients) as number[]) : [],
  };
}

/** Alle Einstellungen (fehlende Typen bekommen Default-Werte). */
export function listNotificationSettings(): NotificationSetting[] {
  const rows = new Map(
    (db.prepare('SELECT * FROM notification_settings').all() as SettingRow[]).map((r) => [r.type, r]),
  );
  return NOTIFICATION_CATALOG.map((m) => rowToSetting(m.type, rows.get(m.type)));
}

function getSetting(type: NotificationType): NotificationSetting {
  const r = db.prepare('SELECT * FROM notification_settings WHERE type = ?').get(type) as
    | SettingRow
    | undefined;
  return rowToSetting(type, r);
}

export function updateNotificationSetting(type: NotificationType, input: NotificationSettingInput): void {
  const meta = notificationMeta(type);
  const threshold = meta.thresholdUnit ? (input.threshold ?? meta.thresholdDefault ?? null) : null;
  db.prepare(`
    INSERT INTO notification_settings (type, enabled, threshold, all_admins, recipients)
    VALUES (@type, @enabled, @threshold, @all_admins, @recipients)
    ON CONFLICT(type) DO UPDATE SET
      enabled=excluded.enabled, threshold=excluded.threshold,
      all_admins=excluded.all_admins, recipients=excluded.recipients
  `).run({
    type,
    enabled: input.enabled ? 1 : 0,
    threshold,
    all_admins: input.allAdmins ? 1 : 0,
    recipients: JSON.stringify(input.recipients),
  });
}

/**
 * Löst die Empfänger für einen Typ auf (alle Admins + ausgewählte User), gruppiert nach
 * Sprache — damit jeder Empfänger seine E-Mail in der eingestellten Sprache erhält.
 */
function resolveRecipientsByLang(setting: NotificationSetting): Map<Locale, string[]> {
  const all = usersWithEmail();
  const chosen = new Map<string, Locale>(); // email → lang (dedupliziert)
  if (setting.allAdmins) {
    for (const u of all) if (u.role === 'admin') chosen.set(u.email, u.language);
  }
  const picked = new Set(setting.recipients);
  for (const u of all) if (picked.has(u.id)) chosen.set(u.email, u.language);

  const byLang = new Map<Locale, string[]>();
  for (const [email, lang] of chosen) {
    const list = byLang.get(lang) ?? [];
    list.push(email);
    byLang.set(lang, list);
  }
  return byLang;
}

/** Schwellwert eines Typs (oder Default). */
export function thresholdFor(type: NotificationType): number | null {
  return getSetting(type).threshold;
}

// Cooldown: pro (Typ + Schlüssel) frühestens nach COOLDOWN_MS erneut mailen.
const COOLDOWN_MS = 30 * 60 * 1000;
const lastSent = new Map<string, number>();

export interface NotifyPayload {
  /** Eindeutiger Schlüssel des betroffenen Objekts (z. B. Endpoint- oder Container-ID) für den Cooldown. */
  key: string;
  /** Rendert Betreff + Inhalt in der Zielsprache des Empfängers. */
  render: (lang: Locale) => { subject: string; content: EmailContent };
}

/**
 * Verschickt eine Benachrichtigung eines Typs, sofern aktiv + Empfänger vorhanden +
 * Cooldown abgelaufen. Jede Sprachgruppe erhält die E-Mail in ihrer Sprache.
 * Fehler werden geloggt, nicht geworfen (Monitor läuft weiter).
 */
export async function notify(type: NotificationType, payload: NotifyPayload): Promise<void> {
  const setting = getSetting(type);
  if (!setting.enabled) return;
  const cooldownKey = `${type}:${payload.key}`;
  const now = Date.now();
  const prev = lastSent.get(cooldownKey);
  if (prev && now - prev < COOLDOWN_MS) return;
  lastSent.set(cooldownKey, now);

  // 1) In-App-Feed IMMER schreiben (auch ohne SMTP/Empfänger). Ziel/Detail aus der
  //    Render-Ausgabe ableiten (Werte sind Namen/Zahlen → weitgehend sprachneutral).
  try {
    const { content } = payload.render('en');
    const target = content.rows[0]?.value ?? '';
    const detail = content.rows.slice(1).map((r) => r.value).join(' · ');
    addFeedItem({ type, severity: content.severity, target, detail, link: LINK[type] ?? '' });
  } catch (err) {
    logger.debug({ err, type }, 'In-App-Benachrichtigung konnte nicht geschrieben werden');
  }

  // 2) E-Mail an die aufgelösten Empfänger je Sprache (falls konfiguriert).
  const byLang = resolveRecipientsByLang(setting);
  for (const [lang, emails] of byLang) {
    if (emails.length === 0) continue;
    const { subject, content } = payload.render(lang);
    try {
      await sendNotificationEmail(emails, subject, content);
    } catch (err) {
      logger.warn({ err, type, lang }, 'Benachrichtigung konnte nicht gesendet werden');
    }
  }
}

/** Cooldown für einen Schlüssel zurücksetzen (z. B. wenn ein Problem behoben ist). */
export function clearCooldown(type: NotificationType, key: string): void {
  lastSent.delete(`${type}:${key}`);
}

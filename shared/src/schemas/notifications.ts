import { z } from 'zod';

/** Alle Benachrichtigungstypen (Server + Client teilen sich diesen Katalog). */
export const NOTIFICATION_TYPES = [
  'endpoint.offline',
  'endpoint.online',
  'container.exited',
  'container.unhealthy',
  'container.oom',
  'container.restart_loop',
  'image.update',
  'containly.update',
  'vuln.critical',
  'perf.cpu',
  'perf.memory',
  'host.disk',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationCategory = 'endpoint' | 'container' | 'update' | 'security' | 'performance';
export type NotificationSeverity = 'info' | 'warning' | 'critical';

/** Statische Metadaten je Typ (Kategorie, Schweregrad, Schwellwert-Eigenschaften). */
export interface NotificationMeta {
  type: NotificationType;
  category: NotificationCategory;
  severity: NotificationSeverity;
  /** Schwellwert-Einheit (undefined = kein Schwellwert). */
  thresholdUnit?: '%' | 'GB';
  thresholdDefault?: number;
  /** true = größer-als löst aus; false = kleiner-als (z. B. wenig Speicher). */
  thresholdAbove?: boolean;
}

export const NOTIFICATION_CATALOG: NotificationMeta[] = [
  { type: 'endpoint.offline', category: 'endpoint', severity: 'critical' },
  { type: 'endpoint.online', category: 'endpoint', severity: 'info' },
  { type: 'container.exited', category: 'container', severity: 'warning' },
  { type: 'container.unhealthy', category: 'container', severity: 'warning' },
  { type: 'container.oom', category: 'container', severity: 'critical' },
  { type: 'container.restart_loop', category: 'container', severity: 'warning' },
  { type: 'image.update', category: 'update', severity: 'info' },
  { type: 'containly.update', category: 'update', severity: 'info' },
  { type: 'vuln.critical', category: 'security', severity: 'critical' },
  { type: 'perf.cpu', category: 'performance', severity: 'warning', thresholdUnit: '%', thresholdDefault: 90, thresholdAbove: true },
  { type: 'perf.memory', category: 'performance', severity: 'warning', thresholdUnit: '%', thresholdDefault: 90, thresholdAbove: true },
  { type: 'host.disk', category: 'performance', severity: 'warning', thresholdUnit: 'GB', thresholdDefault: 10, thresholdAbove: false },
];

export function notificationMeta(type: NotificationType): NotificationMeta {
  return NOTIFICATION_CATALOG.find((m) => m.type === type)!;
}

/* ── SMTP-Konfiguration ─────────────────────────────────────────────────── */
export const SmtpConfigSchema = z.object({
  host: z.string(),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string(),
  fromAddr: z.string(),
  fromName: z.string(),
  enabled: z.boolean(),
  /** true = ein Passwort ist gesetzt (das Passwort selbst wird nie zurückgegeben). */
  hasPassword: z.boolean(),
});
export type SmtpConfig = z.infer<typeof SmtpConfigSchema>;

/** Eingabe zum Speichern der SMTP-Konfiguration (Passwort optional = unverändert lassen). */
export const SmtpConfigInputSchema = z.object({
  host: z.string().max(255),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().max(255),
  password: z.string().max(1024).optional(),
  fromAddr: z.string().max(255),
  fromName: z.string().max(128),
  enabled: z.boolean(),
});
export type SmtpConfigInput = z.infer<typeof SmtpConfigInputSchema>;

/* ── Einstellung je Benachrichtigungstyp ────────────────────────────────── */
export const NotificationSettingSchema = z.object({
  type: z.enum(NOTIFICATION_TYPES),
  enabled: z.boolean(),
  threshold: z.number().nullable(),
  allAdmins: z.boolean(),
  recipients: z.array(z.number()), // zusätzliche User-IDs
});
export type NotificationSetting = z.infer<typeof NotificationSettingSchema>;

export const NotificationSettingInputSchema = z.object({
  enabled: z.boolean(),
  threshold: z.number().nullable().optional(),
  allAdmins: z.boolean(),
  recipients: z.array(z.number().int()),
});
export type NotificationSettingInput = z.infer<typeof NotificationSettingInputSchema>;

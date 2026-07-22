import { z } from 'zod';

/** Alle geplanten Wartungs-Job-Typen. */
export const SCHEDULE_JOB_TYPES = [
  'image.prune',
  'volume.prune',
  'update.check',
  'vuln.scan',
  'backup',
  'auto.update',
] as const;
export type ScheduleJobType = (typeof SCHEDULE_JOB_TYPES)[number];

export interface ScheduleJobMeta {
  type: ScheduleJobType;
  /** Destruktiv → in der UI mit Warnung + standardmäßig aus. */
  destructive?: boolean;
  /** Benötigt eine Passphrase (Backup). */
  needsPassphrase?: boolean;
}

export const SCHEDULE_CATALOG: ScheduleJobMeta[] = [
  { type: 'image.prune' },
  { type: 'volume.prune', destructive: true },
  { type: 'update.check' },
  { type: 'vuln.scan' },
  { type: 'backup', needsPassphrase: true },
  { type: 'auto.update' },
];

export const FrequencySchema = z.enum(['daily', 'weekly']);
export type Frequency = z.infer<typeof FrequencySchema>;

/** Öffentliche Job-Konfiguration + letzter Lauf (ohne Passphrase). */
export const ScheduledJobSchema = z.object({
  type: z.enum(SCHEDULE_JOB_TYPES),
  enabled: z.boolean(),
  frequency: FrequencySchema,
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  weekday: z.number().int().min(0).max(6), // 0 = Sonntag
  hasPassphrase: z.boolean(),
  lastRun: z.string().nullable(),
  lastStatus: z.enum(['ok', 'error']).nullable(),
  lastDetail: z.string().nullable(),
});
export type ScheduledJob = z.infer<typeof ScheduledJobSchema>;

export const ScheduledJobInputSchema = z.object({
  enabled: z.boolean(),
  frequency: FrequencySchema,
  hour: z.coerce.number().int().min(0).max(23),
  minute: z.coerce.number().int().min(0).max(59),
  weekday: z.coerce.number().int().min(0).max(6),
  /** Nur beim Backup; leer/undefined = unverändert lassen. */
  passphrase: z.string().max(512).optional(),
});
export type ScheduledJobInput = z.infer<typeof ScheduledJobInputSchema>;

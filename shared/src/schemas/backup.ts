import { z } from 'zod';

/** Backup erstellen — Passphrase (min. 8 Zeichen) verschlüsselt die Datei. */
export const BackupRequestSchema = z.object({
  passphrase: z.string().min(8, 'Mindestens 8 Zeichen').max(200),
});
export type BackupRequest = z.infer<typeof BackupRequestSchema>;

/** Restore — Backup-Dateiinhalt + Passphrase. */
export const RestoreRequestSchema = z.object({
  data: z.string().min(1).max(64 * 1024 * 1024),
  passphrase: z.string().min(1).max(200),
});
export type RestoreRequest = z.infer<typeof RestoreRequestSchema>;

export const RestoreResultSchema = z.object({
  users: z.number(),
  endpoints: z.number(),
  auditLog: z.number(),
});
export type RestoreResult = z.infer<typeof RestoreResultSchema>;

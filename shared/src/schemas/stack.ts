import { z } from 'zod';

/** Ordnername eines Projekts (kein `/`, kein führender Punkt); Server prüft zusätzlich den Pfad. */
export const StackNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, 'Ungültiger Ordnername');

/** Opake Stack-ID (kodiert Endpoint + Verzeichnis; base64url). */
export const StackIdSchema = z.string().min(1).max(2048);

export const StackStatusSchema = z.enum(['running', 'partial', 'stopped', 'unknown']);
export type StackStatus = z.infer<typeof StackStatusSchema>;

export const StackSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  endpoint: z.string(),
  endpointName: z.string(),
  status: StackStatusSchema,
  services: z.number(),
  running: z.number(),
  path: z.string(),
  updatedAt: z.string().nullable(),
  // Für die Suche: Container- und Image-Namen der laufenden Container des Stacks.
  containerNames: z.array(z.string()),
  images: z.array(z.string()),
});
export type StackSummary = z.infer<typeof StackSummarySchema>;

/** Datei innerhalb eines Projektordners. */
export const StackFileSchema = z.object({
  name: z.string(),
  size: z.number(),
  isDir: z.boolean(),
  isCompose: z.boolean(),
});
export type StackFile = z.infer<typeof StackFileSchema>;

/** Container eines Stacks (aus den Compose-Labels des Ziel-Endpoints). */
export const StackContainerSchema = z.object({
  id: z.string(),
  name: z.string(),
  service: z.string(),
  image: z.string(),
  state: z.string(),
  status: z.string(),
});
export type StackContainer = z.infer<typeof StackContainerSchema>;

export const StackDetailSchema = StackSummarySchema.extend({
  content: z.string(),
  composeFile: z.string(),
  files: z.array(StackFileSchema),
  containers: z.array(StackContainerSchema),
});
export type StackDetail = z.infer<typeof StackDetailSchema>;

/** Stack-weite Lifecycle-Aktion. */
export const StackActionSchema = z.enum([
  'start',
  'stop',
  'restart',
  'pause',
  'unpause',
  'kill',
]);
export type StackActionName = z.infer<typeof StackActionSchema>;

/** Neues Projekt anlegen: in einem der konfigurierten Pfade des Endpoints. */
export const CreateStackSchema = z.object({
  endpoint: z.string().min(1).max(64),
  basePath: z.string().min(1).max(1024),
  name: StackNameSchema,
  content: z.string().min(1).max(1024 * 1024),
});
export type CreateStack = z.infer<typeof CreateStackSchema>;

export const SaveContentSchema = z.object({
  content: z.string().max(4 * 1024 * 1024),
});
export type SaveContent = z.infer<typeof SaveContentSchema>;

/** Dateiname innerhalb eines Stacks (keine Pfadanteile; Dotfiles wie `.env` erlaubt). */
export const StackFileNameSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^\.?[A-Za-z0-9][A-Za-z0-9_.-]*$/, 'Ungültiger Dateiname')
  .refine((s) => s !== '.' && s !== '..' && !s.includes('/'), 'Ungültiger Dateiname');

/** Ein Segment eines Stack-Pfads (Ordner- oder Dateiname). */
const segmentOk = (s: string): boolean =>
  /^\.?[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(s) && s !== '.' && s !== '..';

/** Relativer Datei-Pfad innerhalb eines Stacks (Unterordner erlaubt, kein `..`). */
export const StackPathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((p) => !p.startsWith('/') && p.split('/').every(segmentOk), 'Ungültiger Pfad');

/** Relativer Verzeichnis-Pfad innerhalb eines Stacks (leer = Wurzel). */
export const StackDirSchema = z
  .string()
  .max(4096)
  .refine((p) => p === '' || (!p.startsWith('/') && p.split('/').every(segmentOk)), 'Ungültiger Pfad');

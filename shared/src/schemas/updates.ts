import { z } from 'zod';

export const UpdateStatusSchema = z.enum(['update', 'uptodate', 'unknown']);
export type UpdateStatus = z.infer<typeof UpdateStatusSchema>;

/** Ergebnis der Update-Prüfung für ein Image (Registry-Digest vs. lokal). */
export const UpdateItemSchema = z.object({
  image: z.string(),
  status: UpdateStatusSchema,
  updateAvailable: z.boolean(),
  currentDigest: z.string().nullable(),
  latestDigest: z.string().nullable(),
  /** Container (Namen), die dieses Image nutzen. */
  containers: z.array(z.string()),
  error: z.string().nullable(),
});
export type UpdateItem = z.infer<typeof UpdateItemSchema>;

export const UpdatesResponseSchema = z.object({
  items: z.array(UpdateItemSchema),
  checkedAt: z.string(),
});
export type UpdatesResponse = z.infer<typeof UpdatesResponseSchema>;

/** Serverseitiger Bulk-Update-Job (überlebt Client-Reloads). */
export const BulkJobStatusSchema = z.enum(['idle', 'running', 'done', 'error']);
export type BulkJobStatus = z.infer<typeof BulkJobStatusSchema>;

export const BulkJobSchema = z.object({
  endpoint: z.string(),
  total: z.number(),
  done: z.number(),
  current: z.string().nullable(),
  status: BulkJobStatusSchema,
  errors: z.array(z.object({ image: z.string(), error: z.string() })),
});
export type BulkJob = z.infer<typeof BulkJobSchema>;

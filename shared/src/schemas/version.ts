import { z } from 'zod';

/** Result of the self-update check (running version vs. latest GitHub release). */
export const VersionInfoSchema = z.object({
  current: z.string(),
  latest: z.string().nullable(),
  updateAvailable: z.boolean(),
  releaseUrl: z.string(),
  releaseName: z.string().nullable(),
  notes: z.string().nullable(),
  publishedAt: z.string().nullable(),
  checkedAt: z.string().nullable(),
});
export type VersionInfo = z.infer<typeof VersionInfoSchema>;

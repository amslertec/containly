import { z } from 'zod';

/** Ein aus einem Git-Repo verwalteter Stack. */
export const GitStackSchema = z.object({
  id: z.number().int().positive(),
  endpoint: z.string(),
  name: z.string(),
  basePath: z.string(),
  repoUrl: z.string(),
  branch: z.string(),
  autoSync: z.boolean(),
  lastSync: z.string().nullable(),
  lastCommit: z.string().nullable(),
  lastStatus: z.enum(['ok', 'error']).nullable(),
  lastDetail: z.string().nullable(),
});
export type GitStack = z.infer<typeof GitStackSchema>;

/** Namensschema für ein Git-Stack-Verzeichnis (kein Pfad-Traversal). */
export const GitStackNameSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, 'Ungültiger Name');

export const AddGitStackSchema = z.object({
  endpoint: z.string().min(1).max(64),
  basePath: z.string().min(1).max(1024),
  name: GitStackNameSchema,
  repoUrl: z.string().min(1).max(1024),
  branch: z.string().min(1).max(120).default('main'),
  autoSync: z.boolean().default(false),
});
export type AddGitStack = z.infer<typeof AddGitStackSchema>;

import { z } from 'zod';

/** Eine Zeile des Compose-Diffs vor einem Redeploy. */
export const StackDiffLineSchema = z.object({
  type: z.enum(['add', 'del', 'ctx']),
  text: z.string(),
});
export type StackDiffLine = z.infer<typeof StackDiffLineSchema>;

/** Diff des aktuellen Compose-Inhalts gegen den zuletzt deployten Snapshot. */
export const StackDiffSchema = z.object({
  hasPrevious: z.boolean(), // gibt es überhaupt einen Snapshot (schon mal deployt)?
  changed: z.boolean(), // gibt es Änderungen (add/del)?
  lines: z.array(StackDiffLineSchema),
});
export type StackDiff = z.infer<typeof StackDiffSchema>;

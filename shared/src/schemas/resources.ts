import { z } from 'zod';
import { DockerIdSchema } from './common.js';

/* ── Images ─────────────────────────────────────────────────────────────── */
export const ImageSummarySchema = z.object({
  id: z.string(),
  repoTags: z.array(z.string()),
  repoDigests: z.array(z.string()),
  created: z.number(),
  size: z.number(),
  containers: z.number(),
  /** Namen der Container, die dieses Image nutzen. */
  containerNames: z.array(z.string()),
  dangling: z.boolean(),
});
export type ImageSummary = z.infer<typeof ImageSummarySchema>;

// Image-Referenz: Repository[:tag][@digest]. Bewusst eng gehalten.
export const ImageRefSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_./:@-]*$/, 'Ungültige Image-Referenz');

export const PullImageSchema = z.object({ image: ImageRefSchema });
export type PullImage = z.infer<typeof PullImageSchema>;

export const TagImageSchema = z.object({
  repo: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/, 'Ungültiges Repository'),
  tag: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/, 'Ungültiger Tag'),
});
export type TagImage = z.infer<typeof TagImageSchema>;

export const RemoveImageQuerySchema = z.object({
  force: z.coerce.boolean().default(false),
});

/* ── Volumes ────────────────────────────────────────────────────────────── */
export const VolumeSummarySchema = z.object({
  name: z.string(),
  driver: z.string(),
  mountpoint: z.string(),
  createdAt: z.string().nullable(),
  scope: z.string(),
  labels: z.record(z.string(), z.string()),
  inUse: z.boolean(),
});
export type VolumeSummary = z.infer<typeof VolumeSummarySchema>;

export const CreateVolumeSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, 'Ungültiger Volume-Name'),
  driver: z.string().max(64).default('local'),
});
export type CreateVolume = z.infer<typeof CreateVolumeSchema>;

/* ── Networks ───────────────────────────────────────────────────────────── */
export const NetworkSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  driver: z.string(),
  scope: z.string(),
  internal: z.boolean(),
  attachable: z.boolean(),
  subnet: z.string().nullable(),
  containers: z.number(),
  labels: z.record(z.string(), z.string()),
  system: z.boolean(),
});
export type NetworkSummary = z.infer<typeof NetworkSummarySchema>;

export const CreateNetworkSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, 'Ungültiger Netzwerk-Name'),
  driver: z.enum(['bridge', 'macvlan', 'ipvlan', 'overlay']).default('bridge'),
  internal: z.boolean().default(false),
});
export type CreateNetwork = z.infer<typeof CreateNetworkSchema>;

/* ── Prune (gemeinsam) ──────────────────────────────────────────────────── */
export const PruneResultSchema = z.object({
  deleted: z.array(z.string()),
  spaceReclaimed: z.number(),
});
export type PruneResult = z.infer<typeof PruneResultSchema>;

/* Re-Export für Konsumenten, die eine ID validieren wollen. */
export const ResourceIdSchema = DockerIdSchema;

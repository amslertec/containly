import { z } from 'zod';
import { DockerIdSchema } from './common.js';

export const ContainerStateSchema = z.enum([
  'created',
  'running',
  'paused',
  'restarting',
  'removing',
  'exited',
  'dead',
]);
export type ContainerState = z.infer<typeof ContainerStateSchema>;

export const PortMappingSchema = z.object({
  ip: z.string().optional(),
  privatePort: z.number(),
  publicPort: z.number().optional(),
  type: z.string(),
});

/** Kompakte Container-Zeile für die Liste. */
export const ContainerSummarySchema = z.object({
  id: z.string(),
  names: z.array(z.string()),
  image: z.string(),
  imageId: z.string(),
  command: z.string(),
  createdAt: z.number(),
  state: z.string(),
  status: z.string(),
  ports: z.array(PortMappingSchema),
  labels: z.record(z.string(), z.string()),
  /** Compose-Projekt aus Labels, falls vorhanden. */
  composeProject: z.string().nullable(),
  restartCount: z.number().nullable(),
});
export type ContainerSummary = z.infer<typeof ContainerSummarySchema>;

/** Vollständiges Inspect-Ergebnis reichen wir strukturiert-aber-locker durch. */
export const ContainerInspectSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string(),
  state: z.object({
    status: z.string(),
    running: z.boolean(),
    paused: z.boolean(),
    restarting: z.boolean(),
    startedAt: z.string(),
    finishedAt: z.string(),
    exitCode: z.number(),
    health: z.string().nullable(),
    restartCount: z.number(),
  }),
  createdAt: z.string(),
  restartPolicy: z.string(),
  env: z.array(z.string()),
  mounts: z.array(
    z.object({
      type: z.string(),
      source: z.string(),
      destination: z.string(),
      rw: z.boolean(),
    }),
  ),
  networks: z.array(
    z.object({
      name: z.string(),
      ipAddress: z.string(),
      gateway: z.string(),
    }),
  ),
  ports: z.array(PortMappingSchema),
  labels: z.record(z.string(), z.string()),
  /** Raw dockerode inspect für die „Advanced"-Ansicht. */
  raw: z.unknown(),
});
export type ContainerInspect = z.infer<typeof ContainerInspectSchema>;

export const ContainerActionSchema = z.enum(['start', 'stop', 'restart', 'pause', 'unpause', 'kill']);
export type ContainerAction = z.infer<typeof ContainerActionSchema>;

export const RemoveContainerQuerySchema = z.object({
  force: z.coerce.boolean().default(false),
  volumes: z.coerce.boolean().default(false),
});

/** Live-Ressourcenstats über WebSocket. */
export const ContainerStatsSchema = z.object({
  id: z.string(),
  cpuPercent: z.number(),
  memoryUsage: z.number(),
  memoryLimit: z.number(),
  memoryPercent: z.number(),
  netRx: z.number(),
  netTx: z.number(),
  blockRead: z.number(),
  blockWrite: z.number(),
  pids: z.number(),
  timestamp: z.number(),
});
export type ContainerStats = z.infer<typeof ContainerStatsSchema>;

export const ExecRequestSchema = z.object({
  id: DockerIdSchema,
  cmd: z.array(z.string().max(2000)).min(1).max(20).default(['/bin/sh']),
});
export type ExecRequest = z.infer<typeof ExecRequestSchema>;

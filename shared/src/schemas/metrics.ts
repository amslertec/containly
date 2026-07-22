import { z } from 'zod';

/** Ein Messpunkt der Ressourcen-Zeitreihe (CPU/RAM je Container). */
export const MetricPointSchema = z.object({
  ts: z.number(), // epoch ms
  cpu: z.number(), // Prozent
  mem: z.number(), // Prozent des Limits
});
export type MetricPoint = z.infer<typeof MetricPointSchema>;

export const MetricsResponseSchema = z.object({
  points: z.array(MetricPointSchema),
});
export type MetricsResponse = z.infer<typeof MetricsResponseSchema>;

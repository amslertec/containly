import { z } from 'zod';

/** Rollenmodell: serverseitig durchgesetzt. `admin` darf mutieren, `viewer` nur lesen. */
export const RoleSchema = z.enum(['admin', 'viewer']);
export type Role = z.infer<typeof RoleSchema>;

/**
 * Docker-Ressourcen-IDs sind Hex (Container/Image/Volume/Network) oder Namen.
 * Wir erlauben bewusst nur ein enges Zeichenset, um Injection über IDs zu verhindern.
 */
export const DockerIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, 'Ungültige Docker-Ressourcen-ID');

/** Endpoint-IDs sind UUIDs bzw. `local` für den eingebauten Socket. */
export const EndpointIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, 'Ungültige Endpoint-ID');

/** Einheitliches Fehlerformat der gesamten API. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const OkSchema = z.object({ ok: z.literal(true) });
export type Ok = z.infer<typeof OkSchema>;

/** Standard-Query für Ressourcen-Listen. */
export const ListQuerySchema = z.object({
  endpoint: EndpointIdSchema.default('local'),
});
export type ListQuery = z.infer<typeof ListQuerySchema>;

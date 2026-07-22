import { z } from 'zod';

/** Öffentliche Registry-Info (ohne Secret). */
export const RegistrySchema = z.object({
  registry: z.string(),
  username: z.string(),
  createdAt: z.string(),
});
export type Registry = z.infer<typeof RegistrySchema>;

/** Anmeldung an einer Registry (Docker Hub = 'docker.io'). Secret = Passwort oder Token. */
export const RegistryLoginSchema = z.object({
  registry: z.string().min(1).max(255).default('docker.io'),
  username: z.string().min(1).max(255),
  secret: z.string().min(1).max(4096),
});
export type RegistryLogin = z.infer<typeof RegistryLoginSchema>;

/** Ein Treffer der Image-Autocomplete (eigenes/privates Repo oder öffentlicher Hub-Treffer). */
export const ImageSearchResultSchema = z.object({
  name: z.string(), // vollständige Referenz, z.B. "amslertec/watchwish_v2" oder "nginx"
  description: z.string(),
  stars: z.number(),
  pulls: z.number(),
  official: z.boolean(),
  isPrivate: z.boolean(),
  source: z.enum(['own', 'hub']),
});
export type ImageSearchResult = z.infer<typeof ImageSearchResultSchema>;

/** Ergebnis der kombinierten Image-Suche (eigene zuerst, dann öffentliche). */
export const ImageSearchResponseSchema = z.object({
  own: z.array(ImageSearchResultSchema),
  hub: z.array(ImageSearchResultSchema),
});
export type ImageSearchResponse = z.infer<typeof ImageSearchResponseSchema>;

/** Ein Tag eines Repos (für die Tag-Auswahl nach der Repo-Auswahl). */
export const ImageTagSchema = z.object({
  name: z.string(),
  lastUpdated: z.string().nullable(),
  size: z.number().nullable(),
});
export type ImageTag = z.infer<typeof ImageTagSchema>;

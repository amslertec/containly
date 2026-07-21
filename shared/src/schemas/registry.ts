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

import { z } from 'zod';
import { EndpointIdSchema } from './common.js';

/**
 * Docker-Endpoint-Typen.
 * - `socket`: lokaler Unix-Socket (eingebauter `local`-Endpoint).
 * - `tcp`: TCP mit TLS-Client-Zertifikaten. Unverschlüsseltes 2375 ist NICHT erlaubt.
 * - `ssh`: Docker über SSH (Passwort- oder Key-Authentifizierung).
 */
export const EndpointTypeSchema = z.enum(['socket', 'tcp', 'ssh']);
export type EndpointType = z.infer<typeof EndpointTypeSchema>;

/** TLS-Material für TCP-Endpoints. Wird serverseitig verschlüsselt abgelegt. */
export const EndpointTlsSchema = z.object({
  ca: z.string().min(1).max(64 * 1024),
  cert: z.string().min(1).max(64 * 1024),
  key: z.string().min(1).max(64 * 1024),
});
export type EndpointTls = z.infer<typeof EndpointTlsSchema>;

export const SshAuthSchema = z.enum(['password', 'key']);
export type SshAuth = z.infer<typeof SshAuthSchema>;

const endpointFields = {
  name: z.string().min(1).max(64),
  // TCP
  host: z.string().max(255).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  tls: EndpointTlsSchema.optional(),
  // SSH
  sshHost: z.string().max(255).optional(),
  sshPort: z.number().int().min(1).max(65535).optional(),
  sshUser: z.string().max(64).optional(),
  sshAuth: SshAuthSchema.optional(),
  sshPassword: z.string().max(1024).optional(),
  sshPrivateKey: z.string().max(64 * 1024).optional(),
  sshPassphrase: z.string().max(1024).optional(),
  // Verzeichnisse (für Containly erreichbar), in denen Compose-Projekte dieses Hosts liegen.
  stackPaths: z.array(z.string().min(1).max(1024)).max(50).optional(),
};

export const CreateEndpointSchema = z
  .object({ type: EndpointTypeSchema, ...endpointFields })
  .superRefine((val, ctx) => {
    if (val.type === 'tcp') {
      if (!val.host) ctx.addIssue({ code: 'custom', path: ['host'], message: 'Host erforderlich' });
      if (!val.tls)
        ctx.addIssue({
          code: 'custom',
          path: ['tls'],
          message: 'TLS-Client-Zertifikate sind für TCP verpflichtend',
        });
    }
    if (val.type === 'ssh') {
      if (!val.sshHost)
        ctx.addIssue({ code: 'custom', path: ['sshHost'], message: 'SSH-Host erforderlich' });
      if (!val.sshUser)
        ctx.addIssue({ code: 'custom', path: ['sshUser'], message: 'SSH-User erforderlich' });
      if (val.sshAuth === 'password' && !val.sshPassword)
        ctx.addIssue({ code: 'custom', path: ['sshPassword'], message: 'Passwort erforderlich' });
      if (val.sshAuth === 'key' && !val.sshPrivateKey)
        ctx.addIssue({
          code: 'custom',
          path: ['sshPrivateKey'],
          message: 'Privater Schlüssel erforderlich',
        });
      if (!val.sshAuth)
        ctx.addIssue({ code: 'custom', path: ['sshAuth'], message: 'Authentifizierung wählen' });
    }
  });
export type CreateEndpoint = z.infer<typeof CreateEndpointSchema>;

/**
 * Update: `name` ist Pflicht, Rest optional. Geheimnis-Felder (tls/sshPassword/sshPrivateKey)
 * bleiben unverändert, wenn sie leer/ausgelassen sind — der Typ ist nach dem Anlegen fix.
 */
export const UpdateEndpointSchema = z.object(endpointFields);
export type UpdateEndpoint = z.infer<typeof UpdateEndpointSchema>;

export const EndpointStatusSchema = z.enum(['online', 'offline', 'unauthorized', 'unknown']);
export type EndpointStatus = z.infer<typeof EndpointStatusSchema>;

/** Öffentliche Endpoint-Darstellung — niemals Key-Material nach außen. */
export const EndpointSchema = z.object({
  id: EndpointIdSchema,
  name: z.string(),
  type: EndpointTypeSchema,
  host: z.string().nullable(),
  port: z.number().nullable(),
  status: EndpointStatusSchema,
  dockerVersion: z.string().nullable(),
  lastCheckedAt: z.string().nullable(),
  builtin: z.boolean(),
  /** Nur für SSH gesetzt: welche Auth-Methode hinterlegt ist (kein Geheimnis). */
  sshAuth: SshAuthSchema.nullable(),
  sshUser: z.string().nullable(),
  /** Konfigurierte Compose-Verzeichnisse dieses Hosts. */
  stackPaths: z.array(z.string()),
});
export type Endpoint = z.infer<typeof EndpointSchema>;

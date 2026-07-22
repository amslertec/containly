import { z } from 'zod';

/** Eine Template-Quelle (URL im Portainer-templates.json-Format). */
export const CatalogSourceSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  url: z.string(),
  enabled: z.boolean(),
});
export type CatalogSource = z.infer<typeof CatalogSourceSchema>;

export const CatalogSourceInputSchema = z.object({
  name: z.string().min(1).max(120),
  url: z.string().url().max(1024),
  enabled: z.boolean().optional(),
});
export type CatalogSourceInput = z.infer<typeof CatalogSourceInputSchema>;

/** Ein Umgebungs-Variablen-Feld eines Templates. */
export const CatalogEnvVarSchema = z.object({
  name: z.string(),
  label: z.string().optional(),
  default: z.string().optional(),
});
export type CatalogEnvVar = z.infer<typeof CatalogEnvVarSchema>;

/** Ein normalisiertes Katalog-Template (aus dem Portainer-Format übersetzt). */
export const CatalogTemplateSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  logo: z.string(),
  categories: z.array(z.string()),
  image: z.string(),
  ports: z.array(z.string()),
  env: z.array(CatalogEnvVarSchema),
  volumes: z.array(z.string()),
  restartPolicy: z.string(),
  note: z.string(),
  source: z.string(),
});
export type CatalogTemplate = z.infer<typeof CatalogTemplateSchema>;

/** Deploy-Eingabe: eine Vorlage als Stack in einen Endpoint + Pfad ausrollen. */
export const DeployTemplateSchema = z.object({
  endpoint: z.string().min(1).max(64),
  basePath: z.string().min(1).max(1024),
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Ungültiger Name'),
  templateId: z.string().min(1).max(200),
  env: z.record(z.string(), z.string()).optional(),
});
export type DeployTemplate = z.infer<typeof DeployTemplateSchema>;

import { z } from 'zod';
import { RoleSchema } from './common.js';

/**
 * Passwort-Policy. Bewusst streng, da die App root-äquivalenten Socket-Zugriff hat.
 * Diese Regeln werden serverseitig UND clientseitig (Stärke-Anzeige) verwendet.
 */
export const PasswordSchema = z
  .string()
  .min(12, 'Mindestens 12 Zeichen')
  .max(200, 'Höchstens 200 Zeichen')
  .refine((v) => /[a-z]/.test(v), 'Mindestens ein Kleinbuchstabe')
  .refine((v) => /[A-Z]/.test(v), 'Mindestens ein Großbuchstabe')
  .refine((v) => /[0-9]/.test(v), 'Mindestens eine Ziffer')
  .refine((v) => /[^A-Za-z0-9]/.test(v), 'Mindestens ein Sonderzeichen');

export const UsernameSchema = z
  .string()
  .min(3, 'Mindestens 3 Zeichen')
  .max(32, 'Höchstens 32 Zeichen')
  .regex(/^[a-zA-Z0-9._-]+$/, 'Nur Buchstaben, Ziffern, . _ -');

/**
 * Erster Admin-User im Setup-Flow. Der `setupToken` wird beim ersten Start
 * generiert und in den Server-Logs ausgegeben — er schließt die Race-Lücke
 * zwischen Deployment und erstem Login (analog zu Jenkins' Initial-Admin-Password).
 */
export const SetupRequestSchema = z.object({
  username: UsernameSchema,
  password: PasswordSchema,
  setupToken: z.string().min(1, 'Setup-Token erforderlich').max(200),
});
export type SetupRequest = z.infer<typeof SetupRequestSchema>;

export const LoginRequestSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/** Öffentliche Nutzer-Repräsentation — niemals Hash o. Ä. nach außen. */
export const UserSchema = z.object({
  id: z.number().int().positive(),
  username: z.string(),
  role: RoleSchema,
  createdAt: z.string(),
  totpEnabled: z.boolean(),
});
export type User = z.infer<typeof UserSchema>;

/* ── Zwei-Faktor-Authentifizierung (TOTP) ─────────────────────────────────── */

/** 6-stelliger TOTP-Code. */
export const TotpCodeSchema = z.string().regex(/^\d{6}$/, 'Sechsstelliger Code erforderlich');

/** 2FA-Setup-Antwort: otpauth-URL + Secret (manuelle Eingabe) + QR (Data-URI). */
export const TwoFactorSetupSchema = z.object({
  secret: z.string(),
  otpauthUrl: z.string(),
  qr: z.string(),
});
export type TwoFactorSetup = z.infer<typeof TwoFactorSetupSchema>;

export const TwoFactorEnableSchema = z.object({ code: TotpCodeSchema });
export type TwoFactorEnable = z.infer<typeof TwoFactorEnableSchema>;

/** Deaktivieren erfordert Passwort + gültigen Code (TOTP oder Recovery). */
export const TwoFactorDisableSchema = z.object({
  password: z.string().min(1).max(200),
  code: z.string().min(6).max(20),
});
export type TwoFactorDisable = z.infer<typeof TwoFactorDisableSchema>;

/** Zweiter Login-Schritt: kurzlebiges Ticket + Code (TOTP oder Recovery). */
export const LoginTwoFactorSchema = z.object({
  ticket: z.string().min(1).max(512),
  code: z.string().min(6).max(20),
});
export type LoginTwoFactor = z.infer<typeof LoginTwoFactorSchema>;

/** Antwort auf GET /api/auth/me und /api/setup/status. */
export const AuthStateSchema = z.object({
  setupComplete: z.boolean(),
  user: UserSchema.nullable(),
});
export type AuthState = z.infer<typeof AuthStateSchema>;

/** Antwort auf GET /api/setup/status (nur im Setup-Modus relevant). */
export const SetupStatusSchema = z.object({
  setupComplete: z.boolean(),
});
export type SetupStatus = z.infer<typeof SetupStatusSchema>;

export const CreateUserSchema = z.object({
  username: UsernameSchema,
  password: PasswordSchema,
  role: RoleSchema,
});
export type CreateUser = z.infer<typeof CreateUserSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: PasswordSchema,
});
export type ChangePassword = z.infer<typeof ChangePasswordSchema>;

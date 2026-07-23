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
  // Optionale E-Mail für Login (alternativ zum Benutzernamen) + Benachrichtigungen.
  email: z
    .string()
    .max(255)
    .refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Ungültige E-Mail-Adresse')
    .optional(),
});
export type SetupRequest = z.infer<typeof SetupRequestSchema>;

export const LoginRequestSchema = z.object({
  // Benutzername ODER E-Mail-Adresse.
  username: z.string().min(1).max(255),
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/** Öffentliche Nutzer-Repräsentation — niemals Hash o. Ä. nach außen. */
/** Unterstützte Oberflächen-/E-Mail-Sprachen. */
export const LocaleSchema = z.enum(['de', 'en']);
export type Locale = z.infer<typeof LocaleSchema>;

export const UserSchema = z.object({
  id: z.number().int().positive(),
  username: z.string(),
  role: RoleSchema,
  createdAt: z.string(),
  totpEnabled: z.boolean(),
  email: z.string().nullable(),
  language: LocaleSchema.nullable(),
});
export type User = z.infer<typeof UserSchema>;

/** Sprachwahl eines Benutzers (persistiert serverseitig für E-Mails). */
export const UpdateLanguageSchema = z.object({ language: LocaleSchema });
export type UpdateLanguage = z.infer<typeof UpdateLanguageSchema>;

/** Eine aktive Sitzung (für die Sitzungsverwaltung im Profil). */
export const SessionInfoSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  lastSeen: z.number(),
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
  current: z.boolean(),
});
export type SessionInfo = z.infer<typeof SessionInfoSchema>;

/** Optionale E-Mail-Adresse (leer erlaubt = keine Adresse). */
export const EmailSchema = z
  .string()
  .max(255)
  .refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Ungültige E-Mail-Adresse');

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
  email: EmailSchema.optional(),
});
export type CreateUser = z.infer<typeof CreateUserSchema>;

/* ── Einladungen (User per E-Mail-Link erstellen) ─────────────────────────── */

/** Pflicht-E-Mail (nicht leer) — die Einladung geht an genau diese Adresse. */
export const RequiredEmailSchema = z
  .string()
  .max(255)
  .refine((v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Ungültige E-Mail-Adresse');

/** Admin erstellt eine Einladung: E-Mail + Rolle + Sprache (steuert Mail & Annahme-Seite). */
export const InviteCreateSchema = z.object({
  email: RequiredEmailSchema,
  role: RoleSchema,
  language: LocaleSchema,
});
export type InviteCreate = z.infer<typeof InviteCreateSchema>;

/** Antwort nach dem Erstellen: der Annahme-Link + ob eine Mail versendet wurde. */
export const InviteCreatedSchema = z.object({
  url: z.string(),
  emailed: z.boolean(),
  expiresAt: z.number(),
});
export type InviteCreated = z.infer<typeof InviteCreatedSchema>;

/** Öffentliche Info zur Vorausfüllung/Sprachwahl der Annahme-Seite (kein Auth). */
export const InviteInfoSchema = z.object({
  email: z.string(),
  role: RoleSchema,
  language: LocaleSchema,
});
export type InviteInfo = z.infer<typeof InviteInfoSchema>;

/** Der Eingeladene setzt Username + Passwort (E-Mail/Rolle stammen aus der Einladung). */
export const InviteAcceptSchema = z.object({
  username: UsernameSchema,
  password: PasswordSchema,
});
export type InviteAccept = z.infer<typeof InviteAcceptSchema>;

/** Offene Einladung in der Admin-Übersicht. */
export const PendingInviteSchema = z.object({
  id: z.number(),
  email: z.string(),
  role: RoleSchema,
  createdAt: z.string(),
  expiresAt: z.number(),
});
export type PendingInvite = z.infer<typeof PendingInviteSchema>;

/** Aktualisierung der E-Mail-Adresse eines Benutzers (Admin). */
export const UpdateUserEmailSchema = z.object({ email: EmailSchema });
export type UpdateUserEmail = z.infer<typeof UpdateUserEmailSchema>;

/** Aktualisierung der Rolle eines Benutzers (Admin). */
export const UpdateUserRoleSchema = z.object({ role: RoleSchema });
export type UpdateUserRole = z.infer<typeof UpdateUserRoleSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: PasswordSchema,
});
export type ChangePassword = z.infer<typeof ChangePasswordSchema>;

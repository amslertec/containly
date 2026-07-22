import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  NOTIFICATION_TYPES,
  NotificationSettingInputSchema,
  SmtpConfigInputSchema,
} from '@containly/shared';
import { getSmtpConfig, saveSmtpConfig, sendTestEmail } from '../services/mailer.js';
import {
  listNotificationSettings,
  updateNotificationSetting,
} from '../services/notifications.js';
import { getFeed, markFeedRead } from '../services/inapp.js';
import { currentUser, requireAdmin, requireAuth } from '../plugins/auth.js';
import { getUserById } from '../services/users.js';
import { audit } from '../services/audit.js';
import { Errors } from '../errors.js';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  // In-App-Feed (alle angemeldeten Benutzer): letzte Ereignisse + Ungelesen-Zähler.
  app.get('/api/notifications/feed', { preHandler: requireAuth }, async (req) => {
    const { items, unread } = getFeed(currentUser(req).userId);
    return { items, unread };
  });

  // Feed als gelesen markieren.
  app.post('/api/notifications/feed/read', { preHandler: requireAuth }, async (req) => {
    markFeedRead(currentUser(req).userId);
    return { ok: true as const };
  });

  // SMTP-Konfiguration (ohne Passwort) lesen.
  app.get('/api/notifications/smtp', { preHandler: requireAdmin }, async () => getSmtpConfig());

  app.put('/api/notifications/smtp', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const body = SmtpConfigInputSchema.parse(req.body);
    saveSmtpConfig(body);
    audit({ userId: ctx.userId, username: ctx.username, action: 'smtp.update', ip: req.ip });
    return { ok: true as const };
  });

  // Test-E-Mail an eine Adresse senden.
  app.post('/api/notifications/smtp/test', { preHandler: requireAdmin }, async (req) => {
    const { to } = z.object({ to: z.string().email() }).parse(req.body);
    // Test-E-Mail in der Sprache des auslösenden Admins.
    const lang = getUserById(currentUser(req).userId)?.language ?? 'en';
    try {
      const result = await sendTestEmail(to, lang);
      // Vom Server abgelehnte Empfänger sind ein echtes Problem → als Fehler melden.
      if (result.rejected.length > 0) {
        throw Errors.badRequest(
          `SMTP-Server hat den Empfänger abgelehnt: ${result.rejected.join(', ')}`,
        );
      }
      return { ok: true as const, ...result };
    } catch (err) {
      if (err instanceof Error && 'statusCode' in err) throw err;
      throw Errors.badRequest(
        `Test-E-Mail fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  // Einstellungen aller Benachrichtigungstypen.
  app.get('/api/notifications/settings', { preHandler: requireAdmin }, async () => ({
    settings: listNotificationSettings(),
  }));

  app.put('/api/notifications/settings/:type', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { type } = z.object({ type: z.enum(NOTIFICATION_TYPES) }).parse(req.params);
    const body = NotificationSettingInputSchema.parse(req.body);
    updateNotificationSetting(type, body);
    audit({ userId: ctx.userId, username: ctx.username, action: 'notification.update', target: type, ip: req.ip });
    return { ok: true as const };
  });
}

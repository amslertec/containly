import type { FastifyInstance } from 'fastify';
import { BackupRequestSchema, RestoreRequestSchema } from '@containly/shared';
import { createBackup, restoreBackup } from '../services/backup.js';
import { currentUser, requireAdmin } from '../plugins/auth.js';
import { audit } from '../services/audit.js';
import { Errors } from '../errors.js';

export async function backupRoutes(app: FastifyInstance): Promise<void> {
  // Backup erstellen (verschlüsselt) — als {filename, data} zum Download.
  app.post('/api/backup', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { passphrase } = BackupRequestSchema.parse(req.body);
    const result = createBackup(passphrase);
    audit({ userId: ctx.userId, username: ctx.username, action: 'backup.create', ip: req.ip });
    return result;
  });

  // Restore — ERSETZT Users/Endpoints/Audit-Log + Schlüssel. Größeres Body-Limit.
  app.post(
    '/api/backup/restore',
    { preHandler: requireAdmin, bodyLimit: 64 * 1024 * 1024 },
    async (req) => {
      const ctx = currentUser(req);
      const { data, passphrase } = RestoreRequestSchema.parse(req.body);
      try {
        const counts = restoreBackup(data, passphrase);
        // Nach dem Restore existiert der ausführende User evtl. nicht mehr → Audit best effort.
        try {
          audit({ userId: ctx.userId, username: ctx.username, action: 'backup.restore', ip: req.ip });
        } catch {
          /* Audit-Tabelle wurde ersetzt — ignorieren */
        }
        return { ok: true as const, counts };
      } catch (err) {
        try {
          audit({ userId: ctx.userId, username: ctx.username, action: 'backup.restore', outcome: 'error', ip: req.ip });
        } catch {
          /* ignorieren */
        }
        throw Errors.badRequest(err instanceof Error ? err.message : 'Restore fehlgeschlagen');
      }
    },
  );
}

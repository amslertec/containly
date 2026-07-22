import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SCHEDULE_JOB_TYPES, ScheduledJobInputSchema } from '@containly/shared';
import { listScheduledJobs, updateScheduledJob, runJobNow } from '../services/scheduler.js';
import { currentUser, requireAdmin } from '../plugins/auth.js';
import { audit } from '../services/audit.js';

export async function scheduleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/schedule', { preHandler: requireAdmin }, async () => ({
    jobs: listScheduledJobs(),
  }));

  app.put('/api/schedule/:type', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { type } = z.object({ type: z.enum(SCHEDULE_JOB_TYPES) }).parse(req.params);
    const body = ScheduledJobInputSchema.parse(req.body);
    updateScheduledJob(type, body);
    audit({ userId: ctx.userId, username: ctx.username, action: 'schedule.update', target: type, ip: req.ip });
    return { ok: true as const };
  });

  // Job sofort ausführen (manuell).
  app.post('/api/schedule/:type/run', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { type } = z.object({ type: z.enum(SCHEDULE_JOB_TYPES) }).parse(req.params);
    audit({ userId: ctx.userId, username: ctx.username, action: 'schedule.run', target: type, ip: req.ip });
    return { job: await runJobNow(type) };
  });
}

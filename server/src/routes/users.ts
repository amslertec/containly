import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateUserSchema } from '@containly/shared';
import {
  adminCount,
  createUser,
  deleteUser,
  getUserById,
  getUserRowByUsername,
  listUsers,
} from '../services/users.js';
import { destroyAllUserSessions } from '../services/sessions.js';
import { currentUser, requireAdmin } from '../plugins/auth.js';
import { audit } from '../services/audit.js';
import { Errors } from '../errors.js';

const IdParams = z.object({ id: z.coerce.number().int().positive() });

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/users', { preHandler: requireAdmin }, async () => ({ users: listUsers() }));

  app.post('/api/users', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const body = CreateUserSchema.parse(req.body);
    if (getUserRowByUsername(body.username)) throw Errors.conflict('Benutzername bereits vergeben');
    const user = await createUser(body.username, body.password, body.role);
    audit({ userId: ctx.userId, username: ctx.username, action: 'user.create', target: user.username, detail: { role: user.role }, ip: req.ip });
    return { user };
  });

  app.delete('/api/users/:id', { preHandler: requireAdmin }, async (req) => {
    const ctx = currentUser(req);
    const { id } = IdParams.parse(req.params);
    const target = getUserById(id);
    if (!target) throw Errors.notFound('Benutzer nicht gefunden');
    if (id === ctx.userId) throw Errors.badRequest('Eigenes Konto kann nicht gelöscht werden');
    if (target.role === 'admin' && adminCount() <= 1)
      throw Errors.badRequest('Der letzte Administrator kann nicht gelöscht werden');

    destroyAllUserSessions(id);
    deleteUser(id);
    audit({ userId: ctx.userId, username: ctx.username, action: 'user.delete', target: target.username, ip: req.ip });
    return { ok: true as const };
  });
}

import type { FastifyInstance } from 'fastify';
import { SetupRequestSchema } from '@containly/shared';
import { createUser, setupComplete } from '../services/users.js';
import { consumeSetupToken, verifySetupToken } from '../services/setup-token.js';
import { createSession } from '../services/sessions.js';
import { setSessionCookie } from '../plugins/auth.js';
import { audit } from '../services/audit.js';
import { Errors } from '../errors.js';

export async function setupRoutes(app: FastifyInstance): Promise<void> {
  // Status: zeigt, ob die App noch im Setup-Modus ist.
  app.get('/api/setup/status', async () => ({ setupComplete: setupComplete() }));

  // Ersten Admin anlegen — nur solange kein User existiert und mit gültigem Token.
  app.post('/api/setup', async (req, reply) => {
    if (setupComplete()) throw Errors.setupDone();

    const body = SetupRequestSchema.parse(req.body);
    if (!verifySetupToken(body.setupToken)) {
      audit({
        userId: null,
        username: body.username,
        action: 'setup',
        outcome: 'denied',
        ip: req.ip,
        detail: { reason: 'invalid_token' },
      });
      throw Errors.forbidden('Ungültiger Setup-Token');
    }

    const user = await createUser(body.username, body.password, 'admin', body.email);
    consumeSetupToken();

    const { token, csrfToken } = createSession(user.id, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    setSessionCookie(reply, token);

    audit({ userId: user.id, username: user.username, action: 'setup', ip: req.ip });
    return reply.status(201).send({ user, csrfToken });
  });
}

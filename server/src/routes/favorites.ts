import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { addFavorite, listFavorites, removeFavorite } from '../services/favorites.js';
import { currentUser, requireAuth } from '../plugins/auth.js';

const BodySchema = z.object({
  endpoint: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
});

export async function favoriteRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/favorites', { preHandler: requireAuth }, async (req) => ({
    favorites: listFavorites(currentUser(req).userId),
  }));

  app.post('/api/favorites', { preHandler: requireAuth }, async (req) => {
    const { endpoint, name } = BodySchema.parse(req.body);
    addFavorite(currentUser(req).userId, endpoint, name);
    return { ok: true as const };
  });

  app.delete('/api/favorites', { preHandler: requireAuth }, async (req) => {
    const { endpoint, name } = BodySchema.parse(req.query);
    removeFavorite(currentUser(req).userId, endpoint, name);
    return { ok: true as const };
  });
}

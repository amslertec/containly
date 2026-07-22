import { db } from '../db/index.js';

/**
 * Angepinnte Container je Benutzer. Gepinnt wird nach Endpoint + Container-Name
 * (nicht ID), damit ein Favorit einen Recreate/Update übersteht.
 */

export interface Favorite {
  endpoint: string;
  name: string;
}

export function listFavorites(userId: number): Favorite[] {
  return db
    .prepare('SELECT endpoint, name FROM favorites WHERE user_id = ?')
    .all(userId) as Favorite[];
}

export function addFavorite(userId: number, endpoint: string, name: string): void {
  db.prepare(
    'INSERT OR IGNORE INTO favorites (user_id, endpoint, name) VALUES (?, ?, ?)',
  ).run(userId, endpoint, name);
}

export function removeFavorite(userId: number, endpoint: string, name: string): void {
  db.prepare('DELETE FROM favorites WHERE user_id = ? AND endpoint = ? AND name = ?').run(
    userId,
    endpoint,
    name,
  );
}

import type { FeedItem, NotificationSeverity, NotificationType } from '@containly/shared';
import { db } from '../db/index.js';

/**
 * In-App-Benachrichtigungs-Feed: globale Ereignisliste (vom Monitor gefüllt) mit
 * per-Benutzer-Lesestatus (Zeitpunkt, bis zu dem alles gelesen ist). Der Feed wird auf
 * die letzten FEED_KEEP Einträge begrenzt.
 */

const FEED_KEEP = 200;

interface FeedRow {
  id: number;
  type: string;
  severity: string;
  target: string;
  detail: string;
  link: string;
  created_at: number;
}

const insertStmt = db.prepare(
  `INSERT INTO notifications_feed (type, severity, target, detail, link, created_at)
   VALUES (@type, @severity, @target, @detail, @link, @created)`,
);

/** Fügt eine In-App-Benachrichtigung hinzu und beschränkt den Feed auf FEED_KEEP. */
export function addFeedItem(item: {
  type: NotificationType;
  severity: NotificationSeverity;
  target: string;
  detail: string;
  link: string;
}): void {
  insertStmt.run({ ...item, created: Date.now() });
  db.prepare(
    `DELETE FROM notifications_feed WHERE id NOT IN (
       SELECT id FROM notifications_feed ORDER BY id DESC LIMIT ${FEED_KEEP}
     )`,
  ).run();
}

function lastRead(userId: number): number {
  const r = db.prepare('SELECT last_read_at FROM notification_reads WHERE user_id = ?').get(userId) as
    | { last_read_at: number }
    | undefined;
  return r?.last_read_at ?? 0;
}

/** Neueste Feed-Einträge (limit) + Anzahl ungelesener für den Benutzer. */
export function getFeed(userId: number, limit = 50): { items: FeedItem[]; unread: number } {
  const rows = db
    .prepare('SELECT * FROM notifications_feed ORDER BY id DESC LIMIT ?')
    .all(limit) as FeedRow[];
  const since = lastRead(userId);
  const items: FeedItem[] = rows.map((r) => ({
    id: r.id,
    type: r.type as NotificationType,
    severity: r.severity as NotificationSeverity,
    target: r.target,
    detail: r.detail,
    link: r.link,
    createdAt: r.created_at,
  }));
  const unread = (
    db.prepare('SELECT COUNT(*) AS c FROM notifications_feed WHERE created_at > ?').get(since) as {
      c: number;
    }
  ).c;
  return { items, unread };
}

/** Markiert alle Einträge für den Benutzer als gelesen. */
export function markFeedRead(userId: number): void {
  db.prepare(
    `INSERT INTO notification_reads (user_id, last_read_at) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET last_read_at = excluded.last_read_at`,
  ).run(userId, Date.now());
}

import { db } from '../db/index.js';

export interface AuditEntry {
  userId: number | null;
  username: string | null;
  action: string;
  endpointId?: string | null;
  target?: string | null;
  detail?: unknown;
  ip?: string | null;
  outcome?: 'ok' | 'error' | 'denied';
}

const stmt = db.prepare(
  `INSERT INTO audit_log (user_id, username, action, endpoint_id, target, detail, ip, outcome)
   VALUES (@userId, @username, @action, @endpointId, @target, @detail, @ip, @outcome)`,
);

/** Schreibt einen Audit-Eintrag. Fehler hier dürfen die eigentliche Aktion nie blockieren. */
export function audit(entry: AuditEntry): void {
  try {
    stmt.run({
      userId: entry.userId,
      username: entry.username,
      action: entry.action,
      endpointId: entry.endpointId ?? null,
      target: entry.target ?? null,
      detail: entry.detail === undefined ? null : JSON.stringify(entry.detail),
      ip: entry.ip ?? null,
      outcome: entry.outcome ?? 'ok',
    });
  } catch {
    /* Audit darf niemals die Operation abbrechen */
  }
}

export interface AuditRow {
  id: number;
  ts: string;
  username: string | null;
  action: string;
  endpoint_id: string | null;
  target: string | null;
  detail: string | null;
  ip: string | null;
  outcome: string;
}

export function listAudit(limit = 200, offset = 0): AuditRow[] {
  return db
    .prepare(
      `SELECT id, ts, username, action, endpoint_id, target, detail, ip, outcome
       FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?`,
    )
    .all(Math.min(limit, 1000), offset) as AuditRow[];
}

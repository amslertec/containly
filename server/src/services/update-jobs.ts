import type { BulkJob } from '@containly/shared';
import { checkUpdates } from '../docker/updates.js';
import { applyImageUpdate } from '../docker/resources.js';
import { logger } from '../logger.js';

/**
 * Serverseitiger Bulk-Update-Job je Endpoint. Läuft im Hintergrund weiter,
 * auch wenn der Client die Seite neu lädt — die UI pollt nur den Status.
 */
const jobs = new Map<string, BulkJob>();

export function getBulkJob(endpoint: string): BulkJob {
  return (
    jobs.get(endpoint) ?? {
      endpoint,
      total: 0,
      done: 0,
      current: null,
      status: 'idle',
      errors: [],
    }
  );
}

/** Startet (oder liefert den laufenden) Bulk-Job: zieht alle offenen Updates nacheinander. */
export async function startBulkUpdate(endpoint: string): Promise<BulkJob> {
  const existing = jobs.get(endpoint);
  if (existing && existing.status === 'running') return existing;

  const updates = await checkUpdates(endpoint, false);
  const pending = updates.items.filter((i) => i.updateAvailable).map((i) => i.image);

  const job: BulkJob = {
    endpoint,
    total: pending.length,
    done: 0,
    current: null,
    status: pending.length === 0 ? 'done' : 'running',
    errors: [],
  };
  jobs.set(endpoint, job);
  if (pending.length === 0) return job;

  void (async () => {
    for (const image of pending) {
      job.current = image;
      try {
        await applyImageUpdate(endpoint, image);
      } catch (e) {
        job.errors.push({ image, error: e instanceof Error ? e.message : String(e) });
      }
      job.done++;
    }
    job.current = null;
    job.status = 'done';
    // Frische Prüfung → erledigte Updates verschwinden aus der Liste.
    try {
      await checkUpdates(endpoint, true);
    } catch {
      /* Registry-Fehler ignorieren */
    }
    logger.info({ endpoint, done: job.done, errors: job.errors.length }, 'Bulk-Update abgeschlossen');
  })();

  return job;
}

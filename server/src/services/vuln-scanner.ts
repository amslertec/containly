import type { CveDetail, ImageVuln, VulnDetails, VulnScanState } from '@containly/shared';
import { db } from '../db/index.js';
import { listImages } from '../docker/resources.js';
import { listEndpoints } from '../docker/endpoints.js';
import { scanImage } from './trivy.js';
import { notifyNewVulns } from './monitor.js';
import { logger } from '../logger.js';

/**
 * Hintergrund-Scanner: scannt die Images jedes Online-Endpoints nacheinander mit Trivy
 * (über den Helfer-Container) und cached die Ergebnisse in der DB. Neu aufgetauchte oder
 * veraltete (> RESCAN_TTL) Images werden erneut gescannt. Bewusst sequenziell + gedrosselt,
 * um den Host nicht zu überlasten.
 */

const RESCAN_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const THROTTLE_MS = 1500; // Pause zwischen zwei Scans

// Fortschritt je Endpoint (für die UI), plus „läuft gerade".
const progress = new Map<string, { scanning: boolean; done: number; total: number }>();
const scanningIds = new Set<string>(); // `${endpoint}:${imageId}` aktuell in Arbeit

interface VulnRow {
  image_id: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  status: string;
  scanned_at: string;
  details?: string;
}

// Zahlen-Spalten getrennt vom (potenziell großen) details-JSON abfragen.
const selectByEndpoint = db.prepare(
  'SELECT image_id, critical, high, medium, low, status, scanned_at FROM image_vulns WHERE endpoint = ?',
);
const selectDetails = db.prepare(
  'SELECT details, scanned_at FROM image_vulns WHERE endpoint = ? AND image_id = ?',
);
const upsert = db.prepare(`
  INSERT INTO image_vulns (endpoint, image_id, critical, high, medium, low, status, details, scanned_at)
  VALUES (@endpoint, @image_id, @critical, @high, @medium, @low, @status, @details, datetime('now'))
  ON CONFLICT(endpoint, image_id) DO UPDATE SET
    critical = excluded.critical, high = excluded.high, medium = excluded.medium,
    low = excluded.low, status = excluded.status, details = excluded.details,
    scanned_at = excluded.scanned_at
`);

// Sortierung fürs Modal: Schweregrad absteigend.
const SEV_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4 };

/** Detaillierte CVE-Liste eines Images (aus dem gecachten Scan). */
export function getVulnDetails(endpoint: string, imageId: string): VulnDetails {
  const row = selectDetails.get(endpoint, imageId) as { details?: string; scanned_at?: string } | undefined;
  let cves: CveDetail[] = [];
  if (row?.details) {
    try {
      cves = JSON.parse(row.details) as CveDetail[];
      cves.sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));
    } catch {
      cves = [];
    }
  }
  return { imageId, scannedAt: row?.scanned_at ?? null, cves };
}
const deleteStale = db.prepare(
  `DELETE FROM image_vulns WHERE endpoint = ? AND image_id NOT IN (SELECT value FROM json_each(?))`,
);

function rowToVuln(r: VulnRow, live: boolean): ImageVuln {
  return {
    imageId: r.image_id,
    critical: r.critical,
    high: r.high,
    medium: r.medium,
    low: r.low,
    scannedAt: r.scanned_at,
    status: live ? 'scanning' : (r.status === 'error' ? 'error' : 'ok'),
  };
}

/** Aktueller Vuln-Zustand eines Endpoints (gecachte Ergebnisse + Scan-Fortschritt). */
export function getVulnState(endpoint: string): VulnScanState {
  const rows = selectByEndpoint.all(endpoint) as VulnRow[];
  const vulns = rows.map((r) => rowToVuln(r, scanningIds.has(`${endpoint}:${r.image_id}`)));
  const p = progress.get(endpoint) ?? { scanning: false, done: 0, total: 0 };
  return { scanning: p.scanning, done: p.done, total: p.total, vulns };
}

function needsScan(existing: VulnRow | undefined): boolean {
  if (!existing) return true;
  const age = Date.now() - new Date(existing.scanned_at + 'Z').getTime();
  return existing.status === 'error' ? age > 60 * 60 * 1000 : age > RESCAN_TTL_MS;
}

async function scanEndpoint(endpoint: string, endpointName = endpoint): Promise<void> {
  let images;
  try {
    images = await listImages(endpoint);
  } catch (err) {
    logger.debug({ err, endpoint }, 'Vuln-Scan: Images konnten nicht gelistet werden');
    return;
  }
  // Nur getaggte Images scannen (dangling per ID ist selten sinnvoll und oft nicht auflösbar).
  const scannable = images.filter((i) => i.repoTags.length > 0);

  // Verwaiste Cache-Einträge (Image existiert nicht mehr) entfernen.
  try {
    deleteStale.run(endpoint, JSON.stringify(images.map((i) => i.id)));
  } catch {
    /* json_each nicht verfügbar → ignorieren */
  }

  const existing = new Map(
    (selectByEndpoint.all(endpoint) as VulnRow[]).map((r) => [r.image_id, r]),
  );
  const todo = scannable.filter((i) => needsScan(existing.get(i.id)));

  progress.set(endpoint, { scanning: true, done: 0, total: todo.length });
  if (todo.length === 0) {
    progress.set(endpoint, { scanning: false, done: 0, total: 0 });
    return;
  }
  logger.info({ endpoint, count: todo.length }, 'Vuln-Scan gestartet');

  let done = 0;
  for (const img of todo) {
    const ref = img.repoTags[0]!;
    scanningIds.add(`${endpoint}:${img.id}`);
    try {
      const { cves, ...counts } = await scanImage(endpoint, ref);
      const before = existing.get(img.id);
      upsert.run({ endpoint, image_id: img.id, ...counts, status: 'ok', details: JSON.stringify(cves) });
      // Bei Anstieg kritischer/hoher Funde benachrichtigen (Baseline = voriger Scan).
      await notifyNewVulns(
        endpoint,
        endpointName,
        ref,
        counts.critical,
        counts.high,
        before?.critical ?? 0,
        before?.high ?? 0,
      );
    } catch (err) {
      logger.debug({ err, ref }, 'Vuln-Scan eines Images fehlgeschlagen');
      upsert.run({ endpoint, image_id: img.id, critical: 0, high: 0, medium: 0, low: 0, status: 'error', details: '[]' });
    } finally {
      scanningIds.delete(`${endpoint}:${img.id}`);
    }
    done++;
    progress.set(endpoint, { scanning: true, done, total: todo.length });
    await new Promise((r) => setTimeout(r, THROTTLE_MS));
  }
  progress.set(endpoint, { scanning: false, done, total: todo.length });
  logger.info({ endpoint, done }, 'Vuln-Scan abgeschlossen');
}

let running = false;

/** Scannt alle Online-Endpoints (sequenziell). Reentrancy-geschützt. */
export async function runVulnScan(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (const ep of listEndpoints()) {
      if (ep.status !== 'online') continue;
      await scanEndpoint(ep.id, ep.name).catch((err) =>
        logger.debug({ err, endpoint: ep.id }, 'Vuln-Scan-Endpoint fehlgeschlagen'),
      );
    }
  } finally {
    running = false;
  }
}

/** Erzwingt einen sofortigen Neu-Scan eines Endpoints (setzt alle Einträge auf veraltet). */
export async function rescanEndpoint(endpoint: string): Promise<void> {
  db.prepare(`UPDATE image_vulns SET scanned_at = '1970-01-01 00:00:00' WHERE endpoint = ?`).run(endpoint);
  await scanEndpoint(endpoint);
}

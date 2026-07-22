import { mkdirSync, writeFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SCHEDULE_CATALOG,
  type Frequency,
  type ScheduledJob,
  type ScheduledJobInput,
  type ScheduleJobType,
} from '@containly/shared';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { encryptSecret, decryptSecret } from './crypto.js';
import { listEndpoints, getDocker } from '../docker/endpoints.js';
import { listContainers } from '../docker/containers.js';
import { pruneImages, pruneVolumes, applyImageUpdate } from '../docker/resources.js';
import { checkUpdates } from '../docker/updates.js';
import { runVulnScan as runVulnScanAll } from './vuln-scanner.js';
import { createBackup } from './backup.js';
import { notifyImageUpdates } from './monitor.js';
import { logger } from '../logger.js';

/** Kompakte Byte-Angabe (z. B. 1.5 GB) für die Job-Zusammenfassung. */
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

/**
 * Geplante Wartung: ein Job je Typ (Image-/Volume-Prune, Update-Check, Vuln-Scan,
 * Backup, Auto-Update). Der Scheduler tickt jede Minute und führt fällige Jobs aus
 * (täglich/wöchentlich zur eingestellten Uhrzeit, höchstens einmal pro Tag/Woche).
 */

const AUTO_UPDATE_LABEL = 'com.containly.auto-update';
const BACKUP_DIR = resolve(config.dataDir, 'backups');
const BACKUP_KEEP = 14; // Anzahl aufbewahrter Backup-Dateien

interface JobRow {
  type: string;
  enabled: number;
  frequency: string;
  hour: number;
  minute: number;
  weekday: number;
  passphrase_enc: string;
  last_run: string | null;
  last_status: string | null;
  last_detail: string | null;
}

function rowToJob(type: ScheduleJobType, r: JobRow | undefined): ScheduledJob {
  return {
    type,
    enabled: r ? r.enabled === 1 : false,
    frequency: (r?.frequency === 'weekly' ? 'weekly' : 'daily') as Frequency,
    hour: r?.hour ?? 3,
    minute: r?.minute ?? 0,
    weekday: r?.weekday ?? 0,
    hasPassphrase: !!r?.passphrase_enc,
    lastRun: r?.last_run ?? null,
    lastStatus: (r?.last_status as 'ok' | 'error' | null) ?? null,
    lastDetail: r?.last_detail ?? null,
  };
}

export function listScheduledJobs(): ScheduledJob[] {
  const rows = new Map(
    (db.prepare('SELECT * FROM scheduled_jobs').all() as JobRow[]).map((r) => [r.type, r]),
  );
  return SCHEDULE_CATALOG.map((m) => rowToJob(m.type, rows.get(m.type)));
}

function getRow(type: ScheduleJobType): JobRow | undefined {
  return db.prepare('SELECT * FROM scheduled_jobs WHERE type = ?').get(type) as JobRow | undefined;
}

export function updateScheduledJob(type: ScheduleJobType, input: ScheduledJobInput): void {
  const existing = getRow(type);
  const passphraseEnc =
    input.passphrase && input.passphrase.length > 0
      ? encryptSecret(input.passphrase)
      : (existing?.passphrase_enc ?? '');
  db.prepare(`
    INSERT INTO scheduled_jobs (type, enabled, frequency, hour, minute, weekday, passphrase_enc)
    VALUES (@type, @enabled, @frequency, @hour, @minute, @weekday, @passphrase_enc)
    ON CONFLICT(type) DO UPDATE SET
      enabled=excluded.enabled, frequency=excluded.frequency, hour=excluded.hour,
      minute=excluded.minute, weekday=excluded.weekday, passphrase_enc=excluded.passphrase_enc
  `).run({
    type,
    enabled: input.enabled ? 1 : 0,
    frequency: input.frequency,
    hour: input.hour,
    minute: input.minute,
    weekday: input.weekday,
    passphrase_enc: passphraseEnc,
  });
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Ist ein Job jetzt fällig? (zur Uhrzeit erreicht, heute/diese Woche noch nicht gelaufen) */
function isDue(job: ScheduledJob, now: Date): boolean {
  if (!job.enabled) return false;
  if (job.frequency === 'weekly' && now.getDay() !== job.weekday) return false;
  const target = new Date(now);
  target.setHours(job.hour, job.minute, 0, 0);
  if (now < target) return false; // Uhrzeit heute noch nicht erreicht
  if (job.lastRun) {
    const last = new Date(job.lastRun);
    if (job.frequency === 'daily' && sameDay(last, now)) return false;
    if (job.frequency === 'weekly' && now.getTime() - last.getTime() < 6 * 24 * 3600_000) return false;
  }
  return true;
}

function recordRun(type: ScheduleJobType, status: 'ok' | 'error', detail: string): void {
  // Upsert: auch bei manuellem „Jetzt ausführen" ohne vorher gespeicherte Konfiguration
  // wird der letzte Lauf festgehalten.
  db.prepare(`
    INSERT INTO scheduled_jobs (type, last_run, last_status, last_detail)
    VALUES (@type, @last_run, @status, @detail)
    ON CONFLICT(type) DO UPDATE SET
      last_run = excluded.last_run, last_status = excluded.last_status, last_detail = excluded.last_detail
  `).run({ type, last_run: new Date().toISOString(), status, detail: detail.slice(0, 500) });
}

/* ── Job-Runner ───────────────────────────────────────────────────────────── */

async function onlineEndpoints() {
  return listEndpoints().filter((e) => e.status === 'online');
}

async function runImagePrune(): Promise<string> {
  let freed = 0;
  let count = 0;
  for (const ep of await onlineEndpoints()) {
    const r = await pruneImages(ep.id).catch(() => null);
    if (r) {
      freed += r.spaceReclaimed;
      count += r.deleted.length;
    }
  }
  return `${count} Images entfernt · ${formatBytes(freed)} frei`;
}

async function runVolumePrune(): Promise<string> {
  let freed = 0;
  let count = 0;
  for (const ep of await onlineEndpoints()) {
    const r = await pruneVolumes(ep.id).catch(() => null);
    if (r) {
      freed += r.spaceReclaimed;
      count += r.deleted.length;
    }
  }
  return `${count} Volumes entfernt · ${formatBytes(freed)} frei`;
}

async function runUpdateCheck(): Promise<string> {
  let total = 0;
  for (const ep of await onlineEndpoints()) {
    const res = await checkUpdates(ep.id, true).catch(() => null);
    if (res) {
      const avail = res.items.filter((i) => i.updateAvailable).length;
      total += avail;
      await notifyImageUpdates(ep.id, ep.name, res.items);
    }
  }
  return `${total} Updates verfügbar`;
}

async function runVulnScanJob(): Promise<string> {
  await runVulnScanAll();
  return 'Vulnerability-Scan abgeschlossen';
}

async function runBackup(): Promise<string> {
  const row = getRow('backup');
  if (!row?.passphrase_enc) throw new Error('Keine Backup-Passphrase konfiguriert');
  const passphrase = decryptSecret(row.passphrase_enc);
  const { filename, data } = createBackup(passphrase);
  mkdirSync(BACKUP_DIR, { recursive: true });
  writeFileSync(resolve(BACKUP_DIR, filename), data, 'utf8');
  // Alte Backups aufräumen (nur die neuesten BACKUP_KEEP behalten).
  const files = readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('containly-backup-') && f.endsWith('.json'))
    .map((f) => ({ f, t: statSync(resolve(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const old of files.slice(BACKUP_KEEP)) rmSync(resolve(BACKUP_DIR, old.f), { force: true });
  return `Backup erstellt: ${filename}`;
}

async function runAutoUpdate(): Promise<string> {
  let updated = 0;
  const names: string[] = [];
  for (const ep of await onlineEndpoints()) {
    const containers = await listContainers(ep.id).catch(() => []);
    // Nur Container mit dem Opt-in-Label.
    const opted = containers.filter((c) => c.labels[AUTO_UPDATE_LABEL] === 'true');
    if (opted.length === 0) continue;
    const updates = await checkUpdates(ep.id, true).catch(() => null);
    const availImages = new Set(
      (updates?.items ?? []).filter((i) => i.updateAvailable).map((i) => i.image),
    );
    // Betroffene Images (dedupliziert) mit verfügbarem Update aktualisieren.
    const images = [...new Set(opted.map((c) => c.image))].filter((img) => availImages.has(img));
    for (const image of images) {
      try {
        const res = await applyImageUpdate(ep.id, image);
        updated += res.recreated.length;
        names.push(...res.recreated);
      } catch (err) {
        logger.warn({ err, image, endpoint: ep.id }, 'Auto-Update fehlgeschlagen');
      }
    }
  }
  return updated > 0 ? `${updated} Container aktualisiert: ${names.join(', ')}` : 'Keine Updates anzuwenden';
}

const RUNNERS: Record<ScheduleJobType, () => Promise<string>> = {
  'image.prune': runImagePrune,
  'volume.prune': runVolumePrune,
  'update.check': runUpdateCheck,
  'vuln.scan': runVulnScanJob,
  backup: runBackup,
  'auto.update': runAutoUpdate,
};

/** Führt einen Job sofort aus (auch manuell aus der UI auslösbar). */
export async function runJobNow(type: ScheduleJobType): Promise<ScheduledJob> {
  try {
    const detail = await RUNNERS[type]();
    recordRun(type, 'ok', detail);
    logger.info({ type, detail }, 'Geplanter Job ausgeführt');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    recordRun(type, 'error', msg);
    logger.warn({ type, err }, 'Geplanter Job fehlgeschlagen');
  }
  return rowToJob(type, getRow(type));
}

let ticking = false;

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const now = new Date();
    for (const job of listScheduledJobs()) {
      if (isDue(job, now)) await runJobNow(job.type);
    }
  } finally {
    ticking = false;
  }
}

/** Startet den Minuten-Scheduler. */
export function startScheduler(): NodeJS.Timeout {
  const timer = setInterval(() => void tick(), 60_000);
  timer.unref();
  return timer;
}

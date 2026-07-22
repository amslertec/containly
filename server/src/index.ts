import { mkdirSync } from 'node:fs';
import { config } from './config.js';
import { logger } from './logger.js';
import { closeDb } from './db/index.js';
import { getSessionSecret } from './services/secrets.js';
import { ensureSetupToken } from './services/setup-token.js';
import { ensureLocalEndpoint, checkAllHealth, listEndpoints } from './docker/endpoints.js';
import { pruneSessions } from './services/sessions.js';
import { checkUpdates } from './docker/updates.js';
import { runVulnScan } from './services/vuln-scanner.js';
import { startMonitor, notifyImageUpdates, notifyContainlyUpdate } from './services/monitor.js';
import { startScheduler } from './services/scheduler.js';
import { startGitopsWatcher } from './services/gitops.js';
import { fetchLatest } from './routes/version.js';
import { VERSION } from './version.js';
import { buildApp } from './app.js';

/** Hintergrund-Update-Prüfung: wärmt den Cache je Endpoint (schonend, alle 6 h). */
async function backgroundUpdateCheck(): Promise<void> {
  for (const ep of listEndpoints()) {
    if (ep.status !== 'online') continue;
    try {
      const res = await checkUpdates(ep.id, true);
      // Neu verfügbare Image-Updates per E-Mail melden (einmalig je Update).
      await notifyImageUpdates(ep.id, ep.name, res.items);
    } catch {
      /* Registry-Fehler ignorieren; UI zeigt „unbekannt" */
    }
  }
  // Neue Containly-Version prüfen und ggf. melden.
  try {
    const rel = await fetchLatest(true);
    if (rel?.tag) await notifyContainlyUpdate(VERSION, rel.tag.replace(/^v/i, ''));
  } catch {
    /* GitHub-Fehler ignorieren */
  }
}

async function main(): Promise<void> {
  mkdirSync(config.dataDir, { recursive: true });
  mkdirSync(config.stacksDir, { recursive: true });

  // Secrets früh initialisieren (generiert Session-Secret + Master-Key bei Bedarf).
  getSessionSecret();

  ensureLocalEndpoint();
  ensureSetupToken();

  const app = await buildApp();

  // Health-Checks aller Endpoints im Hintergrund + periodisch.
  void checkAllHealth();
  const healthTimer = setInterval(() => void checkAllHealth(), 30_000);
  const pruneTimer = setInterval(() => {
    const n = pruneSessions();
    if (n > 0) logger.debug({ n }, 'Abgelaufene Sessions entfernt');
  }, 60_000);
  // Update-Prüfung im Hintergrund (nach kurzer Verzögerung + alle 6 h).
  const firstUpdate = setTimeout(() => void backgroundUpdateCheck(), 60_000);
  const updateTimer = setInterval(() => void backgroundUpdateCheck(), 6 * 60 * 60_000);
  // Vulnerability-Scan (Trivy via Helfer) im Hintergrund: nach 90 s + alle 6 h.
  const firstVulnScan = setTimeout(() => void runVulnScan(), 90_000);
  const vulnTimer = setInterval(() => void runVulnScan(), 6 * 60 * 60_000);
  // Ereignis-Monitor (Endpoint/Container/Performance → E-Mail-Benachrichtigungen).
  const monitorTimer = startMonitor();
  // Geplante Wartung (Prune/Update-Check/Vuln-Scan/Backup/Auto-Update).
  const schedulerTimer = startScheduler();
  // GitOps: Auto-Sync markierter Git-Stacks (alle 5 min).
  const gitopsTimer = startGitopsWatcher();
  healthTimer.unref();
  pruneTimer.unref();
  firstUpdate.unref();
  updateTimer.unref();
  firstVulnScan.unref();
  vulnTimer.unref();

  await app.listen({ port: config.port, host: config.host });
  logger.info(`Containly läuft auf http://${config.host}:${config.port}`);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Fahre herunter…');
    clearInterval(healthTimer);
    clearInterval(pruneTimer);
    clearInterval(monitorTimer);
    clearInterval(schedulerTimer);
    clearInterval(gitopsTimer);
    try {
      await app.close();
      closeDb();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Startfehler');
  process.exit(1);
});

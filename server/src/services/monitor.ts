import type { Locale, NotificationType } from '@containly/shared';
import { config } from '../config.js';
import { listEndpoints } from '../docker/endpoints.js';
import { getDocker } from '../docker/endpoints.js';
import { listContainers, parseStats } from '../docker/containers.js';
import { execInHelper } from './stack-fs.js';
import { notify, thresholdFor, clearCooldown } from './notifications.js';
import { et, ett, footerFor } from './email-i18n.js';
import type { EmailContent } from './email-template.js';
import { logger } from '../logger.js';

/**
 * Hintergrund-Monitor: erkennt über ALLE Endpoints Ereignisse (Endpoint offline/online,
 * Container gestoppt/unhealthy/OOM/Neustart-Schleife, CPU/RAM über Schwellwert, wenig
 * Host-Speicher) und löst die passenden E-Mail-Benachrichtigungen aus. Vergleicht dazu
 * je Tick den aktuellen Zustand mit dem vorigen; beim allerersten Tick wird nur der
 * Ausgangszustand erfasst (keine Alarme für bereits bestehende Zustände). Jeder Empfänger
 * erhält die E-Mail in seiner eingestellten Sprache (Rendern je Sprache in notify()).
 */

const TICK_MS = 60_000;
const PERF_SUSTAIN = 2; // Schwellwert muss so viele Ticks in Folge überschritten sein

interface ContainerSnap {
  state: string;
  unhealthy: boolean;
  restartCount: number;
}
interface EndpointState {
  status: string;
  containers: Map<string, ContainerSnap>;
  cpuOver: Map<string, number>;
  memOver: Map<string, number>;
}

const state = new Map<string, EndpointState>();
let seeded = false;

function actionFor(lang: Locale, path: string, actionKey: string): EmailContent['action'] {
  return config.publicUrl ? { label: et(lang, `action.${actionKey}`), url: `${config.publicUrl}${path}` } : undefined;
}

function isUnhealthy(status: string): boolean {
  return /\(unhealthy\)/i.test(status);
}

/** Ein einzelner Monitor-Durchlauf über alle Endpoints. */
export async function monitorTick(): Promise<void> {
  const firstRun = !seeded;
  for (const ep of listEndpoints()) {
    const prev = state.get(ep.id) ?? {
      status: ep.status,
      containers: new Map(),
      cpuOver: new Map(),
      memOver: new Map(),
    };

    // ── Endpoint online/offline ──────────────────────────────────────────
    const wasDown = prev.status === 'offline' || prev.status === 'unauthorized';
    const isDown = ep.status === 'offline' || ep.status === 'unauthorized';
    if (!firstRun && prev.status !== ep.status) {
      if (isDown) {
        await notify('endpoint.offline', {
          key: ep.id,
          render: (lang) => ({
            subject: ett(lang, 'endpoint.offline', 'subject', { name: ep.name }),
            content: {
              severity: 'critical',
              heading: ett(lang, 'endpoint.offline', 'heading', { name: ep.name }),
              intro: ett(lang, 'endpoint.offline', 'intro'),
              rows: [
                { label: et(lang, 'label.endpoint'), value: ep.name },
                { label: et(lang, 'label.status'), value: ep.status },
              ],
              action: actionFor(lang, '/endpoints', 'endpoints'),
              footer: footerFor(lang, 'endpoint.offline'),
            },
          }),
        });
      } else if (ep.status === 'online' && wasDown) {
        clearCooldown('endpoint.offline', ep.id);
        await notify('endpoint.online', {
          key: ep.id,
          render: (lang) => ({
            subject: ett(lang, 'endpoint.online', 'subject', { name: ep.name }),
            content: {
              severity: 'info',
              heading: ett(lang, 'endpoint.online', 'heading', { name: ep.name }),
              intro: ett(lang, 'endpoint.online', 'intro'),
              rows: [{ label: et(lang, 'label.endpoint'), value: ep.name }],
              action: actionFor(lang, '/endpoints', 'endpoints'),
              footer: footerFor(lang, 'endpoint.online'),
            },
          }),
        });
      }
    }

    const next: EndpointState = {
      status: ep.status,
      containers: new Map(),
      cpuOver: new Map(),
      memOver: new Map(),
    };

    if (ep.status === 'online') {
      try {
        await scanContainers(ep.id, ep.name, prev, next, firstRun);
      } catch (err) {
        logger.debug({ err, endpoint: ep.id }, 'Monitor: Container-Scan fehlgeschlagen');
      }
      if (!firstRun) await checkDisk(ep.id, ep.name).catch(() => undefined);
    }

    state.set(ep.id, next);
  }
  seeded = true;
}

async function scanContainers(
  endpoint: string,
  endpointName: string,
  prev: EndpointState,
  next: EndpointState,
  firstRun: boolean,
): Promise<void> {
  const containers = await listContainers(endpoint);
  const cpuThresh = thresholdFor('perf.cpu');
  const memThresh = thresholdFor('perf.memory');

  for (const c of containers) {
    const name = c.names[0] ?? c.id.slice(0, 12);
    const unhealthy = isUnhealthy(c.status);
    const restartCount = c.restartCount ?? 0;
    const snap: ContainerSnap = { state: c.state, unhealthy, restartCount };
    next.containers.set(c.id, snap);
    const before = prev.containers.get(c.id);

    if (!firstRun && before) {
      // Unerwartet gestoppt: war laufend, ist jetzt beendet/tot.
      if (before.state === 'running' && (c.state === 'exited' || c.state === 'dead')) {
        await handleStopped(endpoint, endpointName, c.id, name);
      }
      // Unhealthy geworden.
      if (!before.unhealthy && unhealthy) {
        await notify('container.unhealthy', {
          key: `${endpoint}:${c.id}`,
          render: (lang) => ({
            subject: ett(lang, 'container.unhealthy', 'subject', { name }),
            content: {
              severity: 'warning',
              heading: ett(lang, 'container.unhealthy', 'heading', { name }),
              intro: ett(lang, 'container.unhealthy', 'intro'),
              rows: [
                { label: et(lang, 'label.container'), value: name },
                { label: et(lang, 'label.host'), value: endpointName },
                { label: et(lang, 'label.image'), value: c.image },
              ],
              action: actionFor(lang, '/containers', 'containers'),
              footer: footerFor(lang, 'container.unhealthy'),
            },
          }),
        });
      }
      // Neustart-Schleife: mehrere Neustarts innerhalb eines Ticks.
      const delta = restartCount - before.restartCount;
      if (delta >= 2) {
        await notify('container.restart_loop', {
          key: `${endpoint}:${c.id}`,
          render: (lang) => ({
            subject: ett(lang, 'container.restart_loop', 'subject', { name }),
            content: {
              severity: 'warning',
              heading: ett(lang, 'container.restart_loop', 'heading', { name }),
              intro: ett(lang, 'container.restart_loop', 'intro', { n: delta }),
              rows: [
                { label: et(lang, 'label.container'), value: name },
                { label: et(lang, 'label.host'), value: endpointName },
                { label: et(lang, 'label.restarts'), value: String(restartCount) },
              ],
              action: actionFor(lang, '/containers', 'containers'),
              footer: footerFor(lang, 'container.restart_loop'),
            },
          }),
        });
      }
    }

    // Wenn wieder gesund/laufend: Cooldowns zurücksetzen, damit ein erneuter Vorfall mailt.
    if (c.state === 'running' && !unhealthy) {
      clearCooldown('container.unhealthy', `${endpoint}:${c.id}`);
      clearCooldown('container.exited', `${endpoint}:${c.id}`);
      clearCooldown('container.oom', `${endpoint}:${c.id}`);
    }

    // ── Performance (nur laufende Container) ────────────────────────────
    if (c.state === 'running' && !firstRun && (cpuThresh != null || memThresh != null)) {
      await checkPerf(endpoint, endpointName, c.id, name, prev, next, cpuThresh, memThresh);
    }
  }
}

async function handleStopped(
  endpoint: string,
  endpointName: string,
  id: string,
  name: string,
): Promise<void> {
  let exitCode = 0;
  let oom = false;
  try {
    const raw = await getDocker(endpoint).getContainer(id).inspect();
    exitCode = raw.State?.ExitCode ?? 0;
    oom = !!raw.State?.OOMKilled;
  } catch {
    /* inspect fehlgeschlagen → als generischen Stopp behandeln */
  }
  if (oom) {
    await notify('container.oom', {
      key: `${endpoint}:${id}`,
      render: (lang) => ({
        subject: ett(lang, 'container.oom', 'subject', { name }),
        content: {
          severity: 'critical',
          heading: ett(lang, 'container.oom', 'heading', { name }),
          intro: ett(lang, 'container.oom', 'intro'),
          rows: [
            { label: et(lang, 'label.container'), value: name },
            { label: et(lang, 'label.host'), value: endpointName },
          ],
          action: actionFor(lang, '/containers', 'containers'),
          footer: footerFor(lang, 'container.oom'),
        },
      }),
    });
    return;
  }
  if (exitCode !== 0) {
    await notify('container.exited', {
      key: `${endpoint}:${id}`,
      render: (lang) => ({
        subject: ett(lang, 'container.exited', 'subject', { name }),
        content: {
          severity: 'warning',
          heading: ett(lang, 'container.exited', 'heading', { name }),
          intro: ett(lang, 'container.exited', 'intro', { code: exitCode }),
          rows: [
            { label: et(lang, 'label.container'), value: name },
            { label: et(lang, 'label.host'), value: endpointName },
            { label: et(lang, 'label.exitCode'), value: String(exitCode) },
          ],
          action: actionFor(lang, '/containers', 'containers'),
          footer: footerFor(lang, 'container.exited'),
        },
      }),
    });
  }
}

async function checkPerf(
  endpoint: string,
  endpointName: string,
  id: string,
  name: string,
  prev: EndpointState,
  next: EndpointState,
  cpuThresh: number | null,
  memThresh: number | null,
): Promise<void> {
  let cpu = 0;
  let mem = 0;
  try {
    const raw = (await getDocker(endpoint).getContainer(id).stats({ stream: false })) as unknown;
    const s = parseStats(id, raw as Parameters<typeof parseStats>[1]);
    cpu = s.cpuPercent;
    mem = s.memoryPercent;
  } catch {
    return; // Stats nicht verfügbar → überspringen
  }

  // CPU: über Schwelle für PERF_SUSTAIN Ticks in Folge.
  if (cpuThresh != null) {
    const streak = cpu > cpuThresh ? (prev.cpuOver.get(id) ?? 0) + 1 : 0;
    next.cpuOver.set(id, streak);
    if (streak === PERF_SUSTAIN) {
      await notify('perf.cpu', {
        key: `${endpoint}:${id}`,
        render: (lang) => ({
          subject: ett(lang, 'perf.cpu', 'subject', { name }),
          content: {
            severity: 'warning',
            heading: ett(lang, 'perf.cpu', 'heading', { name }),
            intro: ett(lang, 'perf.cpu', 'intro', { threshold: cpuThresh }),
            rows: [
              { label: et(lang, 'label.container'), value: name },
              { label: et(lang, 'label.host'), value: endpointName },
              { label: et(lang, 'label.cpuNow'), value: `${cpu.toFixed(1)}%` },
              { label: et(lang, 'label.threshold'), value: `${cpuThresh}%` },
            ],
            action: actionFor(lang, '/containers', 'containers'),
            footer: footerFor(lang, 'perf.cpu'),
          },
        }),
      });
    }
  }

  // RAM: über Schwelle für PERF_SUSTAIN Ticks in Folge.
  if (memThresh != null) {
    const streak = mem > memThresh ? (prev.memOver.get(id) ?? 0) + 1 : 0;
    next.memOver.set(id, streak);
    if (streak === PERF_SUSTAIN) {
      await notify('perf.memory', {
        key: `${endpoint}:${id}`,
        render: (lang) => ({
          subject: ett(lang, 'perf.memory', 'subject', { name }),
          content: {
            severity: 'warning',
            heading: ett(lang, 'perf.memory', 'heading', { name }),
            intro: ett(lang, 'perf.memory', 'intro', { threshold: memThresh }),
            rows: [
              { label: et(lang, 'label.container'), value: name },
              { label: et(lang, 'label.host'), value: endpointName },
              { label: et(lang, 'label.memNow'), value: `${mem.toFixed(1)}%` },
              { label: et(lang, 'label.threshold'), value: `${memThresh}%` },
            ],
            action: actionFor(lang, '/containers', 'containers'),
            footer: footerFor(lang, 'perf.memory'),
          },
        }),
      });
    }
  }
}

async function checkDisk(endpoint: string, endpointName: string): Promise<void> {
  const threshGb = thresholdFor('host.disk');
  if (threshGb == null) return;
  try {
    // Freien Speicher des Docker-Root über den Helfer ermitteln (Bytes).
    const { stdout, exit } = await execInHelper(endpoint, [
      'df', '-B1', '--output=avail', '/var/run/docker.sock',
    ]);
    if (exit !== 0) return;
    const avail = Number(stdout.split('\n').filter(Boolean).pop()?.trim());
    if (!Number.isFinite(avail)) return;
    const availGb = avail / 1024 ** 3;
    if (availGb < threshGb) {
      await notify('host.disk', {
        key: endpoint,
        render: (lang) => ({
          subject: ett(lang, 'host.disk', 'subject', { name: endpointName }),
          content: {
            severity: 'warning',
            heading: ett(lang, 'host.disk', 'heading', { name: endpointName }),
            intro: ett(lang, 'host.disk', 'intro', { free: availGb.toFixed(1) }),
            rows: [
              { label: et(lang, 'label.host'), value: endpointName },
              { label: et(lang, 'label.free'), value: `${availGb.toFixed(1)} GB` },
              { label: et(lang, 'label.threshold'), value: `${threshGb} GB` },
            ],
            footer: footerFor(lang, 'host.disk'),
          },
        }),
      });
    } else {
      clearCooldown('host.disk', endpoint);
    }
  } catch {
    /* df nicht verfügbar → still */
  }
}

/* ── Update-/Containly-/Vuln-Hooks (ereignisgesteuert, nicht im Tick) ─────── */

// Bereits gemeldete Image-Updates (endpoint:image), damit nicht bei jeder 6-h-Prüfung
// erneut gemailt wird. Fällt das Update weg (angewendet), wird der Eintrag entfernt →
// ein künftiges Update meldet erneut.
const notifiedUpdates = new Set<string>();

/** Meldet neu verfügbare Image-Updates eines Endpoints (einmalig je Update). */
export async function notifyImageUpdates(
  endpoint: string,
  endpointName: string,
  items: { image: string; updateAvailable: boolean }[],
): Promise<void> {
  for (const it of items) {
    const key = `${endpoint}:${it.image}`;
    if (it.updateAvailable) {
      if (notifiedUpdates.has(key)) continue;
      notifiedUpdates.add(key);
      await notify('image.update', {
        key,
        render: (lang) => ({
          subject: ett(lang, 'image.update', 'subject', { image: it.image }),
          content: {
            severity: 'info',
            heading: ett(lang, 'image.update', 'heading', { image: it.image }),
            intro: ett(lang, 'image.update', 'intro'),
            rows: [
              { label: et(lang, 'label.image'), value: it.image },
              { label: et(lang, 'label.host'), value: endpointName },
            ],
            action: actionFor(lang, '/updates', 'updates'),
            footer: footerFor(lang, 'image.update'),
          },
        }),
      });
    } else {
      notifiedUpdates.delete(key);
    }
  }
}

let notifiedContainlyVersion = '';

/** Meldet eine neue Containly-Version (einmalig je Version). */
export async function notifyContainlyUpdate(current: string, latest: string): Promise<void> {
  if (!latest || latest === current || latest === notifiedContainlyVersion) return;
  notifiedContainlyVersion = latest;
  await notify('containly.update', {
    key: `containly:${latest}`,
    render: (lang) => ({
      subject: ett(lang, 'containly.update', 'subject', { latest }),
      content: {
        severity: 'info',
        heading: ett(lang, 'containly.update', 'heading', { latest }),
        intro: ett(lang, 'containly.update', 'intro', { current }),
        rows: [
          { label: et(lang, 'label.installed'), value: current },
          { label: et(lang, 'label.latest'), value: latest },
        ],
        action: actionFor(lang, '/settings', 'settings'),
        footer: footerFor(lang, 'containly.update'),
      },
    }),
  });
}

/** Meldet neu gefundene kritische/hohe CVEs eines Images (nur bei Anstieg). */
export async function notifyNewVulns(
  endpoint: string,
  endpointName: string,
  imageName: string,
  critical: number,
  high: number,
  prevCritical: number,
  prevHigh: number,
): Promise<void> {
  if (critical <= prevCritical && high <= prevHigh) return;
  if (critical === 0 && high === 0) return;
  await notify('vuln.critical', {
    key: `${endpoint}:${imageName}:${critical}:${high}`,
    render: (lang) => ({
      subject: ett(lang, 'vuln.critical', 'subject', { image: imageName }),
      content: {
        severity: 'critical',
        heading: ett(lang, 'vuln.critical', 'heading', { image: imageName }),
        intro: ett(lang, 'vuln.critical', 'intro'),
        rows: [
          { label: et(lang, 'label.image'), value: imageName },
          { label: et(lang, 'label.host'), value: endpointName },
          { label: et(lang, 'label.critical'), value: String(critical) },
          { label: et(lang, 'label.high'), value: String(high) },
        ],
        action: actionFor(lang, '/images', 'images'),
        footer: footerFor(lang, 'vuln.critical'),
      },
    }),
  });
}

let running = false;

/** Startet den periodischen Monitor. */
export function startMonitor(): NodeJS.Timeout {
  const tick = (): void => {
    if (running) return;
    running = true;
    void monitorTick()
      .catch((err) => logger.debug({ err }, 'Monitor-Tick fehlgeschlagen'))
      .finally(() => {
        running = false;
      });
  };
  const timer = setInterval(tick, TICK_MS);
  timer.unref();
  return timer;
}

export type { NotificationType };

/**
 * Self-Update-Deputy. Läuft in einem KURZLEBIGEN Zweit-Container aus dem neuen
 * Containly-Image (nicht als Server), gestartet von der laufenden Containly-Instanz.
 * Da es ein eigener Container ist, überlebt es den Neustart des Haupt-Containers und
 * kann diesen sauber gegen das neue Image austauschen — was ein Container mit sich
 * selbst nicht kann (er würde sich beim `stop`/`remove` selbst abschießen).
 *
 * Erwartet per Env:
 *   CONTAINLY_SELF_UPDATE        – ID/Name des Containly-Containers, der ersetzt wird
 *   CONTAINLY_SELF_UPDATE_IMAGE  – Image-Referenz, mit der neu erstellt wird
 *   CONTAINLY_DOCKER_SOCKET      – optionaler Socket-Pfad (Default /var/run/docker.sock)
 */
import Docker from 'dockerode';
import { safeRecreateContainer } from './docker/recreate.js';

async function main(): Promise<void> {
  const target = process.env.CONTAINLY_SELF_UPDATE;
  const image = process.env.CONTAINLY_SELF_UPDATE_IMAGE;
  const socketPath = process.env.CONTAINLY_DOCKER_SOCKET || '/var/run/docker.sock';
  const log = (m: string): void => console.log(`[containly-self-update] ${m}`);

  if (!target || !image) {
    log('missing CONTAINLY_SELF_UPDATE / CONTAINLY_SELF_UPDATE_IMAGE');
    process.exit(1);
    return;
  }

  const docker = new Docker({ socketPath });

  // Kurz warten, damit die alte Instanz ihre HTTP-Antwort noch senden kann,
  // bevor sie gestoppt wird.
  await new Promise((r) => setTimeout(r, 2500));

  try {
    await safeRecreateContainer(docker, target, image, log);
    log('self-update complete');
    process.exit(0);
  } catch (err) {
    log(`self-update FAILED: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();

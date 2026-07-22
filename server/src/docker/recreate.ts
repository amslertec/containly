import os from 'node:os';
import type Docker from 'dockerode';

type ContainerInspect = Awaited<ReturnType<Docker.Container['inspect']>>;

/**
 * Verlässlichstes „bin ich das selbst?"-Signal: der Kernel meldet für diesen Prozess
 * den Container-Hostnamen, der (per Default die Kurz-ID, sonst der gesetzte
 * `hostname:`) exakt `Config.Hostname` des eigenen Containers entspricht — unabhängig
 * von Storage-Driver, cgroup-Version oder mountinfo-Aufbau.
 */
export function isOwnContainer(info: ContainerInspect): boolean {
  const host = os.hostname();
  return !!host && info.Config?.Hostname === host;
}
type CreateOpts = Parameters<Docker['createContainer']>[0];
type NetworkMap = NonNullable<ContainerInspect['NetworkSettings']>['Networks'];
type NetworkEndpoint = NetworkMap[string];

/** Laufzeit-Felder (IPs, Container-Kurz-ID) aus einem Netzwerk-Endpoint entfernen. */
function cleanEndpoint(n: NetworkEndpoint, fullId: string, shortId: string) {
  return {
    Aliases: (n.Aliases ?? []).filter((a: string) => a && a !== shortId && !fullId.startsWith(a)),
    IPAMConfig: n.IPAMConfig ?? undefined,
  };
}

/**
 * Baut aus einem `inspect` die `createContainer`-Optionen für ein neues Image.
 * Netzwerke/Volumes/Env/Labels/HostConfig bleiben erhalten. createContainer
 * akzeptiert nur EIN Netzwerk inline — weitere werden danach verbunden.
 */
export function buildCreateOpts(info: ContainerInspect, newImage: string) {
  const name = info.Name.replace(/^\//, '');
  const shortId = info.Id.slice(0, 12);
  const nets = info.NetworkSettings?.Networks ?? {};
  const netNames = Object.keys(nets);

  const opts: CreateOpts = {
    name,
    Image: newImage,
    Hostname: info.Config.Hostname,
    Domainname: info.Config.Domainname,
    User: info.Config.User,
    Env: info.Config.Env,
    Cmd: info.Config.Cmd,
    Entrypoint: info.Config.Entrypoint,
    Labels: info.Config.Labels,
    WorkingDir: info.Config.WorkingDir,
    ExposedPorts: info.Config.ExposedPorts,
    Volumes: info.Config.Volumes,
    HostConfig: info.HostConfig,
    ...(netNames[0]
      ? {
          NetworkingConfig: {
            EndpointsConfig: { [netNames[0]]: cleanEndpoint(nets[netNames[0]]!, info.Id, shortId) },
          },
        }
      : {}),
  };

  return { opts, name, netNames, nets, fullId: info.Id, shortId };
}

/**
 * Entfernt aus der Container-Env die UNVERÄNDERTEN Image-Default-Werte des ALTEN
 * Images, damit beim Recreate die Defaults des NEUEN Images greifen statt eingefroren
 * zu werden. Wichtig z.B. für `CONTAINLY_VERSION` (steckt als ENV im Image): sonst
 * würde der neue Container die alte Version melden, obwohl er aus dem neuen Image läuft.
 * User-/Compose-gesetzte Envs (die nicht 1:1 einem alten Image-Default entsprechen)
 * bleiben erhalten. Watchtower macht es genauso.
 */
async function envWithoutStaleImageDefaults(
  docker: Docker,
  info: ContainerInspect,
): Promise<string[] | undefined> {
  const containerEnv = info.Config.Env;
  if (!containerEnv) return undefined;
  try {
    const oldImage = await docker.getImage(info.Image).inspect();
    const imageDefaults = new Set(oldImage.Config?.Env ?? []);
    return containerEnv.filter((e) => !imageDefaults.has(e));
  } catch {
    return containerEnv; // im Zweifel unverändert (bisheriges Verhalten)
  }
}

/** Verbindet die Netzwerke ab dem zweiten (das erste wird bei createContainer inline gesetzt). */
async function connectExtraNets(
  docker: Docker,
  containerId: string,
  netNames: string[],
  nets: NetworkMap,
  fullId: string,
  shortId: string,
): Promise<void> {
  for (let i = 1; i < netNames.length; i++) {
    const nm = netNames[i]!;
    await docker
      .getNetwork(nm)
      .connect({ Container: containerId, EndpointConfig: cleanEndpoint(nets[nm]!, fullId, shortId) })
      .catch(() => undefined);
  }
}

/**
 * Erstellt einen Container mit identischer Konfiguration neu, aber mit `newImage`
 * (Watchtower-Stil), ABSICHERT mit Rollback: der alte Container wird erst umbenannt,
 * nicht sofort gelöscht. Schlägt das Erstellen/Starten des neuen fehl, kommt der
 * alte Container unter seinem Namen zurück und wird wieder gestartet.
 */
export async function safeRecreateContainer(
  docker: Docker,
  id: string,
  newImage: string,
  log: (msg: string) => void = () => undefined,
  envOverride?: string[],
): Promise<string> {
  const info = await docker.getContainer(id).inspect();
  // Ab jetzt IMMER über die aufgelöste ID arbeiten (nicht den evtl. übergebenen Namen):
  // nach dem rename würde eine namensbasierte Referenz sonst auf den NEUEN Container zeigen.
  const container = docker.getContainer(info.Id);
  // SICHERHEITSNETZ (letzte Verteidigungslinie): den Container, in dem DIESER Prozess
  // läuft, niemals in-process ersetzen — stop()/remove() würde den Node-Prozess mitten
  // im Vorgang töten (der 0.1.9/0.1.10-Ausfall). Self-Update MUSS über den Deputy laufen.
  if (isOwnContainer(info)) {
    throw new Error(
      'refuse to recreate the container this process runs in — self-update must be delegated to the deputy container',
    );
  }
  const { opts, name, netNames, nets, fullId, shortId } = buildCreateOpts(info, newImage);
  // Env: entweder explizit gesetzt (Env-Editor) oder — beim Update — alte Image-Default-
  // Envs (z.B. CONTAINLY_VERSION) nicht einfrieren, damit neue Defaults durchkommen.
  opts.Env = envOverride ?? (await envWithoutStaleImageDefaults(docker, info));
  const wasRunning = !!info.State?.Running;
  const backupName = `${name}-containly-old`;

  log(`recreate ${name} → ${newImage}`);
  if (wasRunning) await container.stop().catch(() => undefined);
  // Alten Container aus dem Weg benennen (Name muss frei sein für den neuen).
  await docker.getContainer(backupName).remove({ force: true }).catch(() => undefined);
  await container.rename({ name: backupName });

  try {
    const created = await docker.createContainer(opts);
    await connectExtraNets(docker, created.id, netNames, nets, fullId, shortId);
    if (wasRunning) await created.start();
    log(`started new ${name}, removing old`);
    await container.remove({ force: true }).catch(() => undefined);
    return name;
  } catch (err) {
    log(`recreate failed, rolling back ${name}: ${err instanceof Error ? err.message : String(err)}`);
    // Halb erstellten neuen Container (falls vorhanden) entfernen …
    await docker.getContainer(name).remove({ force: true }).catch(() => undefined);
    // … und den alten unter seinem Namen zurückholen.
    await container.rename({ name }).catch(() => undefined);
    if (wasRunning) await docker.getContainer(name).start().catch(() => undefined);
    throw err;
  }
}

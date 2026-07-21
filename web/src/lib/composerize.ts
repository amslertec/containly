/**
 * `docker run …` → `docker-compose.yml`.
 *
 * Eigenständiger Konverter (keine externe Abhängigkeit), deckt die gängigen
 * `docker run`-Flags ab. Nicht abbildbare Flags werden NICHT verschluckt,
 * sondern als Warnung zurückgegeben und als YAML-Kommentar angehängt.
 */

export interface ComposeResult {
  yaml: string;
  serviceName: string;
  warnings: string[];
}

/* ── Tokenizer: respektiert Quotes und `\`-Zeilenfortsetzungen ─────────────── */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  let has = false;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quote) {
      if (ch === quote) { quote = null; continue; }
      const esc = input[i + 1];
      if (ch === '\\' && quote === '"' && esc !== undefined) { cur += esc; i++; has = true; continue; }
      cur += ch; has = true; continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; has = true; continue; }
    if (ch === '\\') {
      const nx = input[i + 1];
      if (nx === '\n') { i++; continue; }
      if (nx === '\r' && input[i + 2] === '\n') { i += 2; continue; }
      if (nx !== undefined) { cur += nx; i++; has = true; continue; }
      continue;
    }
    if (/\s/.test(ch)) { if (has) { tokens.push(cur); cur = ''; has = false; } continue; }
    cur += ch; has = true;
  }
  if (has) tokens.push(cur);
  return tokens;
}

/* ── Flag-Klassifizierung ──────────────────────────────────────────────────── */
// Kanonische Langnamen je Kurzflag / Alias.
const ALIAS: Record<string, string> = {
  p: 'publish', e: 'env', v: 'volume', h: 'hostname', u: 'user', w: 'workdir',
  l: 'label', m: 'memory', net: 'network', 'add-host': 'add-host',
  // Laufzeit-Kurzflags → Langnamen (compose-relevant bzw. bewusst ignoriert).
  d: 'detach', t: 'tty', i: 'interactive', P: 'publish-all',
};
// Boolean-Flags (verbrauchen keinen Wert).
const BOOL = new Set([
  'd', 'detach', 't', 'tty', 'i', 'interactive', 'rm', 'init', 'privileged',
  'P', 'publish-all', 'read-only', 'no-healthcheck', 'sig-proxy',
]);
// Kurz-Flags mit Wert (für kombinierte Kurzform wie `-it -e`).
const VALUE_SHORT = new Set(['p', 'e', 'v', 'h', 'u', 'w', 'l', 'm']);
const BOOL_SHORT = new Set(['d', 't', 'i', 'P']);

interface ParsedRun {
  options: { flag: string; value: string | null }[];
  image: string | null;
  command: string[];
}

function parseRun(tokens: string[]): ParsedRun {
  const options: { flag: string; value: string | null }[] = [];
  let image: string | null = null;
  const command: string[] = [];

  let i = 0;
  // Führendes `docker run` / `sudo docker container run` überspringen.
  while (i < tokens.length && ['sudo', 'docker', 'run', 'container', 'exec'].includes(tokens[i]!)) {
    if (tokens[i] === 'run') { i++; break; }
    i++;
  }

  const canonical = (f: string): string => ALIAS[f] ?? f;

  for (; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (image !== null) { command.push(tok); continue; }

    if (tok.startsWith('--')) {
      const body = tok.slice(2);
      const eq = body.indexOf('=');
      if (eq >= 0) { options.push({ flag: canonical(body.slice(0, eq)), value: body.slice(eq + 1) }); continue; }
      const flag = canonical(body);
      if (BOOL.has(body) || BOOL.has(flag)) { options.push({ flag, value: null }); continue; }
      // Wert = nächstes Token.
      const val = tokens[i + 1];
      if (val !== undefined) { options.push({ flag, value: val }); i++; }
      else options.push({ flag, value: null });
      continue;
    }

    if (tok.startsWith('-') && tok.length > 1) {
      // Kombinierte Kurzform: -it, -dit, -p80:80, -e FOO=bar
      const chars = tok.slice(1);
      let consumed = false;
      for (let k = 0; k < chars.length; k++) {
        const c = chars[k]!;
        if (VALUE_SHORT.has(c)) {
          const rest = chars.slice(k + 1);
          const value = rest.length > 0 ? rest : tokens[++i];
          options.push({ flag: canonical(c), value: value ?? null });
          consumed = true;
          break;
        }
        if (BOOL_SHORT.has(c)) { options.push({ flag: canonical(c), value: null }); continue; }
        // Unbekanntes Kurzflag → als Wertflag behandeln, Rest/Next als Wert.
        const rest = chars.slice(k + 1);
        const value = rest.length > 0 ? rest : tokens[++i];
        options.push({ flag: canonical(c), value: value ?? null });
        consumed = true;
        break;
      }
      void consumed;
      continue;
    }

    // Erstes Nicht-Flag = Image.
    image = tok;
  }

  return { options, image, command };
}

/* ── YAML-Ausgabe ──────────────────────────────────────────────────────────── */
type YamlVal = string | number | boolean | string[] | Array<[string, YamlVal]>;

function isPlainSafe(s: string): boolean {
  if (s === '') return false;
  if (!/^[A-Za-z0-9_][A-Za-z0-9_./@+-]*$/.test(s)) return false;
  return !/^(true|false|yes|no|on|off|null|~|\d+(\.\d+)?)$/i.test(s);
}
function scalar(s: string): string {
  if (isPlainSafe(s)) return s;
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function emit(pairs: Array<[string, YamlVal]>, indent: number): string {
  const pad = '  '.repeat(indent);
  const lines: string[] = [];
  for (const [key, val] of pairs) {
    if (Array.isArray(val) && val.length > 0 && Array.isArray(val[0])) {
      lines.push(`${pad}${key}:`);
      lines.push(emit(val as Array<[string, YamlVal]>, indent + 1));
    } else if (Array.isArray(val)) {
      if (val.length === 0) continue;
      lines.push(`${pad}${key}:`);
      for (const item of val as string[]) lines.push(`${pad}  - ${scalar(item)}`);
    } else if (typeof val === 'boolean' || typeof val === 'number') {
      lines.push(`${pad}${key}: ${val}`);
    } else if (val === '') {
      // Leerer Wert → bloßer Schlüssel (z. B. benanntes Volume `pgdata:`).
      lines.push(`${pad}${key}:`);
    } else {
      lines.push(`${pad}${key}: ${scalar(val)}`);
    }
  }
  return lines.join('\n');
}

/* ── Mapping run → compose ─────────────────────────────────────────────────── */
function serviceNameFrom(name: string | undefined, image: string | null): string {
  const raw = name || (image ? image.split('/').pop()!.split(':')[0]! : 'app');
  return raw.toLowerCase().replace(/[^a-z0-9_.-]/g, '-') || 'app';
}

function isNamedVolume(src: string): boolean {
  return !/^[/.~]/.test(src) && !src.startsWith('${');
}

export function runToCompose(input: string): ComposeResult {
  const warnings: string[] = [];
  const { options, image, command } = parseRun(tokenize(input));

  const get = (flag: string): string[] =>
    options.filter((o) => o.flag === flag && o.value !== null).map((o) => o.value as string);
  const has = (flag: string): boolean => options.some((o) => o.flag === flag);

  const name = get('name')[0];
  const service: Array<[string, YamlVal]> = [];
  const namedVolumes = new Set<string>();
  const namedNetworks = new Set<string>();

  service.push(['image', image ?? 'IMAGE:latest']);
  if (!image) warnings.push('Kein Image erkannt — bitte im YAML ergänzen.');
  if (name) service.push(['container_name', name]);
  const hostname = get('hostname')[0];
  if (hostname) service.push(['hostname', hostname]);
  const user = get('user')[0];
  if (user) service.push(['user', user]);
  const workdir = get('workdir')[0];
  if (workdir) service.push(['working_dir', workdir]);

  // network_mode vs. benannte Netzwerke
  const networks = get('network');
  const networkList: string[] = [];
  for (const n of networks) {
    if (n === 'host' || n === 'none') service.push(['network_mode', n]);
    else if (n === 'bridge' || n === 'default') { /* Default — nichts zu tun */ }
    else { networkList.push(n); namedNetworks.add(n); }
  }

  const restart = get('restart')[0];
  if (restart) service.push(['restart', restart]);
  if (has('privileged')) service.push(['privileged', true]);
  if (has('init')) service.push(['init', true]);
  if (has('read-only')) service.push(['read_only', true]);

  const ports = get('publish');
  if (ports.length) service.push(['ports', ports]);

  const env = get('env');
  if (env.length) service.push(['environment', env]);
  const envFile = get('env-file');
  if (envFile.length) service.push(['env_file', envFile]);

  // Volumes: benannte Volumes zusätzlich top-level deklarieren.
  const volumes = get('volume');
  for (const v of volumes) {
    const src = v.split(':')[0];
    if (src && isNamedVolume(src) && !v.includes('/')) namedVolumes.add(src);
    else if (src && isNamedVolume(src)) namedVolumes.add(src);
  }
  if (volumes.length) service.push(['volumes', volumes]);

  const devices = get('device');
  if (devices.length) service.push(['devices', devices]);
  const capAdd = get('cap-add');
  if (capAdd.length) service.push(['cap_add', capAdd]);
  const capDrop = get('cap-drop');
  if (capDrop.length) service.push(['cap_drop', capDrop]);
  const dns = get('dns');
  if (dns.length) service.push(['dns', dns]);
  const addHost = get('add-host');
  if (addHost.length) service.push(['extra_hosts', addHost]);
  const sysctl = get('sysctl');
  if (sysctl.length) service.push(['sysctls', sysctl]);
  const tmpfs = get('tmpfs');
  if (tmpfs.length) service.push(['tmpfs', tmpfs]);
  const shmSize = get('shm-size')[0];
  if (shmSize) service.push(['shm_size', shmSize]);
  const platform = get('platform')[0];
  if (platform) service.push(['platform', platform]);
  const entrypoint = get('entrypoint')[0];
  if (entrypoint) service.push(['entrypoint', entrypoint]);

  if (command.length) service.push(['command', command.join(' ')]);

  const labels = get('label');
  if (labels.length) service.push(['labels', labels]);

  // Logging
  const logDriver = get('log-driver')[0];
  const logOpts = get('log-opt');
  if (logDriver || logOpts.length) {
    const logging: Array<[string, YamlVal]> = [];
    if (logDriver) logging.push(['driver', logDriver]);
    if (logOpts.length) {
      const opts: Array<[string, YamlVal]> = logOpts.map((o) => {
        const [k, ...rest] = o.split('=');
        return [k, rest.join('=')] as [string, YamlVal];
      });
      logging.push(['options', opts]);
    }
    service.push(['logging', logging]);
  }

  // Healthcheck
  const hcCmd = get('health-cmd')[0];
  if (hcCmd) {
    const hc: Array<[string, YamlVal]> = [['test', ['CMD-SHELL', hcCmd]]];
    const hi = get('health-interval')[0];
    const ht = get('health-timeout')[0];
    const hr = get('health-retries')[0];
    const hs = get('health-start-period')[0];
    if (hi) hc.push(['interval', hi]);
    if (ht) hc.push(['timeout', ht]);
    if (hr) hc.push(['retries', Number(hr)]);
    if (hs) hc.push(['start_period', hs]);
    service.push(['healthcheck', hc]);
  }

  // Ressourcen (Compose v2 / `docker compose` unterstützt diese Kurzform).
  const mem = get('memory')[0];
  if (mem) service.push(['mem_limit', mem]);
  const cpus = get('cpus')[0];
  if (cpus) service.push(['cpus', Number(cpus)]);

  if (has('tty')) service.push(['tty', true]);
  if (has('interactive')) service.push(['stdin_open', true]);

  if (networkList.length) service.push(['networks', networkList]);

  // Nicht abgebildete Flags sammeln (ehrlich melden, nicht verschlucken).
  const handled = new Set([
    'name', 'hostname', 'user', 'workdir', 'network', 'restart', 'privileged',
    'init', 'read-only', 'publish', 'env', 'env-file', 'volume', 'device',
    'cap-add', 'cap-drop', 'dns', 'add-host', 'sysctl', 'tmpfs', 'shm-size',
    'platform', 'entrypoint', 'label', 'log-driver', 'log-opt', 'health-cmd',
    'health-interval', 'health-timeout', 'health-retries', 'health-start-period',
    'memory', 'cpus', 'tty', 'interactive', 'detach', 'rm', 'publish-all', 'sig-proxy',
  ]);
  const unknown = [...new Set(options.filter((o) => !handled.has(o.flag)).map((o) => o.flag))];
  if (unknown.length) warnings.push(`Nicht umgewandelte Flags: ${unknown.map((f) => (f.length === 1 ? '-' : '--') + f).join(', ')}`);

  const serviceName = serviceNameFrom(name, image);

  const root: Array<[string, YamlVal]> = [['services', [[serviceName, service]] as Array<[string, YamlVal]>]];
  if (namedVolumes.size) {
    root.push(['volumes', [...namedVolumes].map((v) => [v, ''] as [string, YamlVal])]);
  }
  if (namedNetworks.size) {
    root.push(['networks', [...namedNetworks].map((n) => [n, [['external', true]]] as [string, YamlVal])]);
  }

  let yaml = emit(root, 0) + '\n';
  if (unknown.length) {
    yaml =
      `# Hinweis: folgende Flags konnten nicht automatisch umgewandelt werden:\n` +
      unknown.map((f) => `#   ${(f.length === 1 ? '-' : '--') + f}`).join('\n') +
      `\n` +
      yaml;
  }

  return { yaml, serviceName, warnings };
}

import type { Locale, NotificationType } from '@containly/shared';

/**
 * Serverseitige Übersetzung der Benachrichtigungs-E-Mails (de/en). Empfänger erhalten
 * die E-Mail in ihrer eingestellten Sprache. `et(lang, key, vars)` navigiert den Katalog
 * per Punkt-Pfad und ersetzt {{platzhalter}}.
 */

type Dict = Record<string, unknown>;

const CATALOG: Record<Locale, Dict> = {
  de: {
    label: {
      endpoint: 'Endpoint',
      host: 'Host',
      status: 'Status',
      container: 'Container',
      image: 'Image',
      exitCode: 'Exit-Code',
      restarts: 'Neustarts gesamt',
      cpuNow: 'CPU aktuell',
      memNow: 'RAM aktuell',
      threshold: 'Schwellwert',
      free: 'Frei',
      critical: 'Kritisch',
      high: 'Hoch',
      installed: 'Installiert',
      latest: 'Neueste',
    },
    action: {
      endpoints: 'Endpoints öffnen',
      containers: 'Container öffnen',
      updates: 'Zu den Updates',
      settings: 'Zu den Einstellungen',
      images: 'Zu den Images',
    },
    footerBecause: 'Du erhältst diese E-Mail, weil du für „{{what}}" angemeldet bist.',
    types: {
      'endpoint.offline': {
        subject: 'Containly · Endpoint offline: {{name}}',
        heading: 'Endpoint „{{name}}" ist nicht erreichbar',
        intro: 'Containly kann diesen Docker-Host aktuell nicht erreichen.',
        what: 'Endpoint offline',
      },
      'endpoint.online': {
        subject: 'Containly · Endpoint wieder online: {{name}}',
        heading: 'Endpoint „{{name}}" ist wieder erreichbar',
        intro: 'Der Docker-Host antwortet wieder.',
        what: 'Endpoint wieder online',
      },
      'container.exited': {
        subject: 'Containly · Container gestoppt: {{name}}',
        heading: 'Container „{{name}}" wurde unerwartet beendet',
        intro: 'Der Container ist mit Exit-Code {{code}} gestoppt.',
        what: 'Container gestoppt',
      },
      'container.unhealthy': {
        subject: 'Containly · Container unhealthy: {{name}}',
        heading: 'Container „{{name}}" ist unhealthy',
        intro: 'Der Healthcheck dieses Containers schlägt fehl.',
        what: 'Container unhealthy',
      },
      'container.oom': {
        subject: 'Containly · Container OOM-gekillt: {{name}}',
        heading: 'Container „{{name}}" wurde wegen Speichermangel beendet (OOM)',
        intro: 'Der Container hat sein Speicherlimit überschritten und wurde vom Kernel beendet.',
        what: 'Container OOM',
      },
      'container.restart_loop': {
        subject: 'Containly · Neustart-Schleife: {{name}}',
        heading: 'Container „{{name}}" startet wiederholt neu',
        intro: '{{n}} Neustarts seit der letzten Prüfung.',
        what: 'Neustart-Schleife',
      },
      'perf.cpu': {
        subject: 'Containly · Hohe CPU-Last: {{name}}',
        heading: 'Container „{{name}}" hat hohe CPU-Last',
        intro: 'CPU-Auslastung über {{threshold}}% seit mehreren Minuten.',
        what: 'hohe CPU-Last',
      },
      'perf.memory': {
        subject: 'Containly · Hohe RAM-Nutzung: {{name}}',
        heading: 'Container „{{name}}" hat hohe Speichernutzung',
        intro: 'Speichernutzung über {{threshold}}% des Limits seit mehreren Minuten.',
        what: 'hohe RAM-Nutzung',
      },
      'host.disk': {
        subject: 'Containly · Wenig Speicherplatz: {{name}}',
        heading: 'Wenig Speicherplatz auf „{{name}}"',
        intro: 'Auf dem Host sind nur noch {{free}} GB frei.',
        what: 'wenig Speicherplatz',
      },
      'image.update': {
        subject: 'Containly · Update verfügbar: {{image}}',
        heading: 'Update verfügbar für {{image}}',
        intro: 'Für dieses Image gibt es eine neuere Version in der Registry.',
        what: 'Update verfügbar',
      },
      'containly.update': {
        subject: 'Containly · Neue Version verfügbar: {{latest}}',
        heading: 'Containly {{latest}} ist verfügbar',
        intro: 'Du verwendest {{current}}. Eine neuere Version steht bereit.',
        what: 'Neue Containly-Version',
      },
      'vuln.critical': {
        subject: 'Containly · Neue Schwachstellen: {{image}}',
        heading: 'Neue kritische Schwachstellen in {{image}}',
        intro: 'Ein Trivy-Scan hat neue kritische/hohe Schwachstellen gefunden.',
        what: 'Neue kritische Schwachstellen',
      },
    },
    test: {
      subject: 'Containly · Test-E-Mail',
      heading: 'SMTP funktioniert',
      intro: 'Dies ist eine Test-E-Mail von Containly. Deine SMTP-Einstellungen sind korrekt.',
      footer: 'Du erhältst diese E-Mail, weil ein Administrator die SMTP-Verbindung getestet hat.',
    },
  },
  en: {
    label: {
      endpoint: 'Endpoint',
      host: 'Host',
      status: 'Status',
      container: 'Container',
      image: 'Image',
      exitCode: 'Exit code',
      restarts: 'Total restarts',
      cpuNow: 'CPU now',
      memNow: 'Memory now',
      threshold: 'Threshold',
      free: 'Free',
      critical: 'Critical',
      high: 'High',
      installed: 'Installed',
      latest: 'Latest',
    },
    action: {
      endpoints: 'Open endpoints',
      containers: 'Open containers',
      updates: 'Go to updates',
      settings: 'Go to settings',
      images: 'Go to images',
    },
    footerBecause: 'You receive this email because you are subscribed to "{{what}}".',
    types: {
      'endpoint.offline': {
        subject: 'Containly · Endpoint offline: {{name}}',
        heading: 'Endpoint "{{name}}" is unreachable',
        intro: 'Containly cannot currently reach this Docker host.',
        what: 'Endpoint offline',
      },
      'endpoint.online': {
        subject: 'Containly · Endpoint back online: {{name}}',
        heading: 'Endpoint "{{name}}" is reachable again',
        intro: 'The Docker host is responding again.',
        what: 'Endpoint back online',
      },
      'container.exited': {
        subject: 'Containly · Container stopped: {{name}}',
        heading: 'Container "{{name}}" exited unexpectedly',
        intro: 'The container stopped with exit code {{code}}.',
        what: 'Container stopped',
      },
      'container.unhealthy': {
        subject: 'Containly · Container unhealthy: {{name}}',
        heading: 'Container "{{name}}" is unhealthy',
        intro: "This container's health check is failing.",
        what: 'Container unhealthy',
      },
      'container.oom': {
        subject: 'Containly · Container OOM-killed: {{name}}',
        heading: 'Container "{{name}}" was killed for running out of memory (OOM)',
        intro: 'The container exceeded its memory limit and was killed by the kernel.',
        what: 'Container OOM',
      },
      'container.restart_loop': {
        subject: 'Containly · Restart loop: {{name}}',
        heading: 'Container "{{name}}" keeps restarting',
        intro: '{{n}} restarts since the last check.',
        what: 'Restart loop',
      },
      'perf.cpu': {
        subject: 'Containly · High CPU load: {{name}}',
        heading: 'Container "{{name}}" has high CPU load',
        intro: 'CPU usage above {{threshold}}% for several minutes.',
        what: 'high CPU load',
      },
      'perf.memory': {
        subject: 'Containly · High memory usage: {{name}}',
        heading: 'Container "{{name}}" has high memory usage',
        intro: 'Memory usage above {{threshold}}% of the limit for several minutes.',
        what: 'high memory usage',
      },
      'host.disk': {
        subject: 'Containly · Low disk space: {{name}}',
        heading: 'Low disk space on "{{name}}"',
        intro: 'Only {{free}} GB free on the host.',
        what: 'low disk space',
      },
      'image.update': {
        subject: 'Containly · Update available: {{image}}',
        heading: 'Update available for {{image}}',
        intro: 'A newer version of this image is available in the registry.',
        what: 'Update available',
      },
      'containly.update': {
        subject: 'Containly · New version available: {{latest}}',
        heading: 'Containly {{latest}} is available',
        intro: 'You are running {{current}}. A newer version is available.',
        what: 'New Containly version',
      },
      'vuln.critical': {
        subject: 'Containly · New vulnerabilities: {{image}}',
        heading: 'New critical vulnerabilities in {{image}}',
        intro: 'A Trivy scan found new critical/high vulnerabilities.',
        what: 'New critical vulnerabilities',
      },
    },
    test: {
      subject: 'Containly · Test email',
      heading: 'SMTP works',
      intro: 'This is a test email from Containly. Your SMTP settings are correct.',
      footer: 'You receive this email because an administrator tested the SMTP connection.',
    },
  },
};

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{{${k}}}`));
}

/** Übersetzt einen Katalog-Schlüssel (Punkt-Pfad) in der Zielsprache. */
export function et(lang: Locale, key: string, vars?: Record<string, string | number>): string {
  const parts = key.split('.');
  // Typ-Schlüssel enthalten selbst Punkte (z. B. types.endpoint.offline.subject) → gezielt behandeln.
  let node: unknown = CATALOG[lang];
  for (const p of parts) {
    if (node && typeof node === 'object' && p in (node as Dict)) {
      node = (node as Dict)[p];
    } else {
      node = undefined;
      break;
    }
  }
  return typeof node === 'string' ? interpolate(node, vars) : key;
}

/** Kurzform für Typ-spezifische Texte: type-Feld (subject/heading/intro/what). */
export function ett(
  lang: Locale,
  type: NotificationType,
  field: 'subject' | 'heading' | 'intro' | 'what',
  vars?: Record<string, string | number>,
): string {
  const node = (CATALOG[lang].types as Dict)[type] as Dict | undefined;
  const s = node?.[field];
  return typeof s === 'string' ? interpolate(s, vars) : `${type}.${field}`;
}

/** Standard-Footer „Du erhältst diese E-Mail, weil …" in der Zielsprache. */
export function footerFor(lang: Locale, type: NotificationType): string {
  const what = ett(lang, type, 'what');
  return interpolate(CATALOG[lang].footerBecause as string, { what });
}

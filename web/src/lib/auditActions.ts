import i18n from '../i18n';

/**
 * Menschenlesbare Beschriftungen für Audit-Aktions-Codes (de/en). Die Codes
 * enthalten Punkte (`stack.file.save`) — deshalb eine flache JS-Map statt
 * i18n-Keys (i18next würde Punkte als Verschachtelung interpretieren).
 */
const LABELS: Record<string, { de: string; en: string }> = {
  login: { de: 'Anmeldung', en: 'Sign in' },
  'login.2fa': { de: 'Anmeldung (2FA)', en: 'Sign in (2FA)' },
  logout: { de: 'Abmeldung', en: 'Sign out' },
  setup: { de: 'Erst-Einrichtung', en: 'Initial setup' },
  'password.change': { de: 'Passwort geändert', en: 'Password changed' },
  '2fa.enable': { de: '2FA aktiviert', en: '2FA enabled' },
  '2fa.disable': { de: '2FA deaktiviert', en: '2FA disabled' },
  exec: { de: 'Konsole geöffnet', en: 'Console opened' },

  'update.bulk': { de: 'Alle Updates gestartet', en: 'Bulk update started' },
  'registry.login': { de: 'Registry angemeldet', en: 'Registry signed in' },
  'registry.logout': { de: 'Registry abgemeldet', en: 'Registry signed out' },
  'backup.create': { de: 'Backup erstellt', en: 'Backup created' },
  'backup.restore': { de: 'Backup wiederhergestellt', en: 'Backup restored' },

  'container.start': { de: 'Container gestartet', en: 'Container started' },
  'container.stop': { de: 'Container gestoppt', en: 'Container stopped' },
  'container.restart': { de: 'Container neu gestartet', en: 'Container restarted' },
  'container.pause': { de: 'Container pausiert', en: 'Container paused' },
  'container.unpause': { de: 'Container fortgesetzt', en: 'Container resumed' },
  'container.kill': { de: 'Container gekillt', en: 'Container killed' },
  'container.remove': { de: 'Container entfernt', en: 'Container removed' },

  'image.pull': { de: 'Image gezogen', en: 'Image pulled' },
  'image.tag': { de: 'Image getaggt', en: 'Image tagged' },
  'image.remove': { de: 'Image entfernt', en: 'Image removed' },
  'image.prune': { de: 'Images aufgeräumt', en: 'Images pruned' },
  'image.update': { de: 'Image aktualisiert (Recreate)', en: 'Image updated (recreate)' },

  'volume.create': { de: 'Volume erstellt', en: 'Volume created' },
  'volume.remove': { de: 'Volume entfernt', en: 'Volume removed' },
  'volume.prune': { de: 'Volumes aufgeräumt', en: 'Volumes pruned' },

  'network.create': { de: 'Netzwerk erstellt', en: 'Network created' },
  'network.remove': { de: 'Netzwerk entfernt', en: 'Network removed' },
  'network.prune': { de: 'Netzwerke aufgeräumt', en: 'Networks pruned' },

  'endpoint.create': { de: 'Endpoint erstellt', en: 'Endpoint created' },
  'endpoint.update': { de: 'Endpoint geändert', en: 'Endpoint updated' },
  'endpoint.delete': { de: 'Endpoint gelöscht', en: 'Endpoint deleted' },

  'stack.create': { de: 'Stack erstellt', en: 'Stack created' },
  'stack.save': { de: 'Stack gespeichert', en: 'Stack saved' },
  'stack.deploy': { de: 'Stack deployed', en: 'Stack deployed' },
  'stack.down': { de: 'Stack heruntergefahren', en: 'Stack brought down' },
  'stack.delete': { de: 'Stack gelöscht', en: 'Stack deleted' },
  'stack.start': { de: 'Stack gestartet', en: 'Stack started' },
  'stack.stop': { de: 'Stack gestoppt', en: 'Stack stopped' },
  'stack.restart': { de: 'Stack neu gestartet', en: 'Stack restarted' },
  'stack.pause': { de: 'Stack pausiert', en: 'Stack paused' },
  'stack.unpause': { de: 'Stack fortgesetzt', en: 'Stack resumed' },
  'stack.kill': { de: 'Stack gekillt', en: 'Stack killed' },
  'stack.file.save': { de: 'Datei gespeichert', en: 'File saved' },
  'stack.file.delete': { de: 'Datei gelöscht', en: 'File deleted' },

  'user.create': { de: 'Benutzer erstellt', en: 'User created' },
  'user.update': { de: 'Benutzer geändert', en: 'User updated' },
  'user.delete': { de: 'Benutzer gelöscht', en: 'User deleted' },
};

/** Fallback: `foo.bar_baz` → „Foo bar baz" (falls kein Eintrag existiert). */
function prettify(action: string): string {
  const s = action.replace(/[._]/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function auditActionLabel(action: string): string {
  const de = (i18n.resolvedLanguage ?? 'en').startsWith('de');
  const entry = LABELS[action];
  if (entry) return de ? entry.de : entry.en;
  return prettify(action);
}

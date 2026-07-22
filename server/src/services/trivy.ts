import type { CveDetail } from '@containly/shared';
import { execInHelper } from './stack-fs.js';
import { logger } from '../logger.js';

/**
 * Vulnerability-Scan eines Images mit Trivy. Trivy läuft NICHT in Containlys Image,
 * sondern als eigener `aquasec/trivy`-Container auf dem Ziel-Host — gestartet über den
 * `containly-helper` (docker:cli mit Socket), der `docker run aquasec/trivy …` ausführt.
 * So bleibt Containlys Image scanner-frei. Die Trivy-Vuln-DB wird in einem persistenten
 * Volume (`containly-trivy-cache`) gehalten, damit nur der erste Scan sie herunterlädt.
 */

const TRIVY_IMAGE = 'aquasec/trivy:latest';
const CACHE_VOLUME = 'containly-trivy-cache';

export interface VulnCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface ScanResult extends VulnCounts {
  cves: CveDetail[];
}

interface TrivyVuln {
  VulnerabilityID?: string;
  Severity?: string;
  PkgName?: string;
  InstalledVersion?: string;
  FixedVersion?: string;
  Title?: string;
  PrimaryURL?: string;
}
interface TrivyReport {
  Results?: { Vulnerabilities?: TrivyVuln[] | null }[];
}

const SEV = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']);

/** Zählt die Funde je Schweregrad und sammelt die CVE-Details aus dem Trivy-JSON. */
function parseReport(report: TrivyReport): ScanResult {
  const res: ScanResult = { critical: 0, high: 0, medium: 0, low: 0, cves: [] };
  for (const r of report.Results ?? []) {
    for (const v of r.Vulnerabilities ?? []) {
      switch (v.Severity) {
        case 'CRITICAL': res.critical++; break;
        case 'HIGH': res.high++; break;
        case 'MEDIUM': res.medium++; break;
        case 'LOW': res.low++; break;
      }
      const sev = v.Severity && SEV.has(v.Severity) ? v.Severity : 'UNKNOWN';
      res.cves.push({
        id: v.VulnerabilityID ?? '—',
        severity: sev as CveDetail['severity'],
        pkg: v.PkgName ?? '',
        installed: v.InstalledVersion ?? '',
        fixed: v.FixedVersion ?? '',
        title: v.Title ?? '',
        url: v.PrimaryURL ?? '',
      });
    }
  }
  return res;
}

/**
 * Scannt ein Image (per Repo:Tag oder ID) und liefert Fund-Zahlen + CVE-Details.
 * Wirft bei Scan-Fehler (der Aufrufer markiert das Image dann als 'error').
 */
export async function scanImage(endpoint: string, imageRef: string): Promise<ScanResult> {
  const cmd = [
    'docker',
    'run',
    '--rm',
    '-v',
    '/var/run/docker.sock:/var/run/docker.sock',
    '-v',
    `${CACHE_VOLUME}:/root/.cache/trivy`,
    TRIVY_IMAGE,
    'image',
    '--quiet',
    '--format',
    'json',
    '--scanners',
    'vuln',
    '--severity',
    'CRITICAL,HIGH,MEDIUM,LOW',
    imageRef,
  ];

  const { stdout, stderr, exit } = await execInHelper(endpoint, cmd);
  if (exit !== 0) {
    throw new Error(`Trivy exit ${exit}: ${stderr.slice(0, 200) || 'unbekannter Fehler'}`);
  }
  // Trivy schreibt das JSON auf stdout; das erste '{' markiert den Report-Anfang.
  const start = stdout.indexOf('{');
  if (start < 0) throw new Error('Trivy lieferte kein JSON');
  let report: TrivyReport;
  try {
    report = JSON.parse(stdout.slice(start)) as TrivyReport;
  } catch (err) {
    logger.debug({ err, snippet: stdout.slice(0, 120) }, 'Trivy-JSON nicht parsebar');
    throw new Error('Trivy-JSON nicht parsebar');
  }
  return parseReport(report);
}

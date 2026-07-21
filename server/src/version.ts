import { readFileSync } from 'node:fs';

/** Reads the version from the (image-copied) root package.json. */
function readPkgVersion(): string {
  try {
    return (JSON.parse(readFileSync('package.json', 'utf8')) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// CI injects the release tag via CONTAINLY_VERSION; otherwise use package.json.
const env = (process.env.CONTAINLY_VERSION ?? '').replace(/^v/i, '').trim();
export const VERSION = env && env !== 'dev' ? env : readPkgVersion();

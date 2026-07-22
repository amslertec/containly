import type { AddGitStack, GitStack } from '@containly/shared';
import { db } from '../db/index.js';
import { getEndpoint } from '../docker/endpoints.js';
import { execInHelper, getStackFs } from './stack-fs.js';
import { logger } from '../logger.js';

/**
 * GitOps für Stacks: klont ein Git-Repo in einen Stack-Pfad (über den Helfer-Container,
 * `docker run --rm alpine/git`), aktualisiert es per `git pull` und deployt bei einer
 * Commit-Änderung automatisch (`docker compose up -d`). So bleibt Containlys Image
 * git-frei — dasselbe Prinzip wie beim Compose-Helfer.
 */

const GIT_IMAGE = 'alpine/git';
const COMPOSE_FILES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];

interface GitRow {
  id: number;
  endpoint: string;
  name: string;
  base_path: string;
  repo_url: string;
  branch: string;
  auto_sync: number;
  last_sync: string | null;
  last_commit: string | null;
  last_status: string | null;
  last_detail: string | null;
}

function rowToStack(r: GitRow): GitStack {
  return {
    id: r.id,
    endpoint: r.endpoint,
    name: r.name,
    basePath: r.base_path,
    repoUrl: r.repo_url,
    branch: r.branch,
    autoSync: r.auto_sync === 1,
    lastSync: r.last_sync,
    lastCommit: r.last_commit,
    lastStatus: r.last_status === 'ok' || r.last_status === 'error' ? r.last_status : null,
    lastDetail: r.last_detail,
  };
}

export function listGitStacks(): GitStack[] {
  return (db.prepare('SELECT * FROM git_stacks ORDER BY name').all() as GitRow[]).map(rowToStack);
}

function getRow(id: number): GitRow | undefined {
  return db.prepare('SELECT * FROM git_stacks WHERE id = ?').get(id) as GitRow | undefined;
}

/** Führt ein `git`-Kommando im Helfer aus: `docker run --rm -v <basePath>:/work alpine/git <args>`. */
async function git(endpoint: string, basePath: string, args: string[]): Promise<{ out: string; exit: number; err: string }> {
  const { stdout, stderr, exit } = await execInHelper(endpoint, [
    'docker',
    'run',
    '--rm',
    '-v',
    `${basePath}:/work`,
    GIT_IMAGE,
    ...args,
  ]);
  return { out: stdout.trim(), exit, err: stderr.trim() };
}

async function currentCommit(endpoint: string, basePath: string, name: string): Promise<string | null> {
  const { out, exit } = await git(endpoint, basePath, ['-C', `/work/${name}`, 'rev-parse', '--short', 'HEAD']);
  return exit === 0 && out ? out.split('\n').pop()!.trim() : null;
}

/** Compose-Datei im Stack-Ordner finden (oder null). */
async function findComposeFile(endpoint: string, dir: string): Promise<string | null> {
  try {
    const entries = await getStackFs(endpoint).listDir(dir);
    for (const f of COMPOSE_FILES) if (entries.some((e) => e.name === f && !e.isDir)) return f;
  } catch {
    /* Verzeichnis (noch) nicht lesbar */
  }
  return null;
}

/** Klont ein Repo als neuen Git-Stack in den Stack-Pfad. */
export async function addGitStack(input: AddGitStack): Promise<GitStack> {
  const ep = getEndpoint(input.endpoint);
  if (!ep) throw new Error(`Endpoint nicht gefunden: ${input.endpoint}`);
  if (!ep.stackPaths.includes(input.basePath)) {
    throw new Error('Stack-Pfad gehört nicht zu diesem Endpoint');
  }
  const dir = `${input.basePath}/${input.name}`;

  // Zielordner darf noch nicht existieren.
  const existing = await getStackFs(input.endpoint).stat(dir).catch(() => null);
  if (existing) throw new Error(`Verzeichnis „${input.name}" existiert bereits`);

  const clone = await git(input.endpoint, input.basePath, [
    'clone',
    '--depth',
    '1',
    '--branch',
    input.branch,
    '--single-branch',
    input.repoUrl,
    `/work/${input.name}`,
  ]);
  if (clone.exit !== 0) throw new Error(`git clone fehlgeschlagen: ${clone.err.slice(0, 300) || clone.out.slice(0, 300)}`);

  const commit = await currentCommit(input.endpoint, input.basePath, input.name);
  const info = db
    .prepare(`
      INSERT INTO git_stacks (endpoint, name, base_path, repo_url, branch, auto_sync, last_sync, last_commit, last_status, last_detail)
      VALUES (@endpoint, @name, @base_path, @repo_url, @branch, @auto_sync, datetime('now'), @commit, 'ok', 'cloned')
    `)
    .run({
      endpoint: input.endpoint,
      name: input.name,
      base_path: input.basePath,
      repo_url: input.repoUrl,
      branch: input.branch,
      auto_sync: input.autoSync ? 1 : 0,
      commit,
    });
  logger.info({ id: info.lastInsertRowid, repo: input.repoUrl }, 'Git-Stack geklont');
  return rowToStack(getRow(Number(info.lastInsertRowid))!);
}

/** Aktualisiert einen Git-Stack (`git pull`) und deployt bei geändertem Commit. */
export async function syncGitStack(id: number): Promise<GitStack> {
  const row = getRow(id);
  if (!row) throw new Error('Git-Stack nicht gefunden');
  const dir = `${row.base_path}/${row.name}`;

  let status: 'ok' | 'error' = 'ok';
  let detail = '';
  let commit = row.last_commit;
  try {
    const pull = await git(row.endpoint, row.base_path, ['-C', `/work/${row.name}`, 'pull']);
    if (pull.exit !== 0) throw new Error(pull.err.slice(0, 300) || pull.out.slice(0, 300));

    const newCommit = await currentCommit(row.endpoint, row.base_path, row.name);
    const changed = newCommit !== row.last_commit;
    commit = newCommit;

    if (changed) {
      const composeFile = await findComposeFile(row.endpoint, dir);
      if (composeFile) {
        await getStackFs(row.endpoint).compose(dir, row.name, composeFile, ['up', '-d']);
        detail = `Aktualisiert auf ${newCommit ?? '?'} + deployed`;
      } else {
        detail = `Aktualisiert auf ${newCommit ?? '?'} (keine Compose-Datei)`;
      }
    } else {
      detail = 'Bereits aktuell';
    }
  } catch (err) {
    status = 'error';
    detail = err instanceof Error ? err.message : String(err);
  }

  db.prepare(
    `UPDATE git_stacks SET last_sync = datetime('now'), last_commit = ?, last_status = ?, last_detail = ? WHERE id = ?`,
  ).run(commit, status, detail.slice(0, 500), id);
  return rowToStack(getRow(id)!);
}

/** Entfernt die Git-Verknüpfung (die Dateien im Stack-Pfad bleiben erhalten). */
export function removeGitStack(id: number): void {
  db.prepare('DELETE FROM git_stacks WHERE id = ?').run(id);
}

let watching = false;

/** Startet den Auto-Sync-Watcher: pullt alle 5 min die Git-Stacks mit auto_sync=1. */
export function startGitopsWatcher(): NodeJS.Timeout {
  const tick = (): void => {
    if (watching) return;
    watching = true;
    void (async () => {
      try {
        const due = (db.prepare('SELECT id FROM git_stacks WHERE auto_sync = 1').all() as { id: number }[]);
        for (const { id } of due) {
          await syncGitStack(id).catch((err) => logger.debug({ err, id }, 'Auto-Sync fehlgeschlagen'));
        }
      } finally {
        watching = false;
      }
    })();
  };
  const timer = setInterval(tick, 5 * 60_000);
  timer.unref();
  return timer;
}

import type { StackDiff, StackDiffLine } from '@containly/shared';
import { db } from '../db/index.js';

/**
 * Snapshot des zuletzt deployten Compose-Inhalts je Stack + Zeilen-Diff gegen den
 * aktuellen Inhalt (für „Änderungen seit letztem Deploy"). Snapshot wird beim
 * erfolgreichen Deploy geschrieben.
 */

/** Merkt sich den Compose-Inhalt zum Deploy-Zeitpunkt (Upsert je Endpoint+Stack). */
export function saveDeploySnapshot(endpoint: string, stackId: string, content: string): void {
  db.prepare(
    `INSERT INTO stack_deploys (endpoint, stack_id, content, deployed_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(endpoint, stack_id) DO UPDATE SET content = excluded.content, deployed_at = datetime('now')`,
  ).run(endpoint, stackId, content);
}

function getSnapshot(endpoint: string, stackId: string): string | null {
  const r = db
    .prepare('SELECT content FROM stack_deploys WHERE endpoint = ? AND stack_id = ?')
    .get(endpoint, stackId) as { content: string } | undefined;
  return r?.content ?? null;
}

/**
 * Einfacher zeilenbasierter Diff (LCS) zwischen zwei Texten. Liefert add/del/ctx-Zeilen,
 * Kontext (ctx) auf CONTEXT Zeilen um Änderungen begrenzt.
 */
const CONTEXT = 3;

function diffLines(oldText: string, newText: string): StackDiffLine[] {
  const a = oldText.replace(/\r\n/g, '\n').split('\n');
  const b = newText.replace(/\r\n/g, '\n').split('\n');
  const n = a.length;
  const m = b.length;

  // LCS-Längenmatrix.
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  // Backtrack → volle Diff-Sequenz.
  const full: StackDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      full.push({ type: 'ctx', text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      full.push({ type: 'del', text: a[i]! });
      i++;
    } else {
      full.push({ type: 'add', text: b[j]! });
      j++;
    }
  }
  while (i < n) full.push({ type: 'del', text: a[i++]! });
  while (j < m) full.push({ type: 'add', text: b[j++]! });

  // Kontext um Änderungen kürzen (unveränderte Blöcke > 2*CONTEXT ausdünnen).
  const changedIdx = new Set<number>();
  full.forEach((l, idx) => {
    if (l.type !== 'ctx') {
      for (let k = idx - CONTEXT; k <= idx + CONTEXT; k++) if (k >= 0 && k < full.length) changedIdx.add(k);
    }
  });
  const out: StackDiffLine[] = [];
  let gapShown = false;
  full.forEach((l, idx) => {
    if (changedIdx.has(idx)) {
      out.push(l);
      gapShown = false;
    } else if (!gapShown) {
      out.push({ type: 'ctx', text: '…' });
      gapShown = true;
    }
  });
  return out;
}

/** Diff des aktuellen Compose-Inhalts gegen den zuletzt deployten Snapshot. */
export function getStackDiff(endpoint: string, stackId: string, currentContent: string): StackDiff {
  const prev = getSnapshot(endpoint, stackId);
  if (prev === null) return { hasPrevious: false, changed: false, lines: [] };
  if (prev === currentContent) return { hasPrevious: true, changed: false, lines: [] };
  const lines = diffLines(prev, currentContent);
  return { hasPrevious: true, changed: lines.some((l) => l.type !== 'ctx'), lines };
}

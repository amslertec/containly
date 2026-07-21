import type { ReactNode } from 'react';

/** Inline: **bold**, [text](url) and bare URLs → links. */
function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      nodes.push(<strong key={key++} className="font-semibold text-ink">{m[1]}</strong>);
    } else if (m[2] !== undefined && m[3] !== undefined) {
      nodes.push(
        <a key={key++} href={m[3]} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
          {m[2]}
        </a>,
      );
    } else if (m[4] !== undefined) {
      nodes.push(
        <a key={key++} href={m[4]} target="_blank" rel="noreferrer" className="break-all text-primary underline underline-offset-2">
          {m[4]}
        </a>,
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/**
 * Minimal Markdown renderer for GitHub release notes: headings, bold, bullet
 * lists and links. Deliberately small — no external dependency.
 */
export function ReleaseNotes({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [];

  const flush = (): void => {
    if (list.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="my-1.5 ml-4 list-disc space-y-1">
          {list}
        </ul>,
      );
      list = [];
    }
  };

  lines.forEach((line, i) => {
    const t = line.trim();
    if (/^#{1,6}\s/.test(t)) {
      flush();
      blocks.push(
        <p key={i} className="mb-1 mt-3 text-[13px] font-semibold uppercase tracking-wide text-muted first:mt-0">
          {inline(t.replace(/^#{1,6}\s/, ''))}
        </p>,
      );
    } else if (/^[-*]\s/.test(t)) {
      list.push(<li key={i}>{inline(t.replace(/^[-*]\s+/, ''))}</li>);
    } else if (t === '') {
      flush();
    } else {
      flush();
      blocks.push(
        <p key={i} className="my-1">
          {inline(t)}
        </p>,
      );
    }
  });
  flush();

  return <div className="text-sm leading-relaxed text-ink">{blocks}</div>;
}

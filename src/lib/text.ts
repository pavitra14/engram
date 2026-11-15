const URL_RE = /https?:\/\/[^\s<>"')\]]+/i;

export function firstUrl(text: string): string | null {
  const m = text.match(URL_RE);
  return m ? m[0].replace(/[.,;:!?]+$/, '') : null;
}

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/^https?:\/\/([^/?#]+)/i);
  return m ? m[1].replace(/^www\./, '').toLowerCase() : null;
}

/** A short single-line label for a thought. */
export function titleOf(t: { title: string | null; body: string; kind: string; url: string | null }): string {
  if (t.title && t.title.trim()) return t.title.trim();
  const line = t.body.trim().split('\n')[0]?.trim();
  if (line) return line.length > 90 ? `${line.slice(0, 88).trimEnd()}…` : line;
  if (t.url) return hostOf(t.url) ?? t.url;
  if (t.kind === 'voice') return 'Voice note';
  if (t.kind === 'image') return 'Image';
  return 'Untitled thought';
}

export function relativeTime(ts: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  const date = new Date(ts);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  });
}

export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/** Turns free text into a safe FTS5 prefix query, or null if nothing usable. */
export function ftsQuery(input: string): string | null {
  const terms = input
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0)
    .slice(0, 8);
  if (terms.length === 0) return null;
  return terms.map((t) => `"${t}"*`).join(' ');
}

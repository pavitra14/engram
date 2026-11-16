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
  if (t.kind === 'video') return 'Video';
  if (t.kind === 'file') return 'File';
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

export function timeOfDay(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 === 0 ? 12 : h % 12}:${m < 10 ? '0' : ''}${m} ${h < 12 ? 'am' : 'pm'}`;
}

const startOfDay = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Whole days between two moments, by calendar day. */
export function daysAgo(ts: number, now: number = Date.now()): number {
  return Math.round((startOfDay(now) - startOfDay(ts)) / 86_400_000);
}

export function dayLabel(ts: number, now: number = Date.now()): string {
  const n = daysAgo(ts, now);
  if (n <= 0) return 'Today';
  if (n === 1) return 'Yesterday';
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString(undefined, {
    weekday: n < 7 ? 'long' : undefined,
    day: 'numeric',
    month: 'long',
    year: sameYear ? undefined : 'numeric',
  });
}

/** "9:42 am" for today, otherwise "yesterday", "3 days ago", or a date. */
export function when(ts: number, now: number = Date.now()): string {
  const n = daysAgo(ts, now);
  if (n <= 0) return timeOfDay(ts);
  if (n === 1) return 'yesterday';
  if (n < 7) return `${n} days ago`;
  return relativeTime(ts, now);
}

export function longDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Splits text into runs, marking the parts that match any search word. */
export function highlightRuns(text: string, query: string): { text: string; hit: boolean }[] {
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (words.length === 0) return [{ text, hit: false }];
  const re = new RegExp(`(${words.join('|')})`, 'giu');
  const exact = new RegExp(`^(?:${words.join('|')})$`, 'iu');
  return text
    .split(re)
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, hit: exact.test(part) }));
}

export function fileSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** "in 2 h", "tomorrow, 9:00 am", "Fri 20 Nov, 6:00 pm", or "overdue since yesterday". */
export function dueLabel(ts: number, now: number = Date.now()): string {
  const days = -daysAgo(ts, now);
  const time = timeOfDay(ts);
  if (ts < now) {
    if (days === 0) return `Overdue since ${time}`;
    if (days === -1) return 'Overdue since yesterday';
    return `Overdue by ${-days} days`;
  }
  if (days === 0) {
    const mins = Math.round((ts - now) / 60_000);
    if (mins < 60) return `In ${Math.max(1, mins)} min`;
    return `Today, ${time}`;
  }
  if (days === 1) return `Tomorrow, ${time}`;
  const d = new Date(ts);
  return `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
}

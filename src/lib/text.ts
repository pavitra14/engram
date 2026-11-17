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

// ---------- formatted notes ----------

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

/** The words of a formatted note, one line per paragraph or list item. Search and linking read this. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|li|blockquote|codeblock|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Plain words as the simplest formatted note: one paragraph per line. */
export function textToHtml(text: string): string {
  if (!text) return '';
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<html>${text.split('\n').map((line) => (line ? `<p>${esc(line)}</p>` : '<br>')).join('')}</html>`;
}

/** Whether a note uses any formatting. Plain notes are stored as words alone. */
export function isFormatted(html: string | null | undefined): boolean {
  return !!html && /<(b|i|u|s|strong|em|h[1-6]|ul|ol|li|blockquote|code|codeblock|a)\b/i.test(html);
}

// ---------- to-dos ----------

/** The next time a repeating reminder is due after `now`, keeping its time of day. */
export function nextRepeat(at: number, repeat: 'daily' | 'weekly' | 'monthly', now: number = Date.now()): number {
  const d = new Date(at);
  const day = d.getDate();
  for (let i = 0; i < 1000 && d.getTime() <= now; i++) {
    if (repeat === 'daily') d.setDate(d.getDate() + 1);
    else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
    else {
      // The same day next month, or that month's last day when it is shorter.
      d.setDate(1);
      d.setMonth(d.getMonth() + 1);
      d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    }
  }
  return d.getTime();
}

export type DueBucket = 'Overdue' | 'Today' | 'Tomorrow' | 'This week' | 'Later' | 'No date';
export const DUE_ORDER: DueBucket[] = ['Overdue', 'Today', 'Tomorrow', 'This week', 'Later', 'No date'];

/** Which part of the to-do list a reminder time belongs in. */
export function dueBucket(at: number | null, now: number = Date.now()): DueBucket {
  if (at == null) return 'No date';
  if (at < now) return 'Overdue';
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const days = Math.floor((at - start.getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return 'This week';
  return 'Later';
}

export const repeatLabel = { daily: 'Every day', weekly: 'Every week', monthly: 'Every month' } as const;

// ---------- [[links]], @people and a guess at English ----------

/** The note titles a text points at with [[Title]]. */
export function wikiLinks(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\[\[([^\[\]\n]{1,140})\]\]/g)) {
    const title = m[1].split('|')[0].trim();
    if (title) out.add(title);
  }
  return [...out];
}

/** The same text with every [[old]] pointing at [[next]] instead. */
export function renameWikiLink(text: string, old: string, next: string): string {
  const esc = old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`\\[\\[\\s*${esc}\\s*(\\|[^\\]\\n]*)?\\]\\]`, 'gi'), (_m, alias?: string) => `[[${next}${alias ?? ''}]]`);
}

/** People named with @name. An email address is not a person. */
export function peopleIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(^|[\s(,;])@([\p{L}][\p{L}\p{N}_-]{1,30})/gu)) out.add(`@${m[2].toLowerCase()}`);
  return [...out];
}

const ENGLISH = new Set(
  'the a an and or but to of in on at for with from by is are was were be been it its this that these those i you he she we they my your our me not no do does did have has had will would can could should what when where why how if then so as about just more some any all there here up out into over than too very also only need want get got make made go going call buy check send write read ask tell remember idea note notes meeting today tomorrow week day time new next'.split(
    ' ',
  ),
);

/**
 * Whether text is plainly English already, so it needs no translating. Used to
 * avoid asking the translator about English notes at all. Anything in another
 * script is not English; short Latin text with no common English word is "cannot tell".
 */
export function looksEnglish(text: string): boolean {
  const words = text.toLowerCase().match(/[\p{L}']+/gu) ?? [];
  if (words.length === 0) return true;
  if (/[^\u0000-ɏ -⁯₠-⃏]/.test(words.join(''))) return false;
  const ascii = words.every((w) => /^[a-z']+$/.test(w));
  const hits = words.filter((w) => ENGLISH.has(w)).length;
  // A word or two with no accents is taken as English: a pack download for "Milk" helps nobody.
  if (words.length <= 3) return ascii;
  return hits * 5 >= words.length;
}

const wordSet = (text: string) => new Set((text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter((w) => !ENGLISH.has(w)));

/**
 * The first of `others` that says nearly the same thing as `text`: at least
 * three telling words, and four fifths of the words of both in common.
 */
export function nearDuplicate<T extends { id: string; text: string }>(text: string, others: T[]): T | null {
  const mine = wordSet(text);
  if (mine.size < 3) return null;
  for (const o of others) {
    const theirs = wordSet(o.text);
    if (theirs.size < 3) continue;
    let both = 0;
    for (const w of mine) if (theirs.has(w)) both += 1;
    if (both / (mine.size + theirs.size - both) >= 0.8) return o;
  }
  return null;
}

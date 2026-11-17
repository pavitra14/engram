/**
 * The pure parts of usage counts, kept apart so `scripts/check.ts` can test
 * them without React Native. The list of metrics here is the whole list: the
 * server rejects any other id, and docs/METRICS.md and docs/PRIVACY.md describe
 * exactly these. Ids are never reused.
 */

export const M = {
  opened: 1,
  typed: 10,
  voice: 11,
  shared: 12,
  photo: 13,
  file: 14,
  titledNote: 15,
  fromWidget: 16,
  fromTileOrShortcut: 17,
  openedNote: 20,
  searched: 21,
  map: 22,
  todoDone: 23,
  reminderSet: 24,
  review: 25,
  recap: 26,
  ask: 28,
  assistant: 29,
  focusDone: 30,
  backupExport: 31,
  backupRestore: 32,
  crashScreen: 33,
} as const;
export type Metric = (typeof M)[keyof typeof M];

/** Settings sent as "on" (ids 50 to 58). */
export const S = {
  black: 50,
  split: 51,
  mapHome: 52,
  meaning: 53,
  translation: 54,
  lock: 55,
  calendar: 56,
  briefs: 57,
  cloud: 58,
} as const;

/** The plain-words name of each id, shown in Settings under "See what's sent". */
export const NAMES: Record<number, string> = {
  1: 'Opened the app',
  10: 'Typed a quick thought',
  11: 'Recorded a voice note',
  12: 'Shared something in',
  13: 'Took a photo or scan',
  14: 'Attached or imported a file',
  15: 'Wrote a titled note',
  16: 'Opened from a widget',
  17: 'Opened from the tile or a shortcut',
  20: 'Opened a note',
  21: 'Searched',
  22: 'Opened the map',
  23: 'Finished a to-do',
  24: 'Set a reminder',
  25: 'Opened the weekly review',
  26: 'Opened the month recap',
  28: 'Asked your notes',
  29: 'Opened Chat with Claude or ChatGPT',
  30: 'Finished a focus session',
  31: 'Exported a backup',
  32: 'Restored a backup',
  33: 'Saw the crash screen',
  50: 'Black theme',
  51: 'Split home layout',
  52: 'Map home layout',
  53: 'Understand meaning',
  54: 'Translation',
  55: 'App lock',
  56: 'Calendar',
  57: 'Morning or evening notes',
  58: 'Signed in to Engram Cloud',
  70: 'Opened on 1 of the last 7 days',
  71: 'Opened on 2 to 3 of the last 7 days',
  72: 'Opened on 4 to 6 of the last 7 days',
  73: 'Opened on all of the last 7 days',
  80: 'Installed under a week ago',
  81: 'Installed 1 to 4 weeks ago',
  82: 'Installed 1 to 3 months ago',
  83: 'Installed longer ago',
  90: 'Under 10 notes',
  91: '10 to 99 notes',
  92: '100 to 999 notes',
  93: '1,000 or more notes',
};

/** Most uses of one metric sent for one day; the server caps at the same number. */
export const CAP = 500;
/** Finished days kept waiting when sending fails or the phone is offline. Older ones are dropped. */
export const KEEP_DAYS = 7;

/** The phone's own calendar date, YYYY-MM-DD. */
export function localDay(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const DAY = 86_400_000;

export function activeBucket(daysActive: number): number {
  if (daysActive >= 7) return 73;
  if (daysActive >= 4) return 72;
  if (daysActive >= 2) return 71;
  return 70;
}

export function ageBucket(installedAt: number, now: number): number {
  const days = (now - installedAt) / DAY;
  if (days < 7) return 80;
  if (days < 28) return 81;
  if (days < 91) return 82;
  return 83;
}

export function notesBucket(n: number): number {
  if (n >= 1000) return 93;
  if (n >= 100) return 92;
  if (n >= 10) return 91;
  return 90;
}

/** The last 7 local dates the app was opened, newest first, with `day` added. */
export function rememberDay(days: string[], day: string): string[] {
  return [day, ...days.filter((d) => d !== day)].sort().reverse().slice(0, 7);
}

/** How many of the 7 days ending on `day` are in `days`. */
export function daysActiveIn(days: string[], day: string): number {
  const end = Date.parse(`${day}T12:00:00Z`);
  const window = new Set(Array.from({ length: 7 }, (_, i) => new Date(end - i * DAY).toISOString().slice(0, 10)));
  return days.filter((d) => window.has(d)).length;
}

export type UsageMessage = { day: string; v: string; a: Record<string, number>; s: number[]; b: number[] };

/** The message for one finished day, exactly as it is sent. */
export function buildMessage(day: string, version: string, counts: { metric: number; uses: number }[], settings: number[], buckets: number[]): UsageMessage {
  const a: Record<string, number> = {};
  for (const c of counts) if (NAMES[c.metric] && c.metric < 50 && c.uses > 0) a[String(c.metric)] = Math.min(CAP, Math.round(c.uses));
  return { day, v: version.replace(/[^0-9.]/g, ''), a, s: [...new Set(settings)].sort((x, y) => x - y), b: buckets };
}

/** Which waiting days to send (finished ones, newest KEEP_DAYS) and which to drop. */
export function plan(days: string[], today: string): { send: string[]; drop: string[] } {
  const done = days.filter((d) => d < today).sort();
  const send = done.slice(-KEEP_DAYS);
  return { send, drop: done.filter((d) => !send.includes(d)) };
}

/** "See what's sent", in plain words. */
export function describe(m: UsageMessage): string[] {
  const lines = [`Day: ${m.day}`, `App version: ${m.v}`];
  for (const [k, n] of Object.entries(m.a)) lines.push(`${NAMES[Number(k)]}: ${n}`);
  if (m.s.length) lines.push(`Switched on: ${m.s.map((id) => NAMES[id]).join(', ')}`);
  for (const id of m.b) lines.push(NAMES[id]);
  return lines;
}

/** The question, worded the same in the tour, the one-time sheet and Settings. */
export const ASK_TITLE = 'Help shape Engram?';
export const ASK_BODY =
  'Engram can send one anonymous count a day of which features you used, so its maker knows what to fix and build next. Never your notes, and nothing that identifies you or this phone. You can change this any time in Settings.';

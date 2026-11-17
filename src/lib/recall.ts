/**
 * Bringing things back: "Remember this" on a widening schedule, notes from this
 * day in the past, a random older note, decisions to look back on, quiet
 * milestones and the month in numbers. Plain logic, no React Native.
 */
const DAY = 86_400_000;
const startOfDay = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** A note marked to remember comes back after this many days, one after the other, then stops. */
export const RECALL_DAYS = [1, 3, 7, 21, 60];
/** recall_step for a decision: it comes back once, three months on, to ask how it turned out. */
export const DECISION_STEP = 100;
export const DECISION_DAYS = 90;

/** The first showing: tomorrow morning at nine. */
export function firstRecall(now: number = Date.now()): { step: number; at: number } {
  return { step: 0, at: startOfDay(now) + RECALL_DAYS[0] * DAY + 9 * 3_600_000 };
}

/** After a showing was answered "keep": when it comes back next, or null when the schedule is finished. */
export function nextRecall(step: number, now: number = Date.now()): { step: number; at: number } | null {
  const next = step + 1;
  if (step >= DECISION_STEP || next >= RECALL_DAYS.length) return null;
  return { step: next, at: startOfDay(now) + RECALL_DAYS[next] * DAY + 9 * 3_600_000 };
}

export function decisionRecall(now: number = Date.now()): { step: number; at: number } {
  return { step: DECISION_STEP, at: startOfDay(now) + DECISION_DAYS * DAY + 9 * 3_600_000 };
}

type Recallable = { id: string; recall_step: number | null; recall_at: number | null };

/** Notes whose time to come back has arrived, the longest-waiting first. */
export function dueRecalls<T extends Recallable>(thoughts: T[], now: number = Date.now()): T[] {
  return thoughts.filter((t) => t.recall_at != null && t.recall_at <= now).sort((a, b) => (a.recall_at ?? 0) - (b.recall_at ?? 0));
}

type Dated = { id: string; created_at: number };

/** A note written on this date one year, six months or one month ago, looking furthest back first. */
export function onThisDay<T extends Dated>(thoughts: T[], now: number = Date.now()): { thought: T; ago: string } | null {
  const today = new Date(now);
  for (const [months, ago] of [[12, 'A year ago today'], [6, 'Six months ago today'], [1, 'A month ago today']] as const) {
    const then = new Date(today.getFullYear(), today.getMonth() - months, today.getDate());
    // The 31st has no match in a 30-day month; skip rather than show the wrong day.
    if (then.getDate() !== today.getDate()) continue;
    const from = then.getTime();
    const hit = thoughts.find((t) => t.created_at >= from && t.created_at < from + DAY);
    if (hit) return { thought: hit, ago };
  }
  return null;
}

/** A random note at least a week old. `roll` is a number from 0 up to 1, passed in so the tests are steady. */
export function surprise<T extends Dated>(thoughts: T[], roll: number, now: number = Date.now()): T | null {
  const old = thoughts.filter((t) => now - t.created_at >= 7 * DAY);
  const pool = old.length > 0 ? old : thoughts;
  return pool.length ? pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))] : null;
}

const NOTE_MARKS = [10, 50, 100, 250, 500, 1000, 2500, 5000];
const STREAK_MARKS = [7, 30, 100, 365];

/**
 * The newest milestone reached and not yet shown, or null. `seen` is the list of
 * milestone keys already shown; the caller stores the returned key.
 */
export function milestone(count: number, streak: number, seen: string[]): { key: string; text: string } | null {
  const reached: { key: string; text: string }[] = [];
  for (const n of NOTE_MARKS) if (count >= n) reached.push({ key: `notes-${n}`, text: `That was your ${n === 1000 ? '1,000' : n === 2500 ? '2,500' : n === 5000 ? '5,000' : n}th thought.` });
  for (const n of STREAK_MARKS) if (streak >= n) reached.push({ key: `streak-${n}`, text: `${n} days in a row.` });
  const fresh = reached.filter((r) => !seen.includes(r.key));
  return fresh.length ? fresh[fresh.length - 1] : null;
}

export type Recap = {
  label: string;
  notes: number;
  done: number;
  days: number;
  busiest: { day: number; count: number } | null;
  longestStreak: number;
  topGroup: { name: string; count: number } | null;
  forgotten: string | null;
};

type RecapThought = Dated & { todo?: number; done_at?: number | null; updated_at?: number };

/**
 * One calendar month in numbers. `offset` 0 is the month `now` is in, -1 the one before.
 * `groupOf` gives a thought's group name, if it has one.
 */
export function monthRecap(thoughts: RecapThought[], groupOf: (id: string) => string | null, now: number = Date.now(), offset = 0): Recap {
  const d = new Date(now);
  const from = new Date(d.getFullYear(), d.getMonth() + offset, 1).getTime();
  const to = new Date(d.getFullYear(), d.getMonth() + offset + 1, 1).getTime();
  const mine = thoughts.filter((t) => t.created_at >= from && t.created_at < to);
  const perDay = new Map<number, number>();
  const perGroup = new Map<string, number>();
  for (const t of mine) {
    const day = startOfDay(t.created_at);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
    const g = groupOf(t.id);
    if (g) perGroup.set(g, (perGroup.get(g) ?? 0) + 1);
  }
  let busiest: Recap['busiest'] = null;
  for (const [day, count] of perDay) if (!busiest || count > busiest.count) busiest = { day, count };
  let topGroup: Recap['topGroup'] = null;
  for (const [name, count] of perGroup) if (!topGroup || count > topGroup.count) topGroup = { name, count };
  // The longest run of days in a row with a note, inside the month.
  let longest = 0;
  let run = 0;
  for (let day = startOfDay(from); day < to; day = startOfDay(day + DAY + 3_600_000)) {
    run = perDay.has(day) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  // A note from the month that has not been touched since it was written.
  const quiet = mine.filter((t) => !t.todo && (t.updated_at ?? t.created_at) - t.created_at < 60_000).sort((a, b) => a.created_at - b.created_at)[0];
  return {
    label: new Date(from).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    notes: mine.length,
    done: thoughts.filter((t) => t.todo === 1 && t.done_at != null && t.done_at >= from && t.done_at < to).length,
    days: perDay.size,
    busiest,
    longestStreak: longest,
    topGroup,
    forgotten: quiet?.id ?? null,
  };
}

// ---------- habits ----------

export type Habit = { id: string; name: string; days: number[] };
const dayNumber = (ts: number) => Math.round(startOfDay(ts) / DAY);

export function habitDoneToday(h: Habit, now: number = Date.now()): boolean {
  return h.days.includes(dayNumber(now));
}

/** Days in a row a habit was kept, ending today or yesterday. */
export function habitStreak(h: Habit, now: number = Date.now()): number {
  const days = new Set(h.days);
  let day = dayNumber(now);
  if (!days.has(day)) day -= 1;
  let n = 0;
  while (days.has(day)) {
    n += 1;
    day -= 1;
  }
  return n;
}

/** Ticks or unticks today. Only the last 400 days are kept. */
export function toggleHabit(h: Habit, now: number = Date.now()): Habit {
  const today = dayNumber(now);
  const days = h.days.includes(today) ? h.days.filter((d) => d !== today) : [...h.days, today];
  return { ...h, days: days.filter((d) => d > today - 400).sort((a, b) => a - b) };
}

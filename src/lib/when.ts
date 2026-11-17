/**
 * Reads a reminder time out of plain English: "call the bank Friday 10am",
 * "renew passport in 2 weeks". Plain logic, no React Native, so the Node tests
 * run it. The note keeps its words as written; only the time is taken from them.
 *
 * It is deliberately cautious. A reminder nobody asked for is worse than one
 * that has to be set by hand, so a phrase must name a day, a relative time or
 * a clock time with am/pm (or "at") before anything is set. A bare "today"
 * with no time sets nothing.
 */
export type When = { at: number; phrase: string };

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
// "Sat", "Sun" and "Wed" are words in their own right, so the short forms count only after on, next or this.
const DAY_RE = '(sunday|mon(?:day)?|tue(?:s|sday)?|wednesday|thu(?:r|rs|rsday)?|fri(?:day)?|saturday)';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, couple: 2, few: 3 };
const UNIT_MS: Record<string, number> = { min: 60_000, hour: 3_600_000, hr: 3_600_000 };

type Clock = { h: number; m: number; phrase: string };

/** A clock time: "6pm", "6:30 pm", "18:30", "at 6", "noon". */
function clockIn(text: string): Clock | null {
  let m = text.match(/\b(?:at\s+)?(noon|midday|midnight)\b/i);
  if (m) return { h: /midnight/i.test(m[1]) ? 0 : 12, m: 0, phrase: m[0] };
  m = text.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?![a-z])/i);
  if (m) {
    let h = Number(m[1]);
    const mins = m[2] ? Number(m[2]) : 0;
    if (h < 1 || h > 12 || mins > 59) return null;
    const pm = /^p/i.test(m[3]);
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
    return { h, m: mins, phrase: m[0] };
  }
  m = text.match(/\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (m) return { h: Number(m[1]), m: Number(m[2]), phrase: m[0] };
  // "at 6" with no am or pm: the next time the clock shows it, between 7 in the morning and 7 at night.
  m = text.match(/\bat\s+(\d{1,2})\b(?!\s*(?:%|percent|[a-z]))/i);
  if (m) {
    const n = Number(m[1]);
    if (n < 1 || n > 12) return null;
    return { h: n < 7 ? n + 12 : n, m: 0, phrase: m[0] };
  }
  return null;
}

const count = (word: string): number | null => {
  const w = word.toLowerCase();
  if (/^\d+$/.test(w)) return Number(w);
  return NUM[w] ?? null;
};

/**
 * The reminder time a line of text asks for, or null. `now` is passed in so the tests are steady.
 * Only the first line is read: a long note's body is not a to-do.
 */
export function parseWhen(input: string, now: number = Date.now()): When | null {
  const text = input.split('\n')[0].slice(0, 200);
  if (/https?:\/\//i.test(text)) return null;
  const base = new Date(now);
  const clock = clockIn(text);
  const dayAt = (d: Date, fallbackHour = 9): number => {
    const out = new Date(d);
    out.setHours(clock ? clock.h : fallbackHour, clock ? clock.m : 0, 0, 0);
    return out.getTime();
  };
  const withClock = (phrase: string) => (clock && !phrase.includes(clock.phrase) ? `${phrase} ${clock.phrase}` : phrase);
  let m: RegExpMatchArray | null;

  // "in 20 minutes", "in an hour", "in 2 days", "in a couple of weeks", "in 3 months"
  m = text.match(/\bin\s+(\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|a\s+couple(?:\s+of)?|a\s+few)\s+(min(?:ute)?s?|hours?|hrs?|days?|weeks?|months?)\b/i);
  if (m) {
    const n = count(m[1].replace(/^a\s+/i, '').replace(/\s+of$/i, ''));
    const unit = m[2].toLowerCase();
    if (n && n > 0 && n < 1000) {
      if (/^(min|hour|hr)/.test(unit)) {
        const ms = UNIT_MS[unit.startsWith('min') ? 'min' : 'hour'];
        return { at: now + n * ms, phrase: m[0] };
      }
      const d = new Date(base);
      if (unit.startsWith('day')) d.setDate(d.getDate() + n);
      else if (unit.startsWith('week')) d.setDate(d.getDate() + n * 7);
      else d.setMonth(d.getMonth() + n);
      return { at: dayAt(d), phrase: withClock(m[0]) };
    }
  }

  // "tomorrow", "day after tomorrow", "tonight", "this evening", "today 5pm"
  m = text.match(/\b(day after tomorrow|tomorrow|tmrw|tonight|this (?:evening|afternoon|morning)|today)\b/i);
  if (m) {
    const w = m[1].toLowerCase();
    const d = new Date(base);
    if (w === 'day after tomorrow') d.setDate(d.getDate() + 2);
    else if (w === 'tomorrow' || w === 'tmrw') d.setDate(d.getDate() + 1);
    const hour = w === 'tonight' ? 20 : w.endsWith('evening') ? 18 : w.endsWith('afternoon') ? 15 : 9;
    // "today" alone says nothing about when.
    if (w === 'today' && !clock) return null;
    let at = dayAt(d, hour);
    // "tonight at 8": an hour before noon given for tonight means the evening.
    if (w === 'tonight' && clock && clock.h < 12) at += 12 * 3_600_000;
    if (at <= now) return null;
    return { at, phrase: withClock(m[0]) };
  }

  // "next week", "next month"
  m = text.match(/\bnext\s+(week|month)\b/i);
  if (m) {
    const d = new Date(base);
    if (m[1].toLowerCase() === 'week') d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    return { at: dayAt(d), phrase: withClock(m[0]) };
  }

  // "Friday", "on Friday", "next Friday" (the one in the week after this one), "this weekend"
  m = text.match(new RegExp(`\\b(?:(next|this|on)\\s+)?${DAY_RE}\\b`, 'i')) ?? text.match(/\b(next|this|on)\s+(sat|sun|wed)\b/i);
  const weekend = text.match(/\b(?:this\s+|at the\s+)?weekend\b/i);
  if (m || weekend) {
    const want = m ? DAYS.findIndex((d) => d.startsWith(m![2].toLowerCase().slice(0, 3))) : 6;
    const d = new Date(base);
    let ahead = (want - d.getDay() + 7) % 7;
    if (ahead === 0) ahead = clock && dayAt(d) > now ? 0 : 7;
    if (m && m[1]?.toLowerCase() === 'next') {
      // The day in next week, counting weeks from Monday.
      const toMonday = (8 - d.getDay()) % 7 || 7;
      ahead = toMonday + ((want + 6) % 7);
    }
    d.setDate(d.getDate() + ahead);
    return { at: dayAt(d, weekend && !m ? 10 : 9), phrase: withClock((m ?? weekend)![0]) };
  }

  // "3 Dec", "3rd of December", "Dec 3", "on the 14th"
  m = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+${MONTH_RE}\\b`, 'i'));
  const m2 = m ? null : text.match(new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'));
  if (m || m2) {
    const day = Number(m ? m[1] : m2![2]);
    const month = MONTHS.indexOf((m ? m[2] : m2![1]).toLowerCase().slice(0, 3));
    if (day >= 1 && day <= 31 && month >= 0) {
      const d = new Date(base.getFullYear(), month, day);
      if (d.getMonth() !== month) return null;
      if (dayAt(d) <= now) d.setFullYear(d.getFullYear() + 1);
      return { at: dayAt(d), phrase: withClock((m ?? m2)![0]) };
    }
  }
  m = text.match(/\bon the (\d{1,2})(?:st|nd|rd|th)\b/i);
  if (m) {
    const day = Number(m[1]);
    if (day >= 1 && day <= 31) {
      const d = new Date(base.getFullYear(), base.getMonth(), day);
      if (dayAt(d) <= now) d.setMonth(d.getMonth() + 1);
      if (d.getDate() === day) return { at: dayAt(d), phrase: withClock(m[0]) };
    }
  }

  // A clock time alone, said clearly ("at 6", "6pm", "18:30"): today if still ahead, otherwise tomorrow.
  if (clock && /\b(at|by)\s|am|pm|a\.m|p\.m|noon|midday|midnight/i.test(clock.phrase)) {
    const d = new Date(base);
    if (dayAt(d) <= now) d.setDate(d.getDate() + 1);
    return { at: dayAt(d), phrase: clock.phrase };
  }
  return null;
}

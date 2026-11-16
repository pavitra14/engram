/**
 * The small things that make coming back worthwhile: a question a day, a
 * streak, and the numbers for the weekly review. Plain logic, no React Native.
 */
export type Dated = { created_at: number; todo?: number; done_at?: number | null; updated_at?: number };

const DAY = 86_400_000;
const startOfDay = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Questions that are quick to answer and tend to turn into something to do. One a day, in order, then round again. */
export const QUESTIONS = [
  'What is one thing you keep putting off?',
  'What did you learn this week that you want to remember?',
  'Which idea of yours deserves an hour this week?',
  'What is taking more of your attention than it should?',
  'Who should you get back to?',
  'What would make today feel finished?',
  'What are you curious about right now?',
  'What went better than expected lately, and why?',
  'What is one small thing that would make tomorrow easier?',
  'What have you been meaning to read, watch or try?',
  'What decision are you avoiding?',
  'What did someone say recently that stuck with you?',
  'What would you do this month if it could not fail?',
  'What is working well that you should do more of?',
  'What can you stop doing?',
  'What are you grateful for today?',
  'What problem do you wish someone would solve?',
  'What is the next step on the thing that matters most?',
  'What did you change your mind about recently?',
  'What would you tell yourself a year ago?',
  'What is worth writing down before you forget it?',
];

export function questionFor(now: number = Date.now()): string {
  return QUESTIONS[Math.floor(startOfDay(now) / DAY) % QUESTIONS.length];
}

/** How many days in a row, ending today or yesterday, have at least one note. */
export function streak(thoughts: Dated[], now: number = Date.now()): number {
  const days = new Set(thoughts.map((t) => startOfDay(t.created_at)));
  let day = startOfDay(now);
  // Today not written yet does not break a streak that ran through yesterday.
  if (!days.has(day)) day = startOfDay(day - 1);
  let n = 0;
  while (days.has(day)) {
    n += 1;
    day = startOfDay(day - 1);
  }
  return n;
}

export type Week = { captured: number; done: number; open: number; overdue: number; streak: number; perDay: number[] };

/** The last seven days, today included. perDay runs oldest to newest. */
export function weekOf(thoughts: (Dated & { remind_at?: number | null })[], now: number = Date.now()): Week {
  const from = startOfDay(now) - 6 * DAY;
  const perDay = Array.from({ length: 7 }, () => 0);
  let captured = 0;
  let done = 0;
  let open = 0;
  let overdue = 0;
  for (const t of thoughts) {
    if (t.created_at >= from) {
      captured += 1;
      perDay[Math.min(6, Math.floor((startOfDay(t.created_at) - from) / DAY))] += 1;
    }
    if (t.todo === 1) {
      if (t.done_at) {
        if (t.done_at >= from) done += 1;
      } else {
        open += 1;
        if (t.remind_at && t.remind_at < now) overdue += 1;
      }
    }
  }
  return { captured, done, open, overdue, streak: streak(thoughts, now), perDay };
}

/** Starting points for a new note. Each is a title and a formatted body to fill in. */
export const TEMPLATES: { name: string; title: string; html: string }[] = [
  { name: 'Idea', title: '', html: '<html><h2>The idea</h2><p></p><h2>Why it matters</h2><p></p><h2>Smallest first step</h2><ul data-type="checkbox"><li></li></ul></html>' },
  { name: 'Meeting', title: 'Meeting: ', html: '<html><h2>Decided</h2><ul><li></li></ul><h2>To do</h2><ul data-type="checkbox"><li></li></ul><h2>Open questions</h2><ul><li></li></ul></html>' },
  { name: 'Book or article', title: '', html: '<html><h2>In one sentence</h2><p></p><h2>What I want to remember</h2><ul><li></li></ul><h2>What I will do differently</h2><p></p></html>' },
  { name: 'Decision', title: 'Decide: ', html: '<html><h2>Options</h2><ol><li></li></ol><h2>What matters most</h2><p></p><h2>Leaning toward</h2><p></p><h2>Decide by</h2><p></p></html>' },
  { name: 'Day', title: '', html: '<html><h2>Went well</h2><ul><li></li></ul><h2>Did not</h2><ul><li></li></ul><h2>Tomorrow</h2><ul data-type="checkbox"><li></li></ul></html>' },
];

/** The plain parts of "Ask your notes": picking search words and wording the prompt. No React Native, so the Node tests run it. */

const SKIP = new Set(
  'a an and are as at be been but by can could did do does for from had has have how i if in is it its me my of on or our should so than that the their then there these they this those to was we were what when where which who whom whose why will with would you your about any did note notes wrote write written say said tell'.split(
    ' ',
  ),
);

/** The words of a question worth searching for, most telling first. */
export function questionTerms(question: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of question.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []) {
    if (SKIP.has(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out.sort((a, b) => b.length - a.length).slice(0, 6);
}

export type Source = { id: string; title: string; text: string; when: string };

export const ASK_SYSTEM =
  "You answer questions using only the user's own notes, which are given to you numbered. " +
  'Answer in a few plain sentences. After each fact put the number of the note it came from in square brackets, like [2]. ' +
  'If the notes do not contain the answer, say "Your notes do not say." and nothing else. Never use outside knowledge.';

/** The message sent to the model: the notes, numbered, then the question. */
export function askPrompt(question: string, sources: Source[]): string {
  const notes = sources.map((s, i) => `[${i + 1}] ${s.title} (${s.when})\n${s.text}`.trim()).join('\n\n');
  return `Notes:\n\n${notes}\n\nQuestion: ${question.trim()}`;
}

/** The answer as shown: anything the model thought aloud is removed. */
export function cleanAnswer(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?(<\/think>|$)/g, '')
    .replace(/<\|[^|>]*\|>/g, '')
    .trim();
}

/** Which of the numbered notes the answer points at, in order of first mention. */
export function citedNumbers(answer: string, count: number): number[] {
  const out: number[] = [];
  for (const m of answer.matchAll(/\[(\d{1,2})\]/g)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= count && !out.includes(n)) out.push(n);
  }
  return out;
}

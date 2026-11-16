/** The parts of capture that are plain logic, kept apart so the Node tests can import them. */

/** Longest single line that still reads as a title. Anything longer is treated as body text. */
const TITLE_MAX = 140;

/**
 * Where quickly captured words go. A single line is the note's title, with the
 * body left empty to fill in later. Several lines are a title (the first line)
 * and a body (the rest). One very long line is a body with no title.
 */
export function splitQuick(text: string): { title: string | null; body: string } {
  const trimmed = text.trim();
  const at = trimmed.indexOf('\n');
  const first = (at === -1 ? trimmed : trimmed.slice(0, at)).trim();
  if (!first || first.length > TITLE_MAX) return { title: null, body: trimmed };
  return { title: first, body: at === -1 ? '' : trimmed.slice(at + 1).trim() };
}

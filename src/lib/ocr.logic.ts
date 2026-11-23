/**
 * Turns what the recogniser saw into readable text. No React Native imports, so
 * scripts/check.ts can run it in Node.
 *
 * The recogniser (modules/engram-ocr) hands back lines of text with where each
 * sits in the picture. A tall picture is read in overlapping strips; the module
 * keeps each line only in the strip that owns that part of the picture, so no
 * line appears twice. What is left here is putting the lines back into
 * paragraphs.
 */

/** One line of text as the native module reports it. top and bottom are in the picture's own pixels. */
export type OcrLine = { text: string; top: number; bottom: number; block: number; strip: number };

/** More than this and the text is cut. A guard against a runaway read, far above any real page. */
export const MAX_TEXT = 60_000;

/**
 * Whether a line is the next line of the paragraph the previous line belongs to,
 * when the two were read in different strips: it sits just below it, with no more
 * space between them than the gap between two lines of one paragraph.
 */
function continues(prev: OcrLine, next: OcrLine): boolean {
  if (prev.strip === next.strip) return false;
  const height = Math.max(prev.bottom - prev.top, 1);
  const gap = next.top - prev.bottom;
  return gap <= height * 0.6;
}

/**
 * Lines in reading order to paragraphs. Lines the recogniser put in one block are
 * one paragraph, with their line breaks (which only mark where the picture wrapped)
 * replaced by spaces. A paragraph cut by the edge between two strips is joined again.
 */
export function paragraphsFromLines(lines: OcrLine[]): string[] {
  const paragraphs: OcrLine[][] = [];
  for (const line of lines) {
    if (!line.text.trim()) continue;
    const last = paragraphs[paragraphs.length - 1];
    const prev = last?.[last.length - 1];
    if (last && prev && (prev.block === line.block || continues(prev, line))) last.push(line);
    else paragraphs.push([line]);
  }
  return paragraphs.map((p) => p.map((l) => l.text.trim()).join(' '));
}

/** The older shape: one string per block, with the picture's own line breaks inside it. */
export function paragraphsFromBlocks(blocks: string[]): string[] {
  return blocks
    .map((b) =>
      String(b)
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .join(' '),
    )
    .filter(Boolean);
}

/** Paragraphs with a blank line between them, cut at MAX_TEXT. */
export function joinParagraphs(paragraphs: string[]): string {
  return paragraphs.join('\n\n').slice(0, MAX_TEXT);
}

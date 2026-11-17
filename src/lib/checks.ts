/**
 * Check boxes inside notes. The editor writes them as
 *   <ul data-type="checkbox"><li checked>done</li><li>not done</li></ul>
 * and only those count. Plain logic, so the Node tests run it.
 */
export type CheckItem = { index: number; text: string; done: boolean };

const LIST_RE = /<ul\b[^>]*data-type=["']checkbox["'][^>]*>([\s\S]*?)<\/ul>/gi;
const ITEM_RE = /<li\b([^>]*)>([\s\S]*?)<\/li>/gi;
const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .trim();
const isChecked = (attrs: string) => /(^|\s)checked(\s|=|$)/i.test(attrs);

/** Every check box in a note, in order. Empty boxes (no words yet) are left out but still counted in `index`. */
export function checkItems(html: string | null | undefined): CheckItem[] {
  if (!html) return [];
  const out: CheckItem[] = [];
  let index = 0;
  for (const list of html.matchAll(LIST_RE)) {
    for (const item of list[1].matchAll(ITEM_RE)) {
      const text = words(item[2]);
      if (text) out.push({ index, text, done: isChecked(item[1]) });
      index += 1;
    }
  }
  return out;
}

/** The same note with one check box ticked or unticked. Everything else is left exactly as it was. */
export function toggleCheck(html: string, index: number, done: boolean): string {
  let n = 0;
  return html.replace(LIST_RE, (list) =>
    list.replace(ITEM_RE, (item, attrs: string, inner: string) => {
      const mine = n === index;
      n += 1;
      if (!mine) return item;
      const rest = attrs.replace(/\s*checked(=["'][^"']*["'])?/gi, '');
      return `<li${rest}${done ? ' checked' : ''}>${inner}</li>`;
    }),
  );
}

/** How many boxes there are and how many are ticked, across several notes. */
export function progress(htmls: (string | null | undefined)[]): { done: number; total: number; next: string | null } {
  let done = 0;
  let total = 0;
  let next: string | null = null;
  for (const h of htmls) {
    for (const c of checkItems(h)) {
      total += 1;
      if (c.done) done += 1;
      else if (!next) next = c.text;
    }
  }
  return { done, total, next };
}

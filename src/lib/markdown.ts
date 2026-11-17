/**
 * Notes out as Markdown files and in from Markdown, plain text and Google Keep.
 * Plain logic, no React Native, so the Node tests run it.
 */
const ENT: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const unescape = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENT[m] ?? m);
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Bold, italic and the rest inside one line. */
function inline(html: string): string {
  return unescape(
    html
      .replace(/<br\s*\/?>/gi, '  \n')
      .replace(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
      .replace(/<(i|em)\b[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
      .replace(/<(s|strike|del)\b[^>]*>([\s\S]*?)<\/\1>/gi, '~~$2~~')
      .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
      .replace(/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
      .replace(/<[^>]+>/g, ''),
  ).trim();
}

/** A formatted note's body as Markdown. Check boxes become "- [ ]" and "- [x]". */
export function htmlToMarkdown(html: string): string {
  const out: string[] = [];
  const blocks = /<(h[1-6]|p|blockquote|codeblock|ul|ol)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  for (const m of html.matchAll(blocks)) {
    const tag = m[1].toLowerCase();
    const inner = m[3];
    if (tag === 'ul' || tag === 'ol') {
      const checks = /data-type=["']checkbox["']/i.test(m[2]);
      let n = 0;
      for (const li of inner.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/gi)) {
        n += 1;
        const mark = checks ? (/(^|\s)checked(\s|=|$)/i.test(li[1]) ? '- [x] ' : '- [ ] ') : tag === 'ol' ? `${n}. ` : '- ';
        out.push(mark + inline(li[2]));
      }
      out.push('');
    } else if (tag.startsWith('h')) {
      out.push(`${'#'.repeat(Number(tag[1]))} ${inline(inner)}`, '');
    } else if (tag === 'blockquote') {
      out.push(...inline(inner).split('\n').map((l) => `> ${l}`), '');
    } else if (tag === 'codeblock') {
      out.push('```', unescape(inner.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')), '```', '');
    } else {
      const line = inline(inner);
      if (line) out.push(line, '');
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** A file name that is safe on any phone or computer. */
export function safeFileName(title: string): string {
  const clean = title.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return clean || 'Untitled';
}

export type ExportNote = {
  title: string;
  body: string;
  body_html: string | null;
  url: string | null;
  created_at: number;
  tags: string[];
  links: string[];
};

/** One note as a Markdown file that Obsidian and similar apps read: front matter, the body, then its links. */
export function noteToMarkdown(n: ExportNote): string {
  const lines = ['---', `created: ${new Date(n.created_at).toISOString()}`];
  if (n.tags.length) lines.push(`tags: [${n.tags.map((t) => t.replace(/[\s,[\]]+/g, '-')).join(', ')}]`);
  if (n.url) lines.push(`source: ${n.url}`);
  lines.push('---', '', `# ${n.title}`, '');
  const body = n.body_html ? htmlToMarkdown(n.body_html) : n.body;
  if (body) lines.push(body, '');
  if (n.links.length) lines.push('## Linked', '', ...n.links.map((l) => `- [[${l}]]`), '');
  return lines.join('\n');
}

/** Gives every note its own file name; two notes with the same title get " 2", " 3". */
export function fileNames(titles: string[]): string[] {
  const used = new Map<string, number>();
  return titles.map((t) => {
    const base = safeFileName(t);
    const n = (used.get(base.toLowerCase()) ?? 0) + 1;
    used.set(base.toLowerCase(), n);
    return n === 1 ? base : `${base} ${n}`;
  });
}

const inlineHtml = (md: string) =>
  escape(md)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

/** Markdown as the editor's HTML: headings, lists, check boxes, quotes and paragraphs. */
export function markdownToHtml(md: string): string {
  const out: string[] = [];
  let list: 'ul' | 'ol' | 'check' | null = null;
  const close = () => {
    if (list) out.push(list === 'ol' ? '</ol>' : '</ul>');
    list = null;
  };
  const open = (kind: 'ul' | 'ol' | 'check') => {
    if (list === kind) return;
    close();
    out.push(kind === 'ol' ? '<ol>' : kind === 'check' ? '<ul data-type="checkbox">' : '<ul>');
    list = kind;
  };
  for (const raw of md.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^\s*[-*+] \[( |x|X)\] (.*)$/))) {
      open('check');
      out.push(`<li${m[1] === ' ' ? '' : ' checked'}>${inlineHtml(m[2])}</li>`);
    } else if ((m = line.match(/^\s*[-*+] (.*)$/))) {
      open('ul');
      out.push(`<li>${inlineHtml(m[1])}</li>`);
    } else if ((m = line.match(/^\s*\d+[.)] (.*)$/))) {
      open('ol');
      out.push(`<li>${inlineHtml(m[1])}</li>`);
    } else {
      close();
      if ((m = line.match(/^(#{1,6}) (.*)$/))) out.push(`<h${m[1].length}>${inlineHtml(m[2])}</h${m[1].length}>`);
      else if ((m = line.match(/^> ?(.*)$/))) out.push(`<blockquote>${inlineHtml(m[1])}</blockquote>`);
      else if (line.trim()) out.push(`<p>${inlineHtml(line)}</p>`);
    }
  }
  close();
  return `<html>${out.join('')}</html>`;
}

export type ImportedNote = { title: string | null; body: string; html: string | null; tags: string[]; created_at?: number };

const plain = (html: string) =>
  unescape(
    html
      .replace(/<\/(p|h[1-6]|li|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  ).trim();

/** A .md or .txt file as a note. The title is the first heading, or else the file's name. */
export function parseTextFile(name: string, content: string): ImportedNote | null {
  let text = content.replace(/\r/g, '').replace(/^﻿/, '');
  const tags: string[] = [];
  let created: number | undefined;
  const fm = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    text = text.slice(fm[0].length);
    const t = fm[1].match(/^tags:\s*\[?([^\]\n]*)\]?/m);
    if (t) tags.push(...t[1].split(',').map((x) => x.trim().replace(/^#/, '')).filter(Boolean));
    const c = fm[1].match(/^created:\s*(.+)$/m);
    const when = c ? Date.parse(c[1].trim()) : NaN;
    if (!Number.isNaN(when)) created = when;
  }
  // The "Linked" list an Engram export adds is rebuilt from the [[links]] themselves.
  text = text.replace(/\n## Linked\n[\s\S]*$/, '\n');
  const base = name.replace(/^.*\//, '').replace(/\.(md|markdown|txt)$/i, '');
  let title: string | null = base || null;
  const h = text.match(/^\s*# (.+)\n?/);
  if (h) {
    title = h[1].trim();
    text = text.slice(h[0].length);
  }
  text = text.trim();
  if (!title && !text) return null;
  const isMd = /\.(md|markdown)$/i.test(name) && /^(#{1,6} |\s*[-*+] |\s*\d+[.)] |> )|\*\*|~~/m.test(text);
  const html = isMd ? markdownToHtml(text) : null;
  return { title, body: html ? plain(html) : text, html, tags, created_at: created };
}

/** One note from a Google Keep export (a .json file from Takeout). Null for anything else, or a note in Keep's bin. */
export function parseKeep(content: string): ImportedNote | null {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(content);
  } catch {
    return null;
  }
  if (!j || typeof j !== 'object' || j.isTrashed === true) return null;
  const hasText = typeof j.textContent === 'string';
  const list = Array.isArray(j.listContent) ? (j.listContent as { text?: unknown; isChecked?: unknown }[]) : null;
  if (!hasText && !list) return null;
  const title = typeof j.title === 'string' && j.title.trim() ? j.title.trim() : null;
  const tags = Array.isArray(j.labels) ? (j.labels as { name?: unknown }[]).map((l) => String(l?.name ?? '').trim()).filter(Boolean) : [];
  const micros = Number(j.createdTimestampUsec ?? j.userEditedTimestampUsec);
  const created_at = Number.isFinite(micros) && micros > 0 ? Math.round(micros / 1000) : undefined;
  if (list && list.length) {
    const html = `<html><ul data-type="checkbox">${list
      .map((i) => `<li${i.isChecked ? ' checked' : ''}>${escape(String(i.text ?? ''))}</li>`)
      .join('')}</ul></html>`;
    return { title, body: list.map((i) => String(i.text ?? '')).join('\n'), html, tags, created_at };
  }
  const body = String(j.textContent ?? '').trim();
  if (!title && !body) return null;
  return { title, body, html: null, tags, created_at };
}

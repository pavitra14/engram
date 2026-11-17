import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { copyAsync } from 'expo-file-system/legacy';
import type { Db } from '@/db/db';

import * as repo from '@/db/repo';
import type { NewThought, Thought, ThoughtKind } from '@/db/types';

import { dataChanged } from './bus';
import { splitQuick } from './capture.logic';
import { readPictureLater } from './ocr';
import { addTodo, cancelReminder, reconcileReminders, removeTodo } from './reminders';
import { translateLater } from './translate';
import { type Doc, nearMisses, relateAll, related } from './linker';
import { embedText, MODEL_ID, modelReady } from './semantic';
import { dueLabel, firstUrl, htmlToText, nearDuplicate, peopleIn, renameWikiLink, textToHtml, titleOf, wikiLinks } from './text';
import { showToast } from './toast';
import { parseWhen } from './when';
import { count, M } from '@/lib/usage';

async function corpus(db: Db): Promise<Doc[]> {
  const [thoughts, pairs, vectors] = await Promise.all([
    repo.listThoughts(db, { limit: 5000 }),
    repo.allTagPairs(db),
    repo.loadEmbeddings(db, MODEL_ID),
  ]);
  const tags = new Map<string, string[]>();
  for (const p of pairs) tags.set(p.thought_id, [...(tags.get(p.thought_id) ?? []), p.name]);
  return thoughts.map((t) => ({
    id: t.id,
    // An English version, when there is one, lets a Hindi note link to an English one by its words.
    // So do the words read from a picture.
    text: `${t.title ?? ''} ${t.body} ${t.en_title ?? ''} ${t.en_body ?? ''} ${t.seen_text ?? ''}`,
    url: t.url,
    tags: tags.get(t.id),
    vec: vectors.get(t.id),
  }));
}

/** Refreshes a thought's meaning vector, when the language model is switched on and loaded. */
async function understand(db: Db, id: string): Promise<void> {
  if (!modelReady()) return;
  try {
    const t = await repo.getThought(db, id);
    const vec = t ? await embedText(`${t.title ?? ''} ${t.body} ${t.seen_text ?? ''}`.trim()) : null;
    if (vec) await repo.saveEmbedding(db, id, MODEL_ID, vec);
  } catch {
    // Linking falls back to words for this thought.
  }
}

/** Recomputes the auto links for one thought (after create, edit or retag). */
export async function relink(db: Db, id: string): Promise<number> {
  await understand(db, id);
  const docs = await corpus(db);
  const target = docs.find((d) => d.id === id);
  if (!target) return 0;
  const no = await repo.dismissedPairs(db);
  // A pair the person said is unrelated is never linked again.
  const hits = related(target, docs).filter((h) => !no.has(id < h.id ? `${id}:${h.id}` : `${h.id}:${id}`));
  const hitIds = new Set(hits.map((h) => h.id));
  const stale = (await repo.neighboursOf(db, id)).filter((n) => n.link_kind === 'auto' && !hitIds.has(n.id));
  for (const n of stale) await repo.removeLink(db, id, n.id);
  for (const h of hits) await repo.upsertLink(db, id, h.id, 'auto', h.score);
  return hits.length;
}

export async function rebuildAllLinks(db: Db): Promise<number> {
  const no = await repo.dismissedPairs(db);
  const links = relateAll(await corpus(db)).filter((l) => !no.has(`${l.a}:${l.b}`));
  await repo.replaceAutoLinks(db, links);
  dataChanged();
  return links.length;
}

/**
 * What a note's own words ask for: a tag for each @person, and a link made by
 * hand to each note named with [[Title]].
 */
async function readMarks(db: Db, id: string, title: string | null, body: string): Promise<void> {
  const text = `${title ?? ''}\n${body}`;
  for (const person of peopleIn(text)) await repo.addTag(db, id, person);
  for (const name of wikiLinks(text)) {
    const target = await repo.findByTitle(db, name);
    if (target && target.id !== id) await repo.upsertLink(db, id, target.id, 'manual', 1);
  }
}

/** Says so, once, when a new note repeats an older one nearly word for word. */
async function noticeRepeat(db: Db, t: Thought): Promise<void> {
  if (t.kind !== 'text' && t.kind !== 'voice') return;
  const others = (await repo.listThoughts(db, { limit: 600 })).filter((o) => o.id !== t.id).map((o) => ({ id: o.id, text: `${o.title ?? ''} ${o.body}` }));
  const twin = nearDuplicate(`${t.title ?? ''} ${t.body}`, others);
  if (!twin) return;
  showToast('You wrote something like this before.', 'Open it', () => {
    // Imported here so this file does not pull the router into the Node tests.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('expo-router') as typeof import('expo-router')).router.push({ pathname: '/thought/[id]', params: { id: twin.id } });
  });
}

/** Save first, then link. Capture never waits on anything slower than one insert. */
export async function capture(db: Db, input: NewThought, { quiet = false }: { quiet?: boolean } = {}): Promise<Thought> {
  const thought = await repo.insertThought(db, input);
  try {
    await readMarks(db, thought.id, thought.title, thought.body);
    await relink(db, thought.id);
  } finally {
    dataChanged(thought.id);
  }
  translateLater(db, thought.id);
  if (thought.kind === 'image' && thought.media_path) readPictureLater(db, thought.id, thought.media_path, (id) => relink(db, id).then(() => dataChanged()));
  if (!quiet) void noticeRepeat(db, thought).catch(() => {});
  return thought;
}

/**
 * Words typed or spoken straight into Engram can carry their own reminder
 * ("call the bank Friday 10am"). Things shared or pasted in are someone else's
 * words, so they never set one.
 */
export async function remindFromWords(db: Db, thought: Thought, source?: string | null): Promise<Thought> {
  if (source === 'share' || source === 'clipboard' || source === 'import') return thought;
  if ((await repo.getMeta(db, 'plain_reminders')) === 'off') return thought;
  const found = parseWhen(thought.title ?? thought.body);
  if (!found) return thought;
  await addTodo(db, thought, found.at, null);
  count(M.reminderSet);
  const now = (await repo.getThought(db, thought.id)) ?? thought;
  showToast(`Reminder set: ${dueLabel(found.at).toLowerCase()}`, 'Undo', () => void removeTodo(db, now));
  return now;
}

export async function captureText(db: Db, raw: string, source?: string | null): Promise<Thought> {
  const text = raw.trim();
  const url = firstUrl(text);
  // A bare web address stays a link with nothing else; its address is what is shown.
  if (url && text.replace(url, '').trim().length < 3) return capture(db, { kind: 'link', body: '', url, source: source ?? null });
  const { title, body } = splitQuick(text);
  const thought = await capture(db, { kind: url ? 'link' : 'text', title, body, url, source: source ?? null });
  return remindFromWords(db, thought, source);
}

/** Saves a note written in the editor: a title, a body, and the body's formatting if it has any. */
export function captureNote(
  db: Db,
  note: { title: string; text: string; html: string | null },
  extra: Pick<NewThought, 'event_id' | 'event_title' | 'event_at' | 'source'> = {},
): Promise<Thought> {
  const title = note.title.trim();
  const body = note.text.trim();
  const url = firstUrl(body) ?? firstUrl(title);
  // A note that is only a web address is kept as a link, as it is from the capture bar.
  if (!title && !note.html && !extra.event_id) return captureText(db, body, extra.source);
  return capture(db, {
    kind: url ? 'link' : 'text',
    body,
    body_html: note.html,
    title: title || null,
    url,
    ...extra,
  });
}

/** Saves an edit to a note, then links it again. */
export async function saveNote(db: Db, id: string, note: { title: string; text: string; html: string | null }): Promise<void> {
  const before = await repo.getThought(db, id);
  const title = note.title.trim() || null;
  await repo.updateThought(db, id, { title, body: note.text.trim(), body_html: note.html });
  // Notes that point here with [[the old title]] follow the new one.
  if (before?.title && title && before.title !== title) {
    for (const m of await repo.mentioning(db, before.title)) {
      if (m.id === id) continue;
      await repo.updateThought(db, m.id, {
        title: m.title,
        body: renameWikiLink(m.body, before.title, title),
        body_html: m.body_html ? renameWikiLink(m.body_html, before.title, title) : null,
      });
    }
  }
  await readMarks(db, id, title, note.text);
  await relink(db, id);
  dataChanged();
  translateLater(db, id);
}

// ---------- media files ----------

function mediaDir(): Directory {
  const dir = new Directory(Paths.document, 'media');
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  return dir;
}

function extensionOf(name: string, mimeType: string | undefined, fallback: string): string {
  const fromName = name.match(/\.([a-z0-9]{1,8})(?:\?|$)/i);
  if (fromName) return fromName[1].toLowerCase();
  const fromMime = mimeType?.split('/')[1]?.split(/[;+]/)[0];
  const known: Record<string, string> = { jpeg: 'jpg', 'x-wav': 'wav', mpeg: 'mp3', 'x-m4a': 'm4a', quicktime: 'mov', plain: 'txt' };
  if (fromMime && fromMime !== '*' && fromMime !== 'octet-stream') return known[fromMime] ?? fromMime;
  return fallback;
}

/** Copies a file (file:// or content://) into the app's own storage and returns the new URI. */
export async function importMedia(uri: string, mimeType: string | undefined, fallbackExt: string, name?: string): Promise<string> {
  const dest = new File(mediaDir(), `${randomUUID()}.${extensionOf(name ?? uri, mimeType, fallbackExt)}`);
  // The legacy copy reads content:// addresses (what the share sheet and pickers hand over);
  // File.copy only accepts real file paths.
  await copyAsync({ from: uri, to: dest.uri });
  return dest.uri;
}

export function kindOfMime(mimeType: string | undefined, name?: string): ThoughtKind {
  const m = (mimeType ?? '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'voice';
  const ext = (name ?? '').split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'mkv', 'webm', '3gp'].includes(ext)) return 'video';
  if (['mp3', 'm4a', 'wav', 'ogg', 'aac', 'flac'].includes(ext)) return 'voice';
  return 'file';
}

function nameFromUri(uri: string): string | null {
  const last = decodeURIComponent(uri.split('?')[0]).split('/').pop() ?? '';
  return /\.[a-z0-9]{1,8}$/i.test(last) ? last : null;
}

/**
 * Saves any file as a thought: a picture, a video, a recording or a document.
 * The file is copied into Engram's own storage, so it stays even if the
 * original is deleted. Its name is searchable.
 */
export async function captureFile(
  db: Db,
  uri: string,
  { mimeType, name, source, durationMs }: { mimeType?: string; name?: string | null; source?: string; durationMs?: number | null } = {},
): Promise<Thought> {
  const fileName = name || nameFromUri(uri);
  const kind = kindOfMime(mimeType, fileName ?? undefined);
  const fallback = { image: 'jpg', video: 'mp4', voice: 'm4a', file: 'bin', text: 'txt', link: 'txt' }[kind];
  const media = await importMedia(uri, mimeType, fallback, fileName ?? undefined);
  let size: number | null = null;
  try {
    size = new File(media).size ?? null;
  } catch {
    size = null;
  }
  return capture(db, {
    kind,
    body: '',
    // Pictures and recordings read better untitled; videos and documents are known by their name.
    title: kind === 'video' || kind === 'file' ? fileName : null,
    media_path: media,
    file_name: fileName,
    mime_type: mimeType ?? null,
    file_size: size,
    duration_ms: durationMs ?? null,
    source: source ?? null,
  });
}

export function deleteMedia(uri: string | null): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // A missing file is fine; the row is what matters.
  }
}

/** Adds words to the end of a note that already exists (from the share sheet, for example). */
export async function appendToThought(db: Db, id: string, addition: string): Promise<Thought | null> {
  const t = await repo.getThought(db, id);
  const extra = addition.trim();
  if (!t || !extra) return t;
  const body = t.body ? `${t.body}\n\n${extra}` : extra;
  // A formatted note gets the new words as paragraphs of their own, just before its end.
  const paragraphs = textToHtml(extra).replace(/^<html>|<\/html>$/g, '');
  const html = t.body_html ? (/<\/html>\s*$/.test(t.body_html) ? t.body_html.replace(/<\/html>\s*$/, `${paragraphs}</html>`) : `${t.body_html}${paragraphs}`) : null;
  await repo.updateThought(db, id, { title: t.title, body: html ? htmlToText(html) : body, body_html: html });
  await readMarks(db, id, t.title, body);
  await relink(db, id);
  dataChanged();
  translateLater(db, id);
  return repo.getThought(db, id);
}

/** Deletes a thought for good, with its file. */
export async function deleteForever(db: Db, thought: Thought): Promise<void> {
  await cancelReminder(thought);
  await repo.deleteThought(db, thought.id);
  deleteMedia(thought.media_path);
  dataChanged();
}

/** Brings a thought back from the trash, with its reminder if that is still ahead. */
export async function restoreThought(db: Db, id: string): Promise<void> {
  await repo.restoreThought(db, id);
  await reconcileReminders(db, [id]);
  await relink(db, id);
  dataChanged();
}

/** How long the trash keeps things. */
export const TRASH_DAYS = 30;

/**
 * "Delete" moves a thought to the trash, where it waits 30 days. A message offers
 * Undo straight away. Its reminder is cancelled; its links are kept for if it comes back.
 */
export async function removeThought(db: Db, thought: Thought, { quiet = false }: { quiet?: boolean } = {}): Promise<void> {
  await cancelReminder(thought);
  await repo.trashThought(db, thought.id);
  dataChanged();
  if (!quiet) showToast(`Moved to the trash: ${titleOf(thought).slice(0, 40)}`, 'Undo', () => void restoreThought(db, thought.id));
}

/** Throws away what has been in the trash longer than 30 days. Run when the app opens. */
export async function emptyOldTrash(db: Db, now: number = Date.now()): Promise<number> {
  const old = await repo.listTrash(db, now - TRASH_DAYS * 86_400_000);
  for (const t of old) {
    await repo.deleteThought(db, t.id);
    deleteMedia(t.media_path);
  }
  if (old.length) dataChanged();
  return old.length;
}

export type Suggestion = { a: Thought; b: Thought };

/**
 * Pairs of recent thoughts that nearly linked, for the person to judge. Only the
 * newest few hundred are compared, so this stays quick on a large collection.
 */
export async function suggestLinks(db: Db, max = 3): Promise<Suggestion[]> {
  const docs = (await corpus(db)).slice(0, 300);
  const [links, no] = await Promise.all([repo.listLinks(db), repo.dismissedPairs(db)]);
  const skip = new Set([...no, ...links.map((l) => `${l.a_id}:${l.b_id}`)]);
  const out: Suggestion[] = [];
  for (const m of nearMisses(docs, skip, { max })) {
    const [a, b] = await Promise.all([repo.getThought(db, m.a), repo.getThought(db, m.b)]);
    if (a && b) out.push({ a, b });
  }
  return out;
}

/** The person's answer to a suggestion: link the two by hand, or never suggest or link them again. */
export async function answerSuggestion(db: Db, s: Suggestion, related: boolean): Promise<void> {
  if (related) await repo.upsertLink(db, s.a.id, s.b.id, 'manual', 1);
  else await repo.dismissPair(db, s.a.id, s.b.id);
  dataChanged();
}

/**
 * Moves just-saved thoughts into a note that already exists. Words and web
 * addresses are added to the end of that note and their own thought is removed.
 * A file stays a thought of its own (a note holds one file at most) and is linked to the note by hand.
 */
export async function mergeInto(db: Db, saved: Thought[], targetId: string): Promise<Thought | null> {
  for (const t of saved) {
    if (t.id === targetId) continue;
    if (t.media_path) {
      await repo.upsertLink(db, t.id, targetId, 'manual', 1);
      continue;
    }
    const words = [t.title, t.body, t.url && !`${t.title ?? ''} ${t.body}`.includes(t.url) ? t.url : null].filter(Boolean).join('\n');
    await appendToThought(db, targetId, words);
    await cancelReminder(t);
    await repo.deleteThought(db, t.id);
  }
  dataChanged();
  return repo.getThought(db, targetId);
}

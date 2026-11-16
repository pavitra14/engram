import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { copyAsync } from 'expo-file-system/legacy';
import type { Db } from '@/db/db';

import * as repo from '@/db/repo';
import type { NewThought, Thought, ThoughtKind } from '@/db/types';

import { dataChanged } from './bus';
import { splitQuick } from './capture.logic';
import { translateLater } from './translate';
import { type Doc, relateAll, related } from './linker';
import { embedText, MODEL_ID, modelReady } from './semantic';
import { firstUrl } from './text';

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
    text: `${t.title ?? ''} ${t.body} ${t.en_title ?? ''} ${t.en_body ?? ''}`,
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
    const vec = t ? await embedText(`${t.title ?? ''} ${t.body}`) : null;
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
  const hits = related(target, docs);
  const hitIds = new Set(hits.map((h) => h.id));
  const stale = (await repo.neighboursOf(db, id)).filter((n) => n.link_kind === 'auto' && !hitIds.has(n.id));
  for (const n of stale) await repo.removeLink(db, id, n.id);
  for (const h of hits) await repo.upsertLink(db, id, h.id, 'auto', h.score);
  return hits.length;
}

export async function rebuildAllLinks(db: Db): Promise<number> {
  const links = relateAll(await corpus(db));
  await repo.replaceAutoLinks(db, links);
  dataChanged();
  return links.length;
}

/** Save first, then link. Capture never waits on anything slower than one insert. */
export async function capture(db: Db, input: NewThought): Promise<Thought> {
  const thought = await repo.insertThought(db, input);
  try {
    await relink(db, thought.id);
  } finally {
    dataChanged(thought.id);
  }
  translateLater(db, thought.id);
  return thought;
}

export function captureText(db: Db, raw: string, source?: string | null): Promise<Thought> {
  const text = raw.trim();
  const url = firstUrl(text);
  // A bare web address stays a link with nothing else; its address is what is shown.
  if (url && text.replace(url, '').trim().length < 3) return capture(db, { kind: 'link', body: '', url, source: source ?? null });
  const { title, body } = splitQuick(text);
  return capture(db, { kind: url ? 'link' : 'text', title, body, url, source: source ?? null });
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
  await repo.updateThought(db, id, { title: note.title.trim() || null, body: note.text.trim(), body_html: note.html });
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

export async function removeThought(db: Db, thought: Thought): Promise<void> {
  await repo.deleteThought(db, thought.id);
  deleteMedia(thought.media_path);
  dataChanged();
}

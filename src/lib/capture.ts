import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import * as repo from '@/db/repo';
import type { NewThought, Thought } from '@/db/types';

import { dataChanged } from './bus';
import { type Doc, relateAll, related } from './linker';
import { firstUrl } from './text';

async function corpus(db: SQLiteDatabase): Promise<Doc[]> {
  const [thoughts, pairs] = await Promise.all([repo.listThoughts(db, { limit: 5000 }), repo.allTagPairs(db)]);
  const tags = new Map<string, string[]>();
  for (const p of pairs) tags.set(p.thought_id, [...(tags.get(p.thought_id) ?? []), p.name]);
  return thoughts.map((t) => ({
    id: t.id,
    text: `${t.title ?? ''} ${t.body}`,
    url: t.url,
    tags: tags.get(t.id),
  }));
}

/** Recomputes the auto links for one thought (after create, edit or retag). */
export async function relink(db: SQLiteDatabase, id: string): Promise<number> {
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

export async function rebuildAllLinks(db: SQLiteDatabase): Promise<number> {
  const links = relateAll(await corpus(db));
  await repo.replaceAutoLinks(db, links);
  dataChanged();
  return links.length;
}

/** Save first, then link. Capture never waits on anything slower than one insert. */
export async function capture(db: SQLiteDatabase, input: NewThought): Promise<Thought> {
  const thought = await repo.insertThought(db, input);
  try {
    await relink(db, thought.id);
  } finally {
    dataChanged(thought.id);
  }
  return thought;
}

export function captureText(db: SQLiteDatabase, raw: string, source?: string | null): Promise<Thought> {
  const body = raw.trim();
  const url = firstUrl(body);
  const isBareLink = !!url && body.replace(url, '').trim().length < 3;
  return capture(db, {
    kind: url ? 'link' : 'text',
    body: isBareLink ? '' : body,
    url,
    source: source ?? null,
  });
}

// ---------- media files ----------

function mediaDir(): Directory {
  const dir = new Directory(Paths.document, 'media');
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  return dir;
}

function extensionOf(uri: string, mimeType: string | undefined, fallback: string): string {
  const fromMime = mimeType?.split('/')[1]?.split(/[;+]/)[0];
  const known: Record<string, string> = { jpeg: 'jpg', 'x-wav': 'wav', mpeg: 'mp3', 'x-m4a': 'm4a', mp4: 'm4a' };
  if (fromMime && fromMime !== '*') return known[fromMime] ?? fromMime;
  const m = uri.match(/\.([a-z0-9]{2,5})(?:\?|$)/i);
  return m ? m[1].toLowerCase() : fallback;
}

/** Copies a file (file:// or content://) into the app's own storage and returns the new URI. */
export async function importMedia(uri: string, mimeType: string | undefined, fallbackExt: string): Promise<string> {
  const dest = new File(mediaDir(), `${randomUUID()}.${extensionOf(uri, mimeType, fallbackExt)}`);
  await new File(uri).copy(dest);
  return dest.uri;
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

export async function removeThought(db: SQLiteDatabase, thought: Thought): Promise<void> {
  await repo.deleteThought(db, thought.id);
  deleteMedia(thought.media_path);
  dataChanged();
}

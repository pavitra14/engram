/**
 * The parts of a backup that need no phone: what goes into backup.json and how
 * it is put back. Kept apart from backup.ts so scripts/check.ts can run a full
 * export-to-import round trip in Node.
 */
import type { Db } from '@/db/db';
import * as repo from '@/db/repo';
import type { Link, Thought } from '@/db/types';

export type Backup = {
  app: 'engram';
  version: 1;
  exported_at: number;
  thoughts: Thought[];
  links: Link[];
  tags: { thought_id: string; name: string }[];
};

/** Everything in the database a backup carries: notes (the trash included), links and tags. */
export async function makeBackup(db: Db, now: number = Date.now()): Promise<Backup> {
  const [live, trash, links, tags] = await Promise.all([repo.listThoughts(db, { limit: 100000 }), repo.listTrash(db), repo.listLinks(db), repo.allTagPairs(db)]);
  // The alarm id belongs to this phone and means nothing on another.
  const thoughts = [...live, ...trash].map((t) => ({ ...t, notif_id: null }));
  return { app: 'engram', version: 1, exported_at: now, thoughts, links, tags };
}

/** The file's own name, from the end of its path. */
export const mediaName = (path: string) => decodeURIComponent(path.split('/').pop() ?? 'file');

/**
 * Where a note's file sits in the zip. Keyed by the note's id as well as the
 * name, so two files with the same name cannot overwrite each other.
 * Backups from before 0.9 used the name alone; `mediaKeys` gives both to look for.
 */
export const mediaKey = (t: Pick<Thought, 'id' | 'media_path'>) => (t.media_path ? `media/${t.id}-${mediaName(t.media_path)}` : null);

export const mediaKeys = (t: Pick<Thought, 'id' | 'media_path'>): string[] => (t.media_path ? [mediaKey(t)!, `media/${mediaName(t.media_path)}`] : []);

/** Throws the plain error people see when a file is not a backup. */
export function parseBackup(raw: string): Backup {
  let data: Backup;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('That file is not an Engram backup.');
  }
  if (data?.app !== 'engram' || !Array.isArray(data.thoughts)) throw new Error('That file is not an Engram backup.');
  return data;
}

export type Restored = { added: number; skipped: number; files: number; ids: string[] };

/**
 * Merges a backup into this database. A note that is already here (same id)
 * is left as it is. Everything a note carried comes back with it: to-do,
 * reminder, repeat, star, pin, trash, "remember this", list and focus minutes.
 * `fileFor` puts a note's file into this phone's storage and returns its new
 * path, or null when the backup has no file for it.
 */
export async function restoreBackup(db: Db, data: Backup, fileFor: (t: Thought) => Promise<string | null>): Promise<Restored> {
  let added = 0;
  let skipped = 0;
  let files = 0;
  const ids: string[] = [];
  const present = new Set<string>();
  for (const t of data.thoughts) {
    if (!t?.id || !t.kind) continue;
    if (await repo.getThought(db, t.id)) {
      skipped += 1;
    } else {
      const media_path = t.media_path ? await fileFor(t) : null;
      if (media_path) files += 1;
      await repo.insertThought(db, { ...t, media_path });
      added += 1;
      ids.push(t.id);
    }
    present.add(t.id);
  }
  for (const l of data.links ?? []) {
    if (present.has(l.a_id) && present.has(l.b_id)) await repo.upsertLink(db, l.a_id, l.b_id, l.kind, l.weight);
  }
  for (const g of data.tags ?? []) {
    if (present.has(g.thought_id)) await repo.addTag(db, g.thought_id, g.name);
  }
  return { added, skipped, files, ids };
}

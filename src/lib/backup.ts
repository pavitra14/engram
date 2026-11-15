import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import * as repo from '@/db/repo';
import type { Link, Thought } from '@/db/types';

import { dataChanged } from './bus';

type Backup = {
  app: 'engram';
  version: 1;
  exported_at: number;
  thoughts: Thought[];
  links: Link[];
  tags: { thought_id: string; name: string }[];
};

/** Writes every thought, link and tag to a JSON file and opens the share sheet. */
export async function exportBackup(db: SQLiteDatabase): Promise<number> {
  const [thoughts, links, tags] = await Promise.all([
    repo.listThoughts(db, { limit: 100000 }),
    repo.listLinks(db),
    repo.allTagPairs(db),
  ]);
  const backup: Backup = { app: 'engram', version: 1, exported_at: Date.now(), thoughts, links, tags };
  const stamp = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `engram-backup-${stamp}.json`);
  if (file.exists) file.delete();
  file.create();
  await file.write(JSON.stringify(backup));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save Engram backup' });
  return thoughts.length;
}

/** Merges a backup file into this device. Existing thoughts (same id) are kept as they are. */
export async function importBackup(db: SQLiteDatabase): Promise<{ added: number; skipped: number } | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });
  if (picked.canceled || !picked.assets[0]) return null;
  const raw = await new File(picked.assets[0].uri).text();
  let data: Backup;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('That file is not an Engram backup.');
  }
  if (data?.app !== 'engram' || !Array.isArray(data.thoughts)) {
    throw new Error('That file is not an Engram backup.');
  }
  let added = 0;
  let skipped = 0;
  const present = new Set<string>();
  for (const t of data.thoughts) {
    if (!t?.id || !t.kind) continue;
    if (await repo.getThought(db, t.id)) {
      skipped += 1;
    } else {
      // Audio and images are not part of a backup, so drop the dangling path.
      await repo.insertThought(db, { ...t, media_path: null });
      added += 1;
    }
    present.add(t.id);
  }
  for (const l of data.links ?? []) {
    if (present.has(l.a_id) && present.has(l.b_id)) await repo.upsertLink(db, l.a_id, l.b_id, l.kind, l.weight);
  }
  for (const g of data.tags ?? []) {
    if (present.has(g.thought_id)) await repo.addTag(db, g.thought_id, g.name);
  }
  dataChanged();
  return { added, skipped };
}

import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { Db } from '@/db/db';

import * as repo from '@/db/repo';
import type { Link, Thought } from '@/db/types';

import { dataChanged } from './bus';
import { fileNames, type ImportedNote, noteToMarkdown, parseKeep, parseTextFile } from './markdown';
import { titleOf } from './text';

type Backup = {
  app: 'engram';
  version: 1;
  exported_at: number;
  thoughts: Thought[];
  links: Link[];
  tags: { thought_id: string; name: string }[];
};

/** Writes every thought, link and tag to a JSON file and opens the share sheet. */
export async function exportBackup(db: Db): Promise<number> {
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
export async function importBackup(db: Db): Promise<{ added: number; skipped: number } | null> {
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

// ---------- Markdown out ----------

/**
 * Writes every note as its own Markdown file, zipped, and opens the share sheet.
 * Links become [[Title]], which Obsidian and similar apps follow. Files and
 * recordings are not included, only the words.
 */
export async function exportMarkdown(db: Db): Promise<number> {
  const [thoughts, links, tags] = await Promise.all([repo.listThoughts(db, { limit: 100000 }), repo.listLinks(db), repo.allTagPairs(db)]);
  const names = fileNames(thoughts.map((t) => titleOf(t)));
  const nameOf = new Map(thoughts.map((t, i) => [t.id, names[i]]));
  const linked = new Map<string, string[]>();
  for (const l of links) {
    const a = nameOf.get(l.a_id);
    const b = nameOf.get(l.b_id);
    if (!a || !b) continue;
    linked.set(l.a_id, [...(linked.get(l.a_id) ?? []), b]);
    linked.set(l.b_id, [...(linked.get(l.b_id) ?? []), a]);
  }
  const tagged = new Map<string, string[]>();
  for (const g of tags) tagged.set(g.thought_id, [...(tagged.get(g.thought_id) ?? []), g.name]);
  const files: Record<string, Uint8Array> = {};
  thoughts.forEach((t, i) => {
    files[`${names[i]}.md`] = strToU8(
      noteToMarkdown({
        // The file is named for the title, so links to it resolve; the heading says the same.
        title: names[i],
        body: t.body,
        body_html: t.body_html,
        url: t.url,
        created_at: t.created_at,
        tags: tagged.get(t.id) ?? [],
        links: [...new Set(linked.get(t.id) ?? [])],
      }),
    );
  });
  const stamp = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `engram-notes-${stamp}.zip`);
  if (file.exists) file.delete();
  file.create();
  file.write(zipSync(files, { level: 6 }));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/zip', dialogTitle: 'Save your notes as Markdown' });
  return thoughts.length;
}

// ---------- notes in from other apps ----------

async function addImported(db: Db, n: ImportedNote): Promise<void> {
  const t = await repo.insertThought(db, { kind: 'text', title: n.title, body: n.body, body_html: n.html, source: 'import', created_at: n.created_at });
  for (const tag of n.tags.slice(0, 12)) await repo.addTag(db, t.id, tag);
}

/**
 * Brings in notes from other apps: Markdown or plain-text files (an Obsidian
 * folder, for example), Google Keep's .json files from Takeout, or a .zip of any
 * of those. Returns how many notes were added, or null if nothing was picked.
 */
export async function importNotes(db: Db, relinkAll: (db: Db) => Promise<unknown>): Promise<{ added: number; skipped: number } | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: true });
  if (picked.canceled || picked.assets.length === 0) return null;
  let added = 0;
  let skipped = 0;
  const take = async (name: string, content: string) => {
    const note = /\.json$/i.test(name) ? parseKeep(content) : /\.(md|markdown|txt)$/i.test(name) ? parseTextFile(name, content) : null;
    if (note) {
      await addImported(db, note);
      added += 1;
    } else {
      skipped += 1;
    }
  };
  for (const a of picked.assets) {
    const file = new File(a.uri);
    if (/\.zip$/i.test(a.name)) {
      const entries = unzipSync(await file.bytes(), { filter: (f) => /\.(md|markdown|txt|json)$/i.test(f.name) && f.originalSize < 2_000_000 });
      for (const [name, bytes] of Object.entries(entries)) {
        // Folders that apps keep for themselves are not notes.
        if (/(^|\/)(\.obsidian|\.trash|__MACOSX)\//.test(name)) continue;
        await take(name, strFromU8(bytes));
      }
    } else {
      await take(a.name, await file.text());
    }
  }
  if (added > 0) {
    await relinkAll(db);
    dataChanged();
  }
  return { added, skipped };
}

// ---------- a backup every week, by itself ----------

const WEEK = 7 * 86_400_000;

export async function autoBackupFolder(db: Db): Promise<string | null> {
  return (await repo.getMeta(db, 'backup_folder')) || null;
}

/** Asks the person to choose a folder, then writes the first backup there. Returns false if they backed out. */
export async function chooseBackupFolder(db: Db): Promise<boolean> {
  const p = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!p.granted) return false;
  await repo.setMeta(db, 'backup_folder', p.directoryUri);
  await writeBackupTo(db, p.directoryUri);
  return true;
}

export async function stopAutoBackup(db: Db): Promise<void> {
  await repo.setMeta(db, 'backup_folder', '');
}

async function writeBackupTo(db: Db, folder: string): Promise<void> {
  const [thoughts, links, tags] = await Promise.all([repo.listThoughts(db, { limit: 100000 }), repo.listLinks(db), repo.allTagPairs(db)]);
  const backup: Backup = { app: 'engram', version: 1, exported_at: Date.now(), thoughts, links, tags };
  const stamp = new Date().toISOString().slice(0, 10);
  const uri = await StorageAccessFramework.createFileAsync(folder, `engram-backup-${stamp}`, 'application/json');
  await StorageAccessFramework.writeAsStringAsync(uri, JSON.stringify(backup));
  await repo.setMeta(db, 'backup_last', String(Date.now()));
}

/** When a folder has been chosen and the last backup is a week old, writes a new one. Run when the app opens. */
export async function backupIfDue(db: Db): Promise<void> {
  try {
    const folder = await autoBackupFolder(db);
    if (!folder) return;
    const last = Number(await repo.getMeta(db, 'backup_last')) || 0;
    if (Date.now() - last < WEEK || (await repo.countThoughts(db)) === 0) return;
    await writeBackupTo(db, folder);
  } catch (e) {
    // The folder may have been removed or its permission taken back. Settings shows the date of the last one that worked.
    console.log('engram: weekly backup not written', e instanceof Error ? e.message : String(e));
  }
}

import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { Db } from '@/db/db';

import * as repo from '@/db/repo';
import type { Thought } from '@/db/types';

import { type Backup, makeBackup, mediaKey, mediaKeys, mediaName, parseBackup, restoreBackup } from './backup.logic';
import { dataChanged } from './bus';
import { fileNames, type ImportedNote, noteToMarkdown, parseKeep, parseTextFile } from './markdown';
import { reconcileReminders } from './reminders';
import { titleOf } from './text';

/** Words, links and tags only, as one JSON file. Kept for the crash screen, where the smallest thing that can work is wanted. */
export async function exportBackup(db: Db): Promise<number> {
  const backup = await makeBackup(db);
  const stamp = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `engram-backup-${stamp}.json`);
  if (file.exists) file.delete();
  file.create();
  await file.write(JSON.stringify(backup));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save Engram backup' });
  return backup.thoughts.length;
}

/** Photos and recordings above this size in total are left out of a backup: the zip is built in memory. */
const MEDIA_LIMIT = 400 * 1024 * 1024;

/**
 * Writes everything to one .zip and opens the share sheet: backup.json with the
 * words, links and tags, and a media folder with the photos, recordings and files.
 * Returns how many thoughts went in and how many files had to be left out.
 */
export async function exportFullBackup(db: Db): Promise<{ thoughts: number; files: number; leftOut: number }> {
  const backup = await makeBackup(db);
  const thoughts = backup.thoughts;
  // Media is stored as it is (level 0): pictures and recordings are compressed already.
  const entries: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = { 'backup.json': strToU8(JSON.stringify(backup)) };
  let files = 0;
  let leftOut = 0;
  let size = 0;
  for (const t of thoughts) {
    if (!t.media_path) continue;
    try {
      const f = new File(t.media_path);
      if (!f.exists || size + (f.size ?? 0) > MEDIA_LIMIT) {
        leftOut += 1;
        continue;
      }
      const bytes = await f.bytes();
      size += bytes.length;
      entries[mediaKey(t)!] = [bytes, { level: 0 }];
      files += 1;
    } catch {
      leftOut += 1;
    }
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const out = new File(Paths.cache, `engram-backup-${stamp}.zip`);
  if (out.exists) out.delete();
  out.create();
  out.write(zipSync(entries, { level: 6 }));
  await Sharing.shareAsync(out.uri, { mimeType: 'application/zip', dialogTitle: 'Save Engram backup' });
  return { thoughts: thoughts.length, files, leftOut };
}

/** A backup file larger than this is refused before it is read: the phone would run out of memory. */
const IMPORT_FILE_LIMIT = 600 * 1024 * 1024;
/** And so is a zip whose contents would come to more than this once unpacked. */
const IMPORT_UNPACKED_LIMIT = 600 * 1024 * 1024;
const BIG = 'That backup is too big to restore on this phone (over 600 MB).';

const yieldToScreen = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Merges a backup into this device: a .zip made by "Export a backup" (with its
 * files) or an older .json one (words only). Existing thoughts (same id) are
 * kept as they are. To-dos, reminders and stars come back, and reminders still
 * ahead get a phone alarm again.
 */
export async function importBackup(db: Db): Promise<{ added: number; skipped: number; files: number } | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (picked.canceled || !picked.assets[0]) return null;
  const file = new File(picked.assets[0].uri);
  if ((file.size ?? picked.assets[0].size ?? 0) > IMPORT_FILE_LIMIT) throw new Error(BIG);
  // Read once; a zip is then unpacked one entry at a time, so only one file is in memory beside it.
  const bytes = await file.bytes();
  let raw: string;
  const inZip = new Set<string>();
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isZip) {
    let unpacked = 0;
    const found = unzipSync(bytes, {
      filter: (f) => {
        unpacked += f.originalSize;
        inZip.add(f.name);
        return f.name === 'backup.json';
      },
    });
    if (unpacked > IMPORT_UNPACKED_LIMIT) throw new Error(BIG);
    if (!found['backup.json']) throw new Error('That zip is not an Engram backup. For notes from other apps, use "Bring in notes".');
    raw = strFromU8(found['backup.json']);
  } else {
    raw = strFromU8(bytes);
  }
  const data = parseBackup(raw);
  const dir = new Directory(Paths.document, 'media');
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  const fileFor = async (t: Thought): Promise<string | null> => {
    if (!isZip || !t.media_path) return null;
    const key = mediaKeys(t).find((k) => inZip.has(k));
    if (!key) return null;
    const entry = unzipSync(bytes, { filter: (f) => f.name === key })[key];
    if (!entry) return null;
    // Never write over a file another note already uses.
    const name = mediaName(t.media_path);
    let dest = new File(dir, name);
    if (dest.exists) dest = new File(dir, `${t.id}-${name}`);
    if (!dest.exists) dest.create();
    dest.write(entry);
    await yieldToScreen();
    return dest.uri;
  };
  const done = await restoreBackup(db, data, fileFor);
  // Reminders still ahead get an alarm on this phone.
  await reconcileReminders(db, done.ids);
  dataChanged();
  return { added: done.added, skipped: done.skipped, files: done.files };
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
  const backup: Backup = await makeBackup(db);
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

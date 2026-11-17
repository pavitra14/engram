/**
 * Reads the words in a picture, on the phone, so a photo of a receipt or a
 * whiteboard can be found by what is written on it.
 *
 * Done with Google's ML Kit text recogniser (through expo-text-extractor). The
 * picture is not sent anywhere. The recogniser itself is delivered by Google
 * Play services, which may download it the first time it is used; that download
 * carries nothing of the person's. Latin-script text only.
 *
 * The words are derived data, like translations: kept in their own table, never
 * synced, and made again from the picture when needed.
 */
import type { Db } from '@/db/db';
import * as repo from '@/db/repo';

type Module = { isSupported: boolean; extractTextFromImage: (uri: string) => Promise<string[]> };

/** Loaded lazily, so a fault in the native library cannot stop the app from starting. */
function recogniser(): Module | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-text-extractor') as Module;
    return mod?.isSupported ? mod : null;
  } catch {
    return null;
  }
}

/** The words in a picture, one block per line. Empty when there are none or the recogniser is not available. */
export async function wordsInPicture(uri: string): Promise<string> {
  const mod = recogniser();
  if (!mod) return '';
  // The library takes a plain file path, not a file:// address.
  const path = uri.startsWith('file://') ? decodeURIComponent(uri.slice(7)) : uri;
  const blocks = await mod.extractTextFromImage(path);
  return (Array.isArray(blocks) ? blocks : [])
    .map((b) => String(b).trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 8000);
}

/** Reads one saved picture and stores its words. Returns true if it found any. */
export async function readPicture(db: Db, id: string, uri: string): Promise<boolean> {
  const text = await wordsInPicture(uri);
  // An empty result is stored too, so the same picture is not read again on every launch.
  await repo.saveImageText(db, id, text);
  return text.length > 0;
}

/** After a picture is saved: read it in the background, then let the caller link it by what it says. */
export function readPictureLater(db: Db, id: string, uri: string, then: (id: string) => unknown): void {
  void (async () => {
    try {
      if (await readPicture(db, id, uri)) await then(id);
    } catch (e) {
      console.log('engram: picture not read', e instanceof Error ? e.message : String(e));
    }
  })();
}

/** Reads pictures saved before this version, a few at a time. Run when the app opens. */
export async function readOldPictures(db: Db, then: (id: string) => unknown): Promise<void> {
  if (!recogniser()) return;
  for (const p of await repo.imagesNotRead(db, 40)) {
    try {
      if (await readPicture(db, p.id, p.media_path)) await then(p.id);
    } catch {
      // Stop at the first failure; the recogniser is probably still being delivered.
      return;
    }
  }
}

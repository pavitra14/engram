/**
 * Reads the words in a picture, on the phone, so a photo of a receipt or a
 * whiteboard can be found by what is written on it.
 *
 * Done by Engram's own small native module (modules/engram-ocr), which carries
 * Google's ML Kit recognisers for Latin and Devanagari script inside the app.
 * Nothing is downloaded and the picture is not sent anywhere.
 *
 * The words are derived data, like translations: kept in their own table, never
 * synced, and made again from the picture when needed.
 */
import { requireOptionalNativeModule } from 'expo';

import type { Db } from '@/db/db';
import * as repo from '@/db/repo';

import { joinParagraphs, type OcrLine, paragraphsFromBlocks, paragraphsFromLines } from './ocr.logic';

/**
 * `readLines` gives every line with its place in the picture and reads a tall picture
 * in strips, so none of it is skipped. `read` is the older call, one string per block.
 */
type Module = { readLines?: (uri: string) => Promise<OcrLine[]>; read: (uri: string) => Promise<string[]> };

/** Null when the native module is missing (an old build, or a platform without it), so nothing here can stop the app. */
function recogniser(): Module | null {
  try {
    return requireOptionalNativeModule<Module>('EngramOcr');
  } catch {
    return null;
  }
}

/** Whether this build can read pictures at all. */
export const canReadPictures = (): boolean => recogniser() !== null;

/** The words in a picture, a paragraph at a time with a blank line between. Empty when there are none or the recogniser is not available. */
export async function wordsInPicture(uri: string): Promise<string> {
  const mod = recogniser();
  if (!mod) return '';
  if (typeof mod.readLines === 'function') {
    const lines = await mod.readLines(uri);
    return joinParagraphs(paragraphsFromLines(Array.isArray(lines) ? lines : []));
  }
  const blocks = await mod.read(uri);
  return joinParagraphs(paragraphsFromBlocks(Array.isArray(blocks) ? blocks : []));
}

/** Reads one saved picture and stores its words. Returns true if it found any. */
export async function readPicture(db: Db, id: string, uri: string): Promise<boolean> {
  const text = await wordsInPicture(uri);
  // An empty result is stored too, so the same picture is not read again on every launch.
  await repo.saveImageText(db, id, text);
  console.log(`engram: picture read, ${text.length} characters`);
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
      // Stop at the first failure rather than fail the same way on every picture.
      return;
    }
  }
}

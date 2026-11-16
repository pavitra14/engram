/**
 * Optional: an English version of notes written in other languages.
 *
 * Done on the phone with Google's ML Kit (through expo-translate-text), which
 * works out the language and translates without sending the words anywhere. The
 * first note in a new language makes ML Kit download that language's pack (about
 * 30 MB) from Google; that download is the only network use.
 *
 * The original is never changed. The English version is kept beside it, shown
 * under it, and made searchable.
 */
import type { Db } from '@/db/db';
import * as repo from '@/db/repo';

import { dataChanged } from './bus';

type Result = { translatedTexts: unknown; sourceLanguage: string | null };
type Module = { onTranslateTask: (p: { input: string[]; targetLangCode: string }) => Promise<Result> };

export async function translationOn(db: Db): Promise<boolean> {
  return (await repo.getMeta(db, 'translate')) === 'on';
}

/**
 * Makes or refreshes one note's English version. Returns true if it now has one.
 * Loaded lazily, so a fault in the native library cannot stop the app from starting.
 */
export async function translateThought(db: Db, id: string): Promise<boolean> {
  const t = await repo.getThought(db, id);
  if (!t) return false;
  const title = t.title?.trim() ?? '';
  const body = t.body.trim().slice(0, 4000);
  if (!title && !body) return false;
  const input = [title, body].filter(Boolean);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('expo-translate-text') as Module;
  const res = await mod.onTranslateTask({ input, targetLangCode: 'en' });
  const out = Array.isArray(res.translatedTexts) ? (res.translatedTexts as string[]) : [];
  const lang = res.sourceLanguage;
  const same = out.length !== input.length || out.every((s, i) => s.trim().toLowerCase() === input[i].trim().toLowerCase());
  if (!lang || lang === 'en' || lang === 'und' || same) {
    await repo.saveTranslation(db, id, 'en', null, null);
    return false;
  }
  await repo.saveTranslation(db, id, lang, title ? out[0] : null, body ? out[title ? 1 : 0] : null);
  return true;
}

/** After a note is saved or edited: translate it in the background if the person has asked for that. */
export function translateLater(db: Db, id: string): void {
  void (async () => {
    try {
      if ((await translationOn(db)) && (await translateThought(db, id))) dataChanged();
    } catch (e) {
      console.log('engram: translation skipped', e instanceof Error ? e.message : String(e));
    }
  })();
}

/** Turning it on: give every note that has not been looked at an English version. Returns how many were translated. */
export async function translateAll(db: Db, onProgress?: (done: number, total: number) => void): Promise<number> {
  const ids = await repo.idsWithoutTranslation(db);
  let made = 0;
  for (let i = 0; i < ids.length; i++) {
    if (!(await translationOn(db))) break;
    try {
      if (await translateThought(db, ids[i])) made += 1;
    } catch (e) {
      // Usually the language pack could not be downloaded. Stop; the next save or a later try picks up again.
      console.log('engram: translation stopped', e instanceof Error ? e.message : String(e));
      throw e;
    }
    onProgress?.(i + 1, ids.length);
  }
  if (made > 0) dataChanged();
  return made;
}

const NAMES: Record<string, string> = {
  hi: 'Hindi', bn: 'Bengali', mr: 'Marathi', ta: 'Tamil', te: 'Telugu', gu: 'Gujarati', kn: 'Kannada', ur: 'Urdu',
  es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', it: 'Italian', nl: 'Dutch', ru: 'Russian', ar: 'Arabic',
  zh: 'Chinese', ja: 'Japanese', ko: 'Korean', tr: 'Turkish', id: 'Indonesian', vi: 'Vietnamese', th: 'Thai', fa: 'Persian',
  pl: 'Polish', uk: 'Ukrainian', sv: 'Swedish', he: 'Hebrew', el: 'Greek', multiple: 'more than one language',
};
export const languageName = (code: string): string => NAMES[code] ?? code;

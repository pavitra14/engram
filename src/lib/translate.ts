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
import { looksEnglish } from './text';

type Result = { translatedTexts: unknown; sourceLanguage: string | null };
type Args = { input: string[]; sourceLangCode: string; targetLangCode: string; preferredStrategy: string; requiresWifi: boolean; requireCharging: boolean };
type Module = { onTranslateTask: (p: Args) => Promise<Result> };

/**
 * What the translator is asked, with every key given a real value. The library
 * passes each key to Android even when it is missing, and its Kotlin side takes a
 * map of non-null values, so one undefined key failed every translation with
 * "Cannot convert '[object Object]' to a Kotlin type". 'auto' means "work out the language".
 */
export function translateArgs(input: string[]): Args {
  return { input, sourceLangCode: 'auto', targetLangCode: 'en', preferredStrategy: 'lowLatency', requiresWifi: false, requireCharging: false };
}

export async function translationOn(db: Db): Promise<boolean> {
  return (await repo.getMeta(db, 'translate')) === 'on';
}

/** Why a note could not be translated. `pack` means a language pack is not on the phone yet. */
export type TranslateProblem = { kind: 'pack' | 'other'; message: string };

/** Sorts the translator's error into "language pack missing" and everything else, keeping its own words. */
export function problemOf(e: unknown): TranslateProblem {
  const message = e instanceof Error ? e.message : String(e);
  const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '';
  return { kind: code === 'MODEL_DOWNLOAD_FAILED' || /download|model/i.test(message) ? 'pack' : 'other', message };
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
  // Notes that are plainly English never reach the translator. Asking it to turn English
  // into English still makes it fetch a language pack, and a failure there used to stop everything.
  if ((!title && !body) || looksEnglish(`${title}\n${body}`)) {
    await repo.saveTranslation(db, id, 'en', null, null);
    return false;
  }
  const input = [title, body].filter(Boolean);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('expo-translate-text') as Module;
  const res = await mod.onTranslateTask(translateArgs(input));
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

export type TranslateRun = { made: number; checked: number; failed: number; problem: TranslateProblem | null };

/**
 * Turning it on, or trying again: give every note that has not been looked at an
 * English version. One note failing does not stop the rest; it is left unmarked so
 * the next run tries it again. Stops early only when the same failure keeps coming,
 * since then the cause is the phone and not the note.
 */
export async function translateAll(db: Db, onProgress?: (done: number, total: number) => void): Promise<TranslateRun> {
  const ids = await repo.idsWithoutTranslation(db);
  const run: TranslateRun = { made: 0, checked: 0, failed: 0, problem: null };
  let inARow = 0;
  for (let i = 0; i < ids.length; i++) {
    if (!(await translationOn(db))) break;
    try {
      if (await translateThought(db, ids[i])) run.made += 1;
      run.checked += 1;
      inARow = 0;
    } catch (e) {
      run.failed += 1;
      inARow += 1;
      run.problem = run.problem ?? problemOf(e);
      console.log('engram: translation failed for one note', e instanceof Error ? e.message : String(e));
      if (inARow >= 3) {
        run.failed += ids.length - i - 1;
        break;
      }
    }
    onProgress?.(i + 1, ids.length);
  }
  if (run.made > 0) dataChanged();
  return run;
}

/**
 * What to tell the person after a run, in one or two sentences. The phone's own
 * error text is left out (it goes to the log): it is written for developers.
 */
export function runSummary(r: TranslateRun): string {
  const failed = r.failed > 0 && r.problem;
  const made =
    r.made > 0
      ? `${r.made} ${r.made === 1 ? 'note has' : 'notes have'} an English version now`
      : failed
        ? 'Nothing was translated'
        : 'None of your notes needed translating';
  if (!failed) return `On. ${made}.`;
  const n = `${r.failed} ${r.failed === 1 ? 'note' : 'notes'}`;
  const why =
    r.problem!.kind === 'pack'
      ? `${n} could not be translated because the phone did not finish downloading a language pack from Google. This needs Google Play services and a connection; tap Try again in a minute.`
      : `${n} could not be translated. Tap Try again; if it keeps happening, the translator on this phone may need an update to Google Play services.`;
  return `On. ${made}. ${why}`;
}

const NAMES: Record<string, string> = {
  hi: 'Hindi', bn: 'Bengali', mr: 'Marathi', ta: 'Tamil', te: 'Telugu', gu: 'Gujarati', kn: 'Kannada', ur: 'Urdu',
  es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', it: 'Italian', nl: 'Dutch', ru: 'Russian', ar: 'Arabic',
  zh: 'Chinese', ja: 'Japanese', ko: 'Korean', tr: 'Turkish', id: 'Indonesian', vi: 'Vietnamese', th: 'Thai', fa: 'Persian',
  pl: 'Polish', uk: 'Ukrainian', sv: 'Swedish', he: 'Hebrew', el: 'Greek', multiple: 'more than one language',
};
export const languageName = (code: string): string => NAMES[code] ?? code;

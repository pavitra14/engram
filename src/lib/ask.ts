/**
 * Ask your notes: a question answered from the person's own notes by a small
 * language model that runs on the phone.
 *
 * The model (Liquid LFM 2.5, 1.2B) is downloaded once, only after the person
 * asks for it in Settings; the download carries nothing of theirs. Questions,
 * notes and answers never leave the phone. Search finds the notes first; the
 * model only ever sees those few, and the answer shows which ones it used.
 *
 * Behind the `ask` flag until it has been tried on real phones.
 */
import { File } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import type { Db } from '@/db/db';
import * as repo from '@/db/repo';
import type { Thought } from '@/db/types';

import { ASK_SYSTEM, askPrompt, cleanAnswer, questionTerms, type Source } from './ask.logic';
import { embedText, MODEL_ID, modelReady } from './semantic';
import { titleOf, when } from './text';

export const ASK_SIZE_NOTE = 'about 1 GB';

export type AskState = { status: 'off' | 'downloading' | 'ready' | 'error'; progress: number; message?: string };
type Local = { modelPath: string; tokenizerPath: string; tokenizerConfigPath: string };

let state: AskState = { status: 'off', progress: 0 };
let local: Local | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const set = (patch: Partial<AskState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export function useAskState(): AskState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => state,
    () => state,
  );
}

// Loaded lazily, so a fault in the native library cannot stop the app from starting.
function library() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rne = require('react-native-executorch') as typeof import('react-native-executorch');
  // The library reports model downloads to its maker by default. Engram does not.
  rne.setTelemetryEnabled(false);
  return rne;
}

/** Downloads the model if it is not on the phone yet. Safe to call again; it resumes or returns at once. */
export function prepareAsk(db: Db): Promise<void> {
  if (local) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    try {
      const rne = library();
      set({ status: 'downloading', progress: 0, message: undefined });
      // The processor build, by name, for the same reason as the meaning model: it behaves the same on every phone.
      const got = (await rne.download(rne.models.llm.LFM2_5_1_2B.XNNPACK_8DA4W, { onProgress: (p) => set({ progress: p }) })) as Local;
      local = { modelPath: got.modelPath, tokenizerPath: got.tokenizerPath, tokenizerConfigPath: got.tokenizerConfigPath };
      await repo.setMeta(db, 'ask_model', JSON.stringify(local));
      set({ status: 'ready', progress: 1 });
      console.log('engram: ask ready');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.log('engram: ask error', message);
      set({ status: 'error', message });
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/** On opening the app: if the model was downloaded before, it is ready without asking again. */
export async function restoreAsk(db: Db): Promise<void> {
  if (local) return;
  try {
    const saved = JSON.parse((await repo.getMeta(db, 'ask_model')) ?? 'null') as Local | null;
    if (saved?.modelPath && new File(saved.modelPath.startsWith('file://') ? saved.modelPath : `file://${saved.modelPath}`).exists) {
      local = saved;
      set({ status: 'ready', progress: 1 });
    }
  } catch {
    // Not downloaded, or the record is unreadable: it stays off.
  }
}

/** Removes the downloaded model from the phone. */
export async function removeAsk(db: Db): Promise<void> {
  for (const p of local ? [local.modelPath, local.tokenizerPath, local.tokenizerConfigPath] : []) {
    try {
      const f = new File(p.startsWith('file://') ? p : `file://${p}`);
      if (f.exists) f.delete();
    } catch {
      // Already gone.
    }
  }
  local = null;
  await repo.setMeta(db, 'ask_model', 'null');
  set({ status: 'off', progress: 0, message: undefined });
}

const cosine = (a: Float32Array, b: Float32Array) => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

/** The few notes most likely to hold the answer: by the question's words, and by meaning when that is switched on. */
export async function notesFor(db: Db, question: string, max = 5): Promise<Thought[]> {
  const score = new Map<string, number>();
  const found = new Map<string, Thought>();
  const terms = questionTerms(question);
  for (const term of terms) {
    const hits = await repo.searchThoughts(db, term, { limit: 12 });
    hits.forEach((t, i) => {
      found.set(t.id, t);
      // Earlier results count for more; a note matching several words adds up.
      score.set(t.id, (score.get(t.id) ?? 0) + 1 + (12 - i) / 24);
    });
  }
  if (modelReady()) {
    const q = await embedText(question).catch(() => null);
    if (q) {
      const vectors = await repo.loadEmbeddings(db, MODEL_ID);
      const near = [...vectors].map(([id, v]) => ({ id, cos: cosine(q, v) })).sort((a, b) => b.cos - a.cos).slice(0, 8);
      for (const n of near) {
        if (n.cos < 0.2) continue;
        score.set(n.id, (score.get(n.id) ?? 0) + n.cos * 3);
        if (!found.has(n.id)) {
          const t = await repo.getThought(db, n.id);
          if (t && !t.trashed_at) found.set(t.id, t);
        }
      }
    }
  }
  return [...score]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => found.get(id))
    .filter((t): t is Thought => !!t)
    .slice(0, max);
}

const asSource = (t: Thought): Source => ({
  id: t.id,
  title: (t.en_title || titleOf(t)).slice(0, 120),
  // The English version is used when there is one: the model reads English best.
  text: [t.en_body || t.body, t.seen_text].filter(Boolean).join('\n').replace(/\s+/g, ' ').slice(0, 600),
  when: when(t.created_at),
});

export type Answer = { text: string; sources: Thought[] };

/**
 * Answers a question from the notes. `onText` is called as the answer grows.
 * With no matching notes the model is not run at all.
 */
export async function ask(db: Db, question: string, onText: (soFar: string) => void): Promise<Answer> {
  if (!local) throw new Error('The model is not on this phone yet.');
  const sources = await notesFor(db, question);
  if (sources.length === 0) return { text: 'No notes match that question.', sources: [] };
  const rne = library();
  const session = await rne.createLLMChatSession(local, {
    initialMessages: [{ role: 'system', content: ASK_SYSTEM }],
    generationConfig: { maxNewTokens: 320, enableThinking: false },
  });
  try {
    let raw = '';
    await session.sendMessage(askPrompt(question, sources.map(asSource)), (token) => {
      raw += token;
      onText(cleanAnswer(raw));
    });
    return { text: cleanAnswer(raw) || 'The model gave no answer. Try wording the question differently.', sources };
  } finally {
    session.dispose();
  }
}

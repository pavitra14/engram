/**
 * The on-device language model that lets thoughts link by meaning.
 *
 * It turns a thought into a list of numbers (a vector); thoughts that mean
 * similar things get similar vectors, even with no words in common. The model
 * is multilingual (50+ languages, Hindi included), runs entirely on the phone,
 * and is downloaded once, only after the person switches it on in Settings.
 * Nothing the person writes is ever sent anywhere.
 */
import { useSyncExternalStore } from 'react';

/** Stored with every vector, so vectors from an older model are never compared with a newer one. */
export const MODEL_ID = 'distiluse-base-multilingual-cased-v2';
export const MODEL_SIZE_NOTE = 'about 130 MB';

export type SemanticState = {
  status: 'off' | 'downloading' | 'indexing' | 'ready' | 'error';
  /** 0 to 1 while downloading. */
  progress: number;
  done: number;
  total: number;
  message?: string;
};

type Embedder = { embed: (input: string) => Promise<Float32Array>; dispose: () => void };

let state: SemanticState = { status: 'off', progress: 0, done: 0, total: 0 };
let embedder: Embedder | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function setSemanticState(patch: Partial<SemanticState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function getSemanticState(): SemanticState {
  return state;
}

export function useSemanticState(): SemanticState {
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

/** Downloads the model if needed (reporting progress) and loads it into memory. */
export function loadModel(): Promise<void> {
  if (embedder) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    try {
      // Loaded lazily so a problem in the native library can never stop the app from starting.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const rne = require('react-native-executorch') as typeof import('react-native-executorch');
      // The library reports model downloads to its maker by default. Engram does not.
      rne.setTelemetryEnabled(false);
      const model = rne.models.textEmbeddings.DISTILUSE_BASE_MULTILINGUAL_CASED_V2.DEFAULT;
      setSemanticState({ status: 'downloading', progress: 0, message: undefined });
      const local = await rne.download(model, { onProgress: (p) => setSemanticState({ progress: p }) });
      embedder = await rne.createTextEmbedder(local);
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export function unloadModel(): void {
  try {
    embedder?.dispose();
  } catch {
    // Nothing useful to do if the native side has already let go.
  }
  embedder = null;
}

export function modelReady(): boolean {
  return embedder !== null;
}

/** A unit-length meaning vector for some text, or null if the model is not loaded or the text is empty. */
export async function embedText(text: string): Promise<Float32Array | null> {
  const input = text.replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!embedder || !input) return null;
  const raw = await embedder.embed(input);
  let sum = 0;
  for (let i = 0; i < raw.length; i++) sum += raw[i] * raw[i];
  const norm = Math.sqrt(sum);
  if (!norm) return null;
  const out = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw[i] / norm;
  return out;
}

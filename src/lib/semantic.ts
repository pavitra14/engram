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
      // The processor build, chosen by name. The library's DEFAULT on Android is the
      // graphics-chip (Vulkan) build, which returned the same vector for every sentence
      // on the test emulator and depends on each phone's graphics driver.
      const model = rne.models.textEmbeddings.DISTILUSE_BASE_MULTILINGUAL_CASED_V2.XNNPACK_8DA4W;
      setSemanticState({ status: 'downloading', progress: 0, message: undefined });
      const local = await rne.download(model, { onProgress: (p) => setSemanticState({ progress: p }) });
      const made: Embedder = await rne.createTextEmbedder(local);
      // A model that loads but gives every text the same vector would link everything
      // to everything. Check it can tell a paraphrase from an unrelated sentence first.
      const check = await checkEmbedder(made);
      console.log(`engram: model check ${JSON.stringify(check)}`);
      if (!check.ok) {
        try {
          made.dispose();
        } catch {
          // Already gone.
        }
        throw new Error('The language model did not give usable results on this phone, so thoughts still link by words.');
      }
      embedder = made;
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

function unit(raw: Float32Array): Float32Array | null {
  let sum = 0;
  for (let i = 0; i < raw.length; i++) sum += raw[i] * raw[i];
  const norm = Math.sqrt(sum);
  if (!norm || !Number.isFinite(norm)) return null;
  const out = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw[i] / norm;
  return out;
}

function dot(a: Float32Array | null, b: Float32Array | null): number {
  if (!a || !b || a.length !== b.length) return 0;
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d;
}

export type ModelCheck = { ok: boolean; dim: number; pair: number; other: number; repeat: number; head: string[] };

/**
 * Embeds two sentences that mean the same and one that does not. A working model
 * scores the pair clearly above the stranger. The sentences are fixed; nothing of
 * the person's is involved.
 */
export async function checkEmbedder(e: Embedder): Promise<ModelCheck> {
  const texts = [
    'The car is due for an oil change and new brake pads',
    'Book the vehicle in at the garage for maintenance',
    'Sourdough bread needs a long, slow rise in a warm kitchen',
  ];
  const raws: Float32Array[] = [];
  for (const t of texts) raws.push(await e.embed(t));
  const again = await e.embed(texts[0]);
  const [a, b, c] = raws.map(unit);
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const pair = round(dot(a, b));
  const other = round(Math.max(dot(a, c), dot(b, c)));
  const repeat = round(dot(a, unit(again)));
  const head = [...raws, again].map((r) => Array.from(r.slice(0, 4), (x) => x.toFixed(3)).join(' '));
  const ok = !!a && !!b && !!c && repeat > 0.99 && other < 0.9 && pair > other + 0.05;
  return { ok, dim: raws[0]?.length ?? 0, pair, other, repeat, head };
}

/** A unit-length meaning vector for some text, or null if the model is not loaded or the text is empty. */
export async function embedText(text: string): Promise<Float32Array | null> {
  const input = text.replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!embedder || !input) return null;
  return unit(await embedder.embed(input));
}

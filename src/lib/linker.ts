/**
 * On-device auto-linking.
 *
 * v1 scores how related two thoughts are from the words they share
 * (TF-IDF cosine), with small boosts for a shared website or tag. It is pure
 * TypeScript: no model download, no network, instant. The `Scored` shape is
 * what a future embedding-based linker would return too, so swapping the
 * scorer does not touch callers.
 */
import { hostOf } from './text';

export type Doc = {
  id: string;
  text: string;
  url?: string | null;
  tags?: string[];
  /** Unit-length vector from the on-device language model, when it is switched on. */
  vec?: Float32Array;
};

export type Scored = { id: string; score: number };

export const LINK_THRESHOLD = 0.12;
export const LINK_TOP_K = 4;
/**
 * Linking by meaning.
 *
 * Sentence vectors from this kind of model are all somewhat alike: two
 * unrelated notes can score 0.4. A fixed cut-off therefore links nearly
 * everything, and the map collapses into one group. So a pair links by meaning
 * only when each is among the other's few nearest thoughts (mutual nearest
 * neighbours) and the pair stands out from that thought's usual similarity.
 */
export const MEANING_NEIGHBOURS = 3;
/** Measured on the test emulator with the model in semantic.ts: unrelated notes score about 0.08, the 90th percentile is 0.28, and a clear paraphrase 0.28 to 0.6. */
export const MEANING_FLOOR = 0.25;
/** Below this many thoughts there is no "usual similarity" to compare with, so a fixed bar is used. */
const MEANING_SMALL_CORPUS = 20;
const MEANING_SMALL_BAR = 0.25;
/** How many standard deviations above a thought's average similarity a neighbour must be. */
const MEANING_STAND_OUT = 1.25;

const STOP = new Set(
  (
    'a an and are as at be been but by can could did do does for from had has have he her his how i if in into is it its ' +
    'just me my no not of on or our she so some than that the their them then there these they this to too us was we were ' +
    'what when where which who why will with would you your about after again all also am any because before being both ' +
    'each few more most other over own same should such through under until up very while get got like one two new need ' +
    'want make made really thing things maybe still much many lot http https www com ' +
    'way idea ideas list check try add ask keep day days time times today tomorrow note self reminder ' +
    'three four five six seven eight nine ten first second next last week weeks month year'
  ).split(' '),
);

function stem(w: string): string {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 4 && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** Tokens with the word as written, so a stem can be shown back to the user. */
export function surfaceTokens(text: string): { stem: string; surface: string }[] {
  const out: { stem: string; surface: string }[] = [];
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 2 || STOP.has(raw)) continue;
    if (/^\d+$/.test(raw) && raw.length < 4) continue;
    out.push({ stem: stem(raw), surface: raw });
  }
  return out;
}

export function tokenize(text: string): string[] {
  return surfaceTokens(text).map((t) => t.stem);
}

/**
 * A short, plain reason two thoughts are linked, for the thought screen.
 * Mirrors what the scorer rewards: a shared website, a shared tag, shared words.
 */
export function whyLinked(a: Doc, b: Doc): string {
  const ha = hostOf(a.url);
  if (ha && ha === hostOf(b.url)) return `Both from ${ha}`;
  if (a.tags?.length && b.tags?.length) {
    const set = new Set(a.tags.map((t) => t.toLowerCase()));
    const tag = b.tags.find((t) => set.has(t.toLowerCase()));
    if (tag) return `Both tagged ${tag}`;
  }
  const mine = new Map(surfaceTokens(docText(a)).map((t) => [t.stem, t.surface]));
  const shared: string[] = [];
  for (const t of surfaceTokens(docText(b))) {
    if (mine.has(t.stem) && !shared.includes(mine.get(t.stem)!)) shared.push(mine.get(t.stem)!);
  }
  shared.sort((x, y) => y.length - x.length);
  if (shared.length === 0) return 'Similar meaning';
  if (shared.length === 1) return `Both mention ${shared[0]}`;
  return `Both mention ${shared[0]} and ${shared[1]}`;
}

type Vec = Map<string, number>;

function termFreq(tokens: string[]): Vec {
  const tf: Vec = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

function weigh(tf: Vec, idf: (t: string) => number): { vec: Vec; norm: number } {
  const vec: Vec = new Map();
  let sum = 0;
  for (const [t, f] of tf) {
    const w = (1 + Math.log(f)) * idf(t);
    vec.set(t, w);
    sum += w * w;
  }
  return { vec, norm: Math.sqrt(sum) };
}

function cosine(a: { vec: Vec; norm: number }, b: { vec: Vec; norm: number }): number {
  if (a.norm === 0 || b.norm === 0) return 0;
  const [small, large] = a.vec.size < b.vec.size ? [a.vec, b.vec] : [b.vec, a.vec];
  let dot = 0;
  for (const [t, w] of small) {
    const o = large.get(t);
    if (o) dot += w * o;
  }
  return dot / (a.norm * b.norm);
}

function docText(d: Doc): string {
  const host = hostOf(d.url);
  return host ? `${d.text} ${host.split('.').slice(0, -1).join(' ')}` : d.text;
}

function boost(a: Doc, b: Doc): number {
  let extra = 0;
  const ha = hostOf(a.url);
  if (ha && ha === hostOf(b.url)) extra += 0.2;
  if (a.tags?.length && b.tags?.length) {
    const set = new Set(a.tags.map((t) => t.toLowerCase()));
    if (b.tags.some((t) => set.has(t.toLowerCase()))) extra += 0.2;
  }
  return extra;
}

type Prepared = { vecs: { vec: Vec; norm: number }[]; distinctive: (t: string) => boolean; meaning: (Float32Array | undefined)[] };

function prepare(docs: Doc[]): Prepared {
  const tfs = docs.map((d) => termFreq(tokenize(docText(d))));
  const df = new Map<string, number>();
  for (const tf of tfs) for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length;
  // Rare words carry most of the signal; a word in half the thoughts carries almost none.
  const idf = (t: string) => Math.log((n + 1) / (df.get(t) ?? 1)) + 0.05;
  const rareLimit = Math.max(3, n * 0.2);
  return {
    vecs: tfs.map((tf) => weigh(tf, idf)),
    distinctive: (t) => t.length >= 4 && (df.get(t) ?? 0) <= rareLimit,
    meaning: docs.map((d) => d.vec),
  };
}

/**
 * Word similarity is cosine over TF-IDF, plus a lift for each distinctive word
 * two thoughts share. Short notes rarely share more than one or two words, so
 * plain cosine alone would leave "sourdough starter" and "sourdough crumb" unlinked.
 */
/** Cosine similarity of two unit vectors, or 0 when either is missing or they differ in size. */
export function meaningSimilarity(a: Float32Array | undefined, b: Float32Array | undefined): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

function similarity(p: Prepared, i: number, j: number): number {
  const a = p.vecs[i];
  const b = p.vecs[j];
  const base = cosine(a, b);
  if (base === 0) return 0;
  const [small, large] = a.vec.size < b.vec.size ? [a.vec, b.vec] : [b.vec, a.vec];
  let shared = 0;
  for (const t of small.keys()) if (large.has(t) && p.distinctive(t)) shared += 1;
  return base + Math.min(0.24, shared * 0.08);
}

/** The few thoughts nearest in meaning to thought `i`, if they stand out from the rest. */
function meaningNeighbours(vecs: (Float32Array | undefined)[], i: number): { j: number; cos: number }[] {
  const mine = vecs[i];
  if (!mine) return [];
  const sims: { j: number; cos: number }[] = [];
  let sum = 0;
  let sumSq = 0;
  for (let j = 0; j < vecs.length; j++) {
    if (j === i || !vecs[j]) continue;
    const cos = meaningSimilarity(mine, vecs[j]);
    sims.push({ j, cos });
    sum += cos;
    sumSq += cos * cos;
  }
  if (sims.length === 0) return [];
  let bar = MEANING_SMALL_BAR;
  if (sims.length >= MEANING_SMALL_CORPUS) {
    const mean = sum / sims.length;
    const sd = Math.sqrt(Math.max(0, sumSq / sims.length - mean * mean));
    bar = Math.max(MEANING_FLOOR, mean + MEANING_STAND_OUT * sd);
  }
  return sims
    .filter((x) => x.cos >= bar)
    .sort((x, y) => y.cos - x.cos)
    .slice(0, MEANING_NEIGHBOURS);
}

/** Related thoughts for `target` among `corpus` (target may or may not be in it). */
export function related(
  target: Doc,
  corpus: Doc[],
  { threshold = LINK_THRESHOLD, topK = LINK_TOP_K }: { threshold?: number; topK?: number } = {},
): Scored[] {
  const others = corpus.filter((d) => d.id !== target.id);
  if (others.length === 0) return [];
  const p = prepare([target, ...others]);
  const best = new Map<string, number>();
  for (let i = 0; i < others.length; i++) {
    const score = Math.min(1, similarity(p, 0, i + 1) + boost(target, others[i]));
    if (score >= threshold) best.set(others[i].id, score);
  }
  // By meaning: only where the other thought would pick this one back.
  for (const n of meaningNeighbours(p.meaning, 0)) {
    if (!meaningNeighbours(p.meaning, n.j).some((back) => back.j === 0)) continue;
    const id = others[n.j - 1].id;
    best.set(id, Math.max(best.get(id) ?? 0, Math.min(1, n.cos)));
  }
  return [...best]
    .map(([id, score]) => ({ id, score }))
    .sort((x, y) => y.score - x.score)
    .slice(0, topK);
}

/** Every auto link for a whole corpus. Used by "Rebuild connections". */
export function relateAll(
  corpus: Doc[],
  { threshold = LINK_THRESHOLD, topK = LINK_TOP_K }: { threshold?: number; topK?: number } = {},
): { a: string; b: string; score: number }[] {
  const p = prepare(corpus);
  const best = new Map<string, number>();
  const keep = (i: number, j: number, score: number) => {
    const [a, b] = corpus[i].id < corpus[j].id ? [corpus[i].id, corpus[j].id] : [corpus[j].id, corpus[i].id];
    const key = `${a}\u0000${b}`;
    if ((best.get(key) ?? 0) < score) best.set(key, score);
  };
  const byMeaning = corpus.map((_, i) => meaningNeighbours(p.meaning, i));
  for (let i = 0; i < corpus.length; i++) {
    const row = new Map<number, number>();
    for (let j = 0; j < corpus.length; j++) {
      if (i === j) continue;
      const score = Math.min(1, similarity(p, i, j) + boost(corpus[i], corpus[j]));
      if (score >= threshold) row.set(j, score);
    }
    for (const n of byMeaning[i]) {
      if (byMeaning[n.j].some((back) => back.j === i)) row.set(n.j, Math.max(row.get(n.j) ?? 0, Math.min(1, n.cos)));
    }
    const ranked = [...row].sort((x, y) => y[1] - x[1]).slice(0, topK);
    for (const [j, score] of ranked) keep(i, j, score);
  }
  return [...best].map(([key, score]) => {
    const [a, b] = key.split('\u0000');
    return { a, b, score };
  });
}

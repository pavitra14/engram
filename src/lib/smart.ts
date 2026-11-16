import type { SQLiteDatabase } from 'expo-sqlite';

import * as repo from '@/db/repo';

import { rebuildAllLinks } from './capture';
import { meaningSimilarity } from './linker';
import { embedText, loadModel, MODEL_ID, setSemanticState, unloadModel } from './semantic';

let running = false;

/**
 * Brings meaning-based linking up: loads the model (downloading it the first
 * time), gives every thought that lacks one a vector, then rebuilds the links.
 * Safe to call on every launch; it does nothing when the setting is off.
 */
export async function startSmartLinking(db: SQLiteDatabase): Promise<void> {
  if (running || (await repo.getMeta(db, 'semantic')) !== 'on') return;
  running = true;
  try {
    await loadModel();
    const ids = await repo.idsWithoutEmbedding(db, MODEL_ID);
    setSemanticState({ status: 'indexing', done: 0, total: ids.length });
    let done = 0;
    for (const id of ids) {
      const t = await repo.getThought(db, id);
      const vec = t ? await embedText(`${t.title ?? ''} ${t.body}`) : null;
      if (vec) await repo.saveEmbedding(db, id, MODEL_ID, vec);
      done += 1;
      if (done % 5 === 0 || done === ids.length) setSemanticState({ done });
    }
    if (ids.length > 0) await rebuildAllLinks(db);
    setSemanticState({ status: 'ready' });
    // The automated test waits for this line. The spread of similarities is logged
    // to help tune the linker; it contains numbers only, none of the person's words.
    const vecs = [...(await repo.loadEmbeddings(db, MODEL_ID)).values()].slice(0, 150);
    const sims: number[] = [];
    for (let i = 0; i < vecs.length; i++) for (let j = i + 1; j < vecs.length; j++) sims.push(meaningSimilarity(vecs[i], vecs[j]));
    sims.sort((x, y) => x - y);
    const q = (f: number) => (sims.length ? sims[Math.min(sims.length - 1, Math.floor(f * sims.length))].toFixed(2) : 'n/a');
    console.log(`engram: meaning ready; ${vecs.length} vectors of ${vecs[0]?.length ?? 0}; similarity p10=${q(0.1)} p50=${q(0.5)} p90=${q(0.9)} p99=${q(0.99)} max=${q(1)}`);
  } catch (e) {
    console.log('engram: meaning error', e instanceof Error ? e.message : String(e));
    setSemanticState({
      status: 'error',
      message: e instanceof Error ? e.message : 'The language model could not be loaded.',
    });
  } finally {
    running = false;
  }
}

export async function enableSmartLinking(db: SQLiteDatabase): Promise<void> {
  await repo.setMeta(db, 'semantic', 'on');
  await startSmartLinking(db);
}

/** Switches meaning-based linking off and returns links to word matching only. */
export async function disableSmartLinking(db: SQLiteDatabase): Promise<void> {
  await repo.setMeta(db, 'semantic', 'off');
  unloadModel();
  await repo.dropEmbeddings(db);
  await rebuildAllLinks(db);
  setSemanticState({ status: 'off', progress: 0, done: 0, total: 0, message: undefined });
}

import type { SQLiteDatabase } from 'expo-sqlite';

import * as repo from '@/db/repo';

import { rebuildAllLinks } from './capture';
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
    // The automated test waits for this line.
    console.log('engram: meaning ready');
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

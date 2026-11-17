/** Small things done to one thought from menus: pin it, remember it, park it, answer "still useful?". */
import type { Db } from '@/db/db';
import * as repo from '@/db/repo';
import type { Thought, TodoList } from '@/db/types';

import { dataChanged } from './bus';
import { decisionRecall, firstRecall, nextRecall } from './recall';
import { showToast } from './toast';

export async function setPinned(db: Db, t: Thought, pinned: boolean): Promise<void> {
  await repo.setPinned(db, t.id, pinned);
  dataChanged();
  showToast(pinned ? 'Pinned to the top of Today.' : 'Unpinned.');
}

/** Starts or stops "Remember this": the note comes back after 1, 3, 7, 21 and 60 days. */
export async function setRemember(db: Db, t: Thought, on: boolean): Promise<void> {
  const first = firstRecall();
  await repo.setRecall(db, t.id, on ? first.step : null, on ? first.at : null);
  dataChanged();
  showToast(on ? 'It comes back tomorrow, then after 3, 7, 21 and 60 days.' : 'It will not come back by itself.');
}

/** A decision comes back once, three months on, to ask how it turned out. */
export async function markDecision(db: Db, id: string): Promise<void> {
  const d = decisionRecall();
  await repo.setRecall(db, id, d.step, d.at);
}

/** "Keep" on a note that came back: schedule the next showing, or finish. Returns whether it will come back again. */
export async function keepRemembering(db: Db, t: Thought): Promise<boolean> {
  const next = t.recall_step == null ? null : nextRecall(t.recall_step);
  await repo.setRecall(db, t.id, next?.step ?? null, next?.at ?? null);
  dataChanged();
  return next !== null;
}

/** Puts a decision's look-back off by a month. */
export async function askLater(db: Db, t: Thought): Promise<void> {
  await repo.setRecall(db, t.id, t.recall_step, Date.now() + 30 * 86_400_000);
  dataChanged();
}

export async function stopRemembering(db: Db, t: Thought): Promise<void> {
  await repo.setRecall(db, t.id, null, null);
  dataChanged();
}

export async function park(db: Db, t: Thought, list: TodoList | null): Promise<void> {
  await repo.setList(db, t.id, list);
  dataChanged();
}

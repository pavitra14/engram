/**
 * One round of syncing with Engram Cloud: send what changed on this phone, then
 * fetch what changed elsewhere. No React Native imports, so the Node tests run
 * two "phones" against a stand-in server.
 *
 * The rules (docs/DECISIONS.md D33):
 *  - A note's words are never silently overwritten. If the cloud's copy changed
 *    since this phone last saw it and the words differ, the cloud's copy wins the
 *    original and this phone's words are kept as a new note beside it.
 *  - A deletion wins over an edit made elsewhere; the edit is kept as a new note.
 *  - Everything else (to-do state, tags, hand-made links) is last change wins.
 */
import type { Db } from '@/db/db';
import * as repo from '@/db/repo';
import type { OutboxEntry, SyncOp, SyncTable } from '@/db/repo';

export type OpResult = { t: SyncTable; id: string; s: 'ok' | 'conflict' | 'gone'; rev?: number };
export type RemoteRow = Record<string, unknown> & { t: SyncTable; id: string; seq: number; deleted?: boolean };

/** What the phone needs from the server. The real one is in remote.ts. */
export interface Remote {
  apply(batchId: string, ops: SyncOp[]): Promise<{ results: OpResult[] }>;
  pull(after: number): Promise<{ rows: RemoteRow[]; cursor: number; more: boolean }>;
  /** The cloud's current copy of one thought, or null if it has none. */
  thought(id: string): Promise<RemoteRow | null>;
}

export type SyncSummary = { sent: number; received: number; copies: number; touched: string[] };

type Pending = { id: string; ops: SyncOp[]; entries: OutboxEntry[] };

const PENDING = 'sync_pending';
const CURSOR = 'sync_cursor';

/** Keeps this phone's words as a new note when the original lost a conflict. */
async function keepCopy(db: Db, id: string, why: string): Promise<boolean> {
  const mine = await repo.getThought(db, id);
  if (!mine) return false;
  const label = (mine.title?.trim() || mine.body.trim().split('\n')[0] || 'Note').slice(0, 80);
  await repo.insertThought(db, {
    kind: mine.kind,
    title: `${label} (${why})`,
    body: mine.body,
    body_html: mine.body_html,
    url: mine.url,
    source: mine.source,
    media_path: mine.media_path,
    duration_ms: mine.duration_ms,
    file_name: mine.file_name,
    mime_type: mine.mime_type,
    file_size: mine.file_size,
  });
  return true;
}

async function push(db: Db, remote: Remote, newId: () => string, out: SyncSummary): Promise<void> {
  for (let round = 0; round < 200; round++) {
    // A batch that was sent but never answered is sent again exactly as it was.
    // The server remembers batches by id, so it is applied once either way.
    let pending: Pending | null = null;
    const saved = await repo.getMeta(db, PENDING);
    if (saved) {
      try {
        pending = JSON.parse(saved) as Pending;
      } catch {
        pending = null;
      }
    }
    if (!pending) {
      const entries = await repo.outboxEntries(db);
      if (entries.length === 0) return;
      const ops: SyncOp[] = [];
      const kept: OutboxEntry[] = [];
      for (const e of entries) {
        const op = await repo.buildOp(db, e);
        if (op) {
          ops.push(op);
          kept.push(e);
        } else {
          await repo.clearOutbox(db, e);
        }
      }
      if (ops.length === 0) continue;
      pending = { id: newId(), ops, entries: kept };
      await repo.setMeta(db, PENDING, JSON.stringify(pending));
    }

    const { results } = await remote.apply(pending.id, pending.ops);
    for (let i = 0; i < pending.entries.length; i++) {
      const e = pending.entries[i];
      const r = results[i];
      if (r && r.t === 'thoughts') {
        if (r.s === 'ok' && typeof r.rev === 'number') {
          await repo.setRev(db, e.id, r.rev);
        } else if (r.s === 'conflict') {
          if (await keepCopy(db, e.id, 'from this phone')) out.copies += 1;
          await repo.clearOutbox(db, e);
          const theirs = await remote.thought(e.id);
          if (theirs) await repo.applyRemote(db, { ...theirs, t: 'thoughts' });
          out.touched.push(e.id);
        } else if (r.s === 'gone') {
          if (await keepCopy(db, e.id, 'deleted on another device')) out.copies += 1;
          await repo.clearOutbox(db, e);
          await repo.applyRemote(db, { t: 'thoughts', id: e.id, seq: 0, deleted: true });
          out.touched.push(e.id);
        }
      }
      await repo.clearOutbox(db, e);
      out.sent += 1;
    }
    await repo.setMeta(db, PENDING, '');
  }
}

async function pull(db: Db, remote: Remote, out: SyncSummary): Promise<void> {
  let cursor = Number((await repo.getMeta(db, CURSOR)) ?? 0) || 0;
  for (let page = 0; page < 1000; page++) {
    const res = await remote.pull(cursor);
    for (const row of res.rows) {
      const id = await repo.applyRemote(db, row);
      if (id) out.touched.push(id);
      out.received += 1;
    }
    cursor = Math.max(cursor, Number(res.cursor) || 0);
    await repo.setMeta(db, CURSOR, String(cursor));
    if (!res.more || res.rows.length === 0) return;
  }
}

/** Sends, then fetches. Safe to call again after any failure: nothing is marked sent until the server has answered. */
export async function syncOnce(db: Db, remote: Remote, newId: () => string): Promise<SyncSummary> {
  const out: SyncSummary = { sent: 0, received: 0, copies: 0, touched: [] };
  await push(db, remote, newId, out);
  await pull(db, remote, out);
  // Copies made above are new notes, and they need sending too.
  if (out.copies > 0) await push(db, remote, newId, out);
  out.touched = [...new Set(out.touched)];
  return out;
}

/** Forgets where this phone had got to, so the next sync starts from the beginning. */
export async function resetCursor(db: Db): Promise<void> {
  await repo.setMeta(db, CURSOR, '0');
  await repo.setMeta(db, PENDING, '');
}

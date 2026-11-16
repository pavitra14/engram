/**
 * All SQL lives here. Nothing in this file imports React Native, so the Node
 * tests run the same code against node:sqlite.
 *
 * The tables are PowerSync tables (see schema.ts): no constraints, no cascades,
 * no "ON CONFLICT". The rules those would have enforced are written out below:
 * a link is stored once with a_id < b_id, deleting a thought removes what hangs
 * off it, and "insert or update" is a read followed by one or the other.
 */
import { ftsQuery } from '@/lib/text';

import type { Db } from './db';
import { EMBEDDINGS_DDL, OUTBOX_DDL, REVS_DDL, SEARCH_DDL, SYNCED_THOUGHT_COLUMNS, THOUGHT_COLUMNS } from './schema';
import type { Link, LinkKind, NewThought, Repeat, Tag, Thought, ThoughtKind } from './types';

const order = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

let makeId: () => string = () => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
};
/** The app passes in the phone's secure random UUID maker. */
export function setIdMaker(fn: () => string): void {
  makeId = fn;
}

// ---------- setup ----------

let searchIndex = false;

/** Creates the tables that are worked out from the thoughts. Safe to call on every launch. */
export async function prepare(db: Db): Promise<void> {
  await db.run(EMBEDDINGS_DDL);
  await db.run(OUTBOX_DDL);
  await db.run(REVS_DDL);
  try {
    await db.run(SEARCH_DDL);
    searchIndex = true;
  } catch {
    // This SQLite build has no full-text search. Search still works, by plain matching.
    searchIndex = false;
  }
}

export function hasSearchIndex(): boolean {
  return searchIndex;
}

async function index(db: Db, id: string, title: string | null, body: string): Promise<void> {
  if (!searchIndex) return;
  await db.run('DELETE FROM thoughts_fts WHERE id = ?', [id]);
  await db.run('INSERT INTO thoughts_fts (id, title, body) VALUES (?, ?, ?)', [id, title ?? '', body]);
}

/** Rebuilds the search index from the thoughts. */
export async function reindexSearch(db: Db): Promise<void> {
  if (!searchIndex) return;
  const rows = await db.all<{ id: string; title: string | null; body: string | null }>('SELECT id, title, body FROM thoughts');
  await db.tx(async (t) => {
    await t.run('DELETE FROM thoughts_fts');
    for (const r of rows) await t.run('INSERT INTO thoughts_fts (id, title, body) VALUES (?, ?, ?)', [r.id, r.title ?? '', r.body ?? '']);
  });
}

// ---------- change tracking for Engram Cloud ----------

export type SyncTable = 'thoughts' | 'links' | 'tags' | 'thought_tags';
let tracking = false;

/** Turned on while the person is signed in to Engram Cloud. Off, nothing is recorded and nothing can be sent. */
export function setTracking(on: boolean): void {
  tracking = on;
}

/** Notes that a row changed (or was deleted) on this phone and needs sending. */
async function mark(db: Db, tbl: SyncTable, id: string, del = false): Promise<void> {
  if (!tracking) return;
  await db.run(
    `INSERT INTO outbox (tbl, id, del, n) VALUES (?, ?, ?, 1)
     ON CONFLICT (tbl, id) DO UPDATE SET del = excluded.del, n = outbox.n + 1`,
    [tbl, id, del ? 1 : 0],
  );
}

// ---------- thoughts ----------

const COLS = ['id', ...THOUGHT_COLUMNS].join(', ');
const T_COLS = ['id', ...THOUGHT_COLUMNS].map((c) => `t.${c}`).join(', ');

/** PowerSync hands back null for a column never written; the app expects these two as numbers and body as text. */
function tidy<T extends Thought>(t: T): T {
  t.body = t.body ?? '';
  t.todo = t.todo ?? 0;
  t.priority = t.priority ?? 0;
  return t;
}
const tidyAll = <T extends Thought>(rows: T[]): T[] => rows.map(tidy);

export async function insertThought(db: Db, t: NewThought): Promise<Thought> {
  const now = Date.now();
  const row: Thought = {
    id: t.id ?? makeId(),
    kind: t.kind,
    body: t.body,
    body_html: t.body_html ?? null,
    title: t.title ?? null,
    url: t.url ?? null,
    source: t.source ?? null,
    media_path: t.media_path ?? null,
    duration_ms: t.duration_ms ?? null,
    file_name: t.file_name ?? null,
    mime_type: t.mime_type ?? null,
    file_size: t.file_size ?? null,
    todo: 0,
    remind_at: null,
    repeat: null,
    priority: 0,
    done_at: null,
    notif_id: null,
    event_id: t.event_id ?? null,
    event_title: t.event_title ?? null,
    event_at: t.event_at ?? null,
    created_at: t.created_at ?? now,
    updated_at: now,
  };
  await db.run(
    `INSERT INTO thoughts (${COLS}) VALUES (${['id', ...THOUGHT_COLUMNS].map(() => '?').join(', ')})`,
    [row.id, ...THOUGHT_COLUMNS.map((c) => row[c])],
  );
  await index(db, row.id, row.title, row.body);
  await mark(db, 'thoughts', row.id);
  return row;
}

export async function getThought(db: Db, id: string): Promise<Thought | null> {
  const t = await db.first<Thought>(`SELECT ${COLS} FROM thoughts WHERE id = ?`, [id]);
  return t ? tidy(t) : null;
}

export async function listThoughts(
  db: Db,
  { kind, limit = 500 }: { kind?: ThoughtKind | null; limit?: number } = {},
): Promise<Thought[]> {
  return tidyAll(
    kind
      ? await db.all<Thought>(`SELECT ${COLS} FROM thoughts WHERE kind = ? ORDER BY created_at DESC LIMIT ?`, [kind, limit])
      : await db.all<Thought>(`SELECT ${COLS} FROM thoughts ORDER BY created_at DESC LIMIT ?`, [limit]),
  );
}

export async function searchThoughts(
  db: Db,
  query: string,
  { kind, limit = 200 }: { kind?: ThoughtKind | null; limit?: number } = {},
): Promise<Thought[]> {
  const match = ftsQuery(query);
  if (!match) return listThoughts(db, { kind, limit });
  if (searchIndex) {
    return tidyAll(
      await db.all<Thought>(
        `SELECT ${T_COLS} FROM thoughts_fts f JOIN thoughts t ON t.id = f.id
         WHERE thoughts_fts MATCH ? ${kind ? 'AND t.kind = ?' : ''}
         ORDER BY bm25(thoughts_fts, 0.0, 4.0, 1.0) LIMIT ?`,
        kind ? [match, kind, limit] : [match, limit],
      ),
    );
  }
  // No index: every word must appear somewhere in the title, body or file name.
  const words = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  const where = words.map(() => "(lower(coalesce(title, '') || ' ' || coalesce(body, '') || ' ' || coalesce(file_name, '')) LIKE ?)");
  return tidyAll(
    await db.all<Thought>(
      `SELECT ${COLS} FROM thoughts WHERE ${where.join(' AND ')} ${kind ? 'AND kind = ?' : ''} ORDER BY created_at DESC LIMIT ?`,
      [...words.map((w) => `%${w.replace(/[%_]/g, '')}%`), ...(kind ? [kind] : []), limit],
    ),
  );
}

/** Saves a note's title and body. `body` is the plain words; `body_html` the formatted version, if any. */
export async function updateThought(
  db: Db,
  id: string,
  { title, body, body_html }: { title: string | null; body: string; body_html: string | null },
): Promise<void> {
  await db.run('UPDATE thoughts SET title = ?, body = ?, body_html = ?, updated_at = ? WHERE id = ?', [
    title,
    body,
    body_html,
    Date.now(),
    id,
  ]);
  await index(db, id, title, body);
  await mark(db, 'thoughts', id);
}

/** Deletes a thought's rows. Records nothing for sending. */
async function eraseThought(t: Db, id: string): Promise<void> {
  await t.run('DELETE FROM links WHERE a_id = ? OR b_id = ?', [id, id]);
  await t.run('DELETE FROM thought_tags WHERE thought_id = ?', [id]);
  await t.run('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM thought_tags)');
  await t.run('DELETE FROM embeddings WHERE thought_id = ?', [id]);
  await t.run('DELETE FROM sync_revs WHERE id = ?', [id]);
  if (searchIndex) await t.run('DELETE FROM thoughts_fts WHERE id = ?', [id]);
  await t.run('DELETE FROM thoughts WHERE id = ?', [id]);
}

/** Removes a thought and everything that hangs off it. */
export async function deleteThought(db: Db, id: string): Promise<void> {
  await db.tx(async (t) => {
    if (tracking) {
      const links = await t.all<{ id: string }>(`SELECT id FROM links WHERE kind = 'manual' AND (a_id = ? OR b_id = ?)`, [id, id]);
      const tagged = await t.all<{ id: string }>('SELECT id FROM thought_tags WHERE thought_id = ?', [id]);
      for (const l of links) await mark(t, 'links', l.id, true);
      for (const x of tagged) await mark(t, 'thought_tags', x.id, true);
      await mark(t, 'thoughts', id, true);
    }
    await eraseThought(t, id);
  });
}

export async function countThoughts(db: Db): Promise<number> {
  const r = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM thoughts');
  return r?.n ?? 0;
}

// ---------- to-dos and reminders ----------

/** Puts a thought on the to-do list, optionally with a reminder time and a repeat. Clears any "done" state. */
export async function setTodo(
  db: Db,
  id: string,
  { remindAt, notifId, repeat = null }: { remindAt: number | null; notifId: string | null; repeat?: Repeat | null },
): Promise<void> {
  await db.run(
    'UPDATE thoughts SET todo = 1, remind_at = ?, notif_id = ?, repeat = ?, done_at = NULL, updated_at = ? WHERE id = ?',
    [remindAt, notifId, remindAt ? repeat : null, Date.now(), id],
  );
  await mark(db, 'thoughts', id);
}

/** Records which phone alarm belongs to a reminder. The alarm id is this phone's own business and is never sent. */
export async function setNotifId(db: Db, id: string, notifId: string | null): Promise<void> {
  await db.run('UPDATE thoughts SET notif_id = ? WHERE id = ?', [notifId, id]);
}

export async function clearTodo(db: Db, id: string): Promise<void> {
  await db.run(
    'UPDATE thoughts SET todo = 0, remind_at = NULL, notif_id = NULL, repeat = NULL, priority = 0, done_at = NULL, updated_at = ? WHERE id = ?',
    [Date.now(), id],
  );
  await mark(db, 'thoughts', id);
}

export async function setDone(db: Db, id: string, done: boolean): Promise<void> {
  if (done) {
    await db.run('UPDATE thoughts SET done_at = ?, notif_id = NULL, updated_at = ? WHERE id = ?', [Date.now(), Date.now(), id]);
  } else {
    await db.run('UPDATE thoughts SET done_at = NULL, updated_at = ? WHERE id = ?', [Date.now(), id]);
  }
  await mark(db, 'thoughts', id);
}

export async function setPriority(db: Db, id: string, important: boolean): Promise<void> {
  await db.run('UPDATE thoughts SET priority = ?, updated_at = ? WHERE id = ?', [important ? 1 : 0, Date.now(), id]);
  await mark(db, 'thoughts', id);
}

/** Open to-dos: important first, then those with a time (soonest first), then the rest, newest first. */
export async function listOpenTodos(db: Db): Promise<Thought[]> {
  return tidyAll(
    await db.all<Thought>(
      `SELECT ${COLS} FROM thoughts WHERE todo = 1 AND done_at IS NULL
       ORDER BY (remind_at IS NULL), remind_at ASC, created_at DESC`,
    ),
  );
}

export async function listDoneTodos(db: Db, limit = 100): Promise<Thought[]> {
  return tidyAll(
    await db.all<Thought>(`SELECT ${COLS} FROM thoughts WHERE todo = 1 AND done_at IS NOT NULL ORDER BY done_at DESC LIMIT ?`, [limit]),
  );
}

// ---------- meaning vectors ----------

const HEX = '0123456789abcdef';

/** A vector as hex text. PowerSync tables hold text, whole numbers and decimals only, and hex needs no helper library. */
export function vectorToHex(v: Float32Array): string {
  const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += HEX[bytes[i] >> 4] + HEX[bytes[i] & 15];
  return out;
}

export function hexToVector(hex: string): Float32Array {
  const bytes = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return new Float32Array(bytes.buffer, 0, bytes.length >> 2);
}

export async function saveEmbedding(db: Db, id: string, model: string, vector: Float32Array): Promise<void> {
  await db.run(
    `INSERT INTO embeddings (thought_id, model, vector) VALUES (?, ?, ?)
     ON CONFLICT (thought_id) DO UPDATE SET model = excluded.model, vector = excluded.vector`,
    [id, model, vectorToHex(vector)],
  );
}

export async function loadEmbeddings(db: Db, model: string): Promise<Map<string, Float32Array>> {
  const rows = await db.all<{ thought_id: string; vector: string }>('SELECT thought_id, vector FROM embeddings WHERE model = ?', [model]);
  const out = new Map<string, Float32Array>();
  for (const r of rows) if (typeof r.vector === 'string') out.set(r.thought_id, hexToVector(r.vector));
  return out;
}

export async function idsWithoutEmbedding(db: Db, model: string): Promise<string[]> {
  const rows = await db.all<{ id: string }>(
    `SELECT t.id FROM thoughts t LEFT JOIN embeddings e ON e.thought_id = t.id AND e.model = ?
     WHERE e.thought_id IS NULL ORDER BY t.created_at DESC`,
    [model],
  );
  return rows.map((r) => r.id);
}

export async function dropEmbeddings(db: Db): Promise<void> {
  await db.run('DELETE FROM embeddings');
}

// ---------- links ----------

export function listLinks(db: Db): Promise<Link[]> {
  return db.all<Link>('SELECT a_id, b_id, kind, weight FROM links');
}

/** Writes a link. Records nothing for sending. */
async function writeLink(db: Db, x: string, y: string, kind: LinkKind, weight: number): Promise<string | null> {
  if (x === y) return null;
  const [a, b] = order(x, y);
  const id = `${a}:${b}`;
  const existing = await db.first<{ kind: LinkKind }>('SELECT kind FROM links WHERE id = ?', [id]);
  if (!existing) {
    await db.run('INSERT INTO links (id, a_id, b_id, kind, weight) VALUES (?, ?, ?, ?, ?)', [id, a, b, kind, weight]);
  } else if (existing.kind === 'manual' && kind === 'auto') {
    // Keep the person's own link exactly as it is.
  } else {
    await db.run('UPDATE links SET kind = ?, weight = ? WHERE id = ?', [kind, weight, id]);
  }
  return id;
}

/** Adds a link or updates its weight. A manual link is never downgraded to an automatic one. */
export async function upsertLink(db: Db, x: string, y: string, kind: LinkKind, weight: number): Promise<void> {
  const id = await writeLink(db, x, y, kind, weight);
  // Only links the person made are sent. Automatic ones are worked out again on each phone.
  if (id && kind === 'manual') await mark(db, 'links', id);
}

export async function removeLink(db: Db, x: string, y: string): Promise<void> {
  const [a, b] = order(x, y);
  await db.run('DELETE FROM links WHERE id = ?', [`${a}:${b}`]);
  await mark(db, 'links', `${a}:${b}`, true);
}

export type Neighbour = Thought & { link_kind: LinkKind; weight: number };

export async function neighboursOf(db: Db, id: string): Promise<Neighbour[]> {
  return tidyAll(
    await db.all<Neighbour>(
      `SELECT ${T_COLS}, l.kind AS link_kind, l.weight AS weight
       FROM links l JOIN thoughts t ON t.id = CASE WHEN l.a_id = ? THEN l.b_id ELSE l.a_id END
       WHERE l.a_id = ? OR l.b_id = ?
       ORDER BY (l.kind = 'manual') DESC, l.weight DESC`,
      [id, id, id],
    ),
  );
}

export async function replaceAutoLinks(db: Db, links: { a: string; b: string; score: number }[]): Promise<void> {
  await db.tx(async (t) => {
    await t.run(`DELETE FROM links WHERE kind = 'auto'`);
    for (const l of links) await upsertLink(t, l.a, l.b, 'auto', l.score);
  });
}

// ---------- tags ----------

export function tagsOf(db: Db, thoughtId: string): Promise<Tag[]> {
  return db.all<Tag>(
    `SELECT g.id, g.name FROM thought_tags tt JOIN tags g ON g.id = tt.tag_id
     WHERE tt.thought_id = ? ORDER BY g.name`,
    [thoughtId],
  );
}

export function allTagPairs(db: Db): Promise<{ thought_id: string; name: string }[]> {
  return db.all(`SELECT tt.thought_id, g.name FROM thought_tags tt JOIN tags g ON g.id = tt.tag_id`);
}

export async function addTag(db: Db, thoughtId: string, rawName: string): Promise<void> {
  const name = rawName.trim().replace(/^#+/, '').slice(0, 32);
  if (!name) return;
  let tag = await db.first<{ id: string }>('SELECT id FROM tags WHERE lower(name) = lower(?)', [name]);
  if (!tag) {
    tag = { id: makeId() };
    await db.run('INSERT INTO tags (id, name) VALUES (?, ?)', [tag.id, name]);
    await mark(db, 'tags', tag.id);
  }
  const id = `${thoughtId}:${tag.id}`;
  const has = await db.first<{ id: string }>('SELECT id FROM thought_tags WHERE id = ?', [id]);
  if (!has) {
    await db.run('INSERT INTO thought_tags (id, thought_id, tag_id) VALUES (?, ?, ?)', [id, thoughtId, tag.id]);
    await mark(db, 'thought_tags', id);
  }
}

export async function removeTag(db: Db, thoughtId: string, tagId: string): Promise<void> {
  await db.run('DELETE FROM thought_tags WHERE id = ?', [`${thoughtId}:${tagId}`]);
  await mark(db, 'thought_tags', `${thoughtId}:${tagId}`, true);
  const used = await db.first<{ id: string }>('SELECT id FROM thought_tags WHERE tag_id = ? LIMIT 1', [tagId]);
  if (!used) {
    await db.run('DELETE FROM tags WHERE id = ?', [tagId]);
    await mark(db, 'tags', tagId, true);
  }
}

// ---------- settings ----------

export async function getMeta(db: Db, key: string): Promise<string | null> {
  const r = await db.first<{ value: string }>('SELECT value FROM meta WHERE id = ?', [key]);
  return r?.value ?? null;
}

export async function setMeta(db: Db, key: string, value: string): Promise<void> {
  const has = await db.first<{ id: string }>('SELECT id FROM meta WHERE id = ?', [key]);
  if (has) await db.run('UPDATE meta SET value = ? WHERE id = ?', [value, key]);
  else await db.run('INSERT INTO meta (id, value) VALUES (?, ?)', [key, value]);
}

/** Deletes every thought and what hangs off them. Settings stay. */
export async function wipeAll(db: Db): Promise<void> {
  await db.tx(async (t) => {
    if (tracking) {
      // Deleting everything here deletes it from the cloud copy and the person's other phones too.
      for (const [tbl, where] of [['thought_tags', ''], ['tags', ''], ['links', ` WHERE kind = 'manual'`], ['thoughts', '']] as const) {
        for (const r of await t.all<{ id: string }>(`SELECT id FROM ${tbl}${where}`)) await mark(t, tbl, r.id, true);
      }
    }
    for (const table of ['links', 'thought_tags', 'tags', 'embeddings', 'sync_revs', 'thoughts']) await t.run(`DELETE FROM ${table}`);
    if (searchIndex) await t.run('DELETE FROM thoughts_fts');
  });
}

// ---------- Engram Cloud: what to send, and applying what comes back ----------

export type OutboxEntry = { tbl: SyncTable; id: string; del: number; n: number };
export type SyncOp = { t: SyncTable; id: string; del?: boolean; base?: number | null; row?: Record<string, unknown> };

/** Queues every thought, hand-made link and tag for sending. Used when sync is first turned on. */
export async function markEverything(db: Db): Promise<void> {
  await db.tx(async (t) => {
    for (const [tbl, where] of [['thoughts', 'true'], ['links', `kind = 'manual'`], ['tags', 'true'], ['thought_tags', 'true']] as const) {
      await t.run(`INSERT INTO outbox (tbl, id, del, n) SELECT '${tbl}', id, 0, 1 FROM ${tbl} WHERE ${where} ON CONFLICT (tbl, id) DO NOTHING`);
    }
  });
}

export function outboxEntries(db: Db, limit = 200): Promise<OutboxEntry[]> {
  // Thoughts first, so a link or tag never arrives before the thought it belongs to.
  return db.all<OutboxEntry>(
    `SELECT tbl, id, del, n FROM outbox ORDER BY CASE tbl WHEN 'thoughts' THEN 0 WHEN 'tags' THEN 1 ELSE 2 END LIMIT ?`,
    [limit],
  );
}

export async function outboxCount(db: Db): Promise<number> {
  return (await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM outbox'))?.n ?? 0;
}

/** Forgets a sent change, unless the row changed again while it was being sent. */
export async function clearOutbox(db: Db, e: OutboxEntry): Promise<void> {
  await db.run('DELETE FROM outbox WHERE tbl = ? AND id = ? AND n = ?', [e.tbl, e.id, e.n]);
}

export async function isQueued(db: Db, tbl: SyncTable, id: string): Promise<boolean> {
  return !!(await db.first<{ id: string }>('SELECT id FROM outbox WHERE tbl = ? AND id = ?', [tbl, id]));
}

/** Empties the sync bookkeeping. The thoughts themselves are untouched. */
export async function resetSync(db: Db): Promise<void> {
  await db.run('DELETE FROM outbox');
  await db.run('DELETE FROM sync_revs');
}

export async function getRev(db: Db, id: string): Promise<number | null> {
  return (await db.first<{ rev: number }>('SELECT rev FROM sync_revs WHERE id = ?', [id]))?.rev ?? null;
}

export async function setRev(db: Db, id: string, rev: number): Promise<void> {
  await db.run('INSERT INTO sync_revs (id, rev) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET rev = excluded.rev', [id, rev]);
}

/** One queued change as the cloud expects it. Null when the row no longer exists and is not marked deleted. */
export async function buildOp(db: Db, e: OutboxEntry): Promise<SyncOp | null> {
  if (e.del) return { t: e.tbl, id: e.id, del: true };
  if (e.tbl === 'thoughts') {
    const t = await getThought(db, e.id);
    if (!t) return null;
    const row: Record<string, unknown> = {};
    for (const c of SYNCED_THOUGHT_COLUMNS) row[c] = t[c];
    return { t: 'thoughts', id: e.id, base: await getRev(db, e.id), row };
  }
  if (e.tbl === 'links') {
    const l = await db.first<Link>(`SELECT a_id, b_id, kind, weight FROM links WHERE id = ? AND kind = 'manual'`, [e.id]);
    return l ? { t: 'links', id: e.id, row: { a_id: l.a_id, b_id: l.b_id, weight: l.weight } } : null;
  }
  if (e.tbl === 'tags') {
    const g = await db.first<Tag>('SELECT id, name FROM tags WHERE id = ?', [e.id]);
    return g ? { t: 'tags', id: e.id, row: { name: g.name } } : null;
  }
  const x = await db.first<{ thought_id: string; tag_id: string }>('SELECT thought_id, tag_id FROM thought_tags WHERE id = ?', [e.id]);
  return x ? { t: 'thought_tags', id: e.id, row: x } : null;
}

/**
 * Applies one row that came from the cloud, using only writes that record
 * nothing for sending back (and without switching tracking off, so an edit the
 * person makes at the same moment is still recorded). Returns the thought id it touched, if any. A row that is waiting to be
 * sent from this phone is left alone, so the next push can detect the conflict.
 */
export async function applyRemote(db: Db, r: Record<string, unknown> & { t: SyncTable; id: string; deleted?: boolean }): Promise<string | null> {
  if (await isQueued(db, r.t, r.id)) return null;
  {
    if (r.t === 'thoughts') {
      const existing = await getThought(db, r.id);
      if (r.deleted) {
        if (existing) await db.tx((t) => eraseThought(t, r.id));
        return existing ? r.id : null;
      }
      const cols = SYNCED_THOUGHT_COLUMNS;
      if (existing) {
        await db.run(`UPDATE thoughts SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => r[c] ?? null), r.id]);
      } else {
        await db.run(`INSERT INTO thoughts (id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`, [r.id, ...cols.map((c) => r[c] ?? null)]);
      }
      await index(db, r.id, (r.title as string | null) ?? null, (r.body as string | null) ?? '');
      if (typeof r.revision === 'number') await setRev(db, r.id, r.revision);
      return r.id;
    }
    if (r.t === 'links') {
      if (r.deleted) await db.run('DELETE FROM links WHERE id = ?', [r.id]);
      else await writeLink(db, String(r.a_id), String(r.b_id), 'manual', Number(r.weight ?? 1));
      return null;
    }
    if (r.t === 'tags') {
      const has = await db.first<{ id: string }>('SELECT id FROM tags WHERE id = ?', [r.id]);
      if (r.deleted) await db.run('DELETE FROM tags WHERE id = ?', [r.id]);
      else if (has) await db.run('UPDATE tags SET name = ? WHERE id = ?', [r.name, r.id]);
      else await db.run('INSERT INTO tags (id, name) VALUES (?, ?)', [r.id, r.name]);
      return null;
    }
    const has = await db.first<{ id: string }>('SELECT id FROM thought_tags WHERE id = ?', [r.id]);
    if (r.deleted) await db.run('DELETE FROM thought_tags WHERE id = ?', [r.id]);
    else if (!has) await db.run('INSERT INTO thought_tags (id, thought_id, tag_id) VALUES (?, ?, ?)', [r.id, r.thought_id, r.tag_id]);
    return typeof r.thought_id === 'string' ? r.thought_id : null;
  }
}

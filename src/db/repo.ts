import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { ftsQuery } from '@/lib/text';

import type { Link, LinkKind, NewThought, Tag, Thought, ThoughtKind } from './types';

const order = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

// ---------- thoughts ----------

export async function insertThought(db: SQLiteDatabase, t: NewThought & { id?: string }): Promise<Thought> {
  const now = Date.now();
  const row: Thought = {
    id: t.id ?? randomUUID(),
    kind: t.kind,
    body: t.body,
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
    done_at: null,
    notif_id: null,
    created_at: t.created_at ?? now,
    updated_at: now,
  };
  await db.runAsync(
    `INSERT INTO thoughts (id, kind, body, title, url, source, media_path, duration_ms, file_name, mime_type, file_size, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id,
    row.kind,
    row.body,
    row.title,
    row.url,
    row.source,
    row.media_path,
    row.duration_ms,
    row.file_name,
    row.mime_type,
    row.file_size,
    row.created_at,
    row.updated_at,
  );
  return row;
}

const COLS =
  'id, kind, body, title, url, source, media_path, duration_ms, file_name, mime_type, file_size, todo, remind_at, done_at, notif_id, created_at, updated_at';

export function getThought(db: SQLiteDatabase, id: string): Promise<Thought | null> {
  return db.getFirstAsync<Thought>(`SELECT ${COLS} FROM thoughts WHERE id = ?`, id);
}

export function listThoughts(
  db: SQLiteDatabase,
  { kind, limit = 500 }: { kind?: ThoughtKind | null; limit?: number } = {},
): Promise<Thought[]> {
  return kind
    ? db.getAllAsync<Thought>(
        `SELECT ${COLS} FROM thoughts WHERE kind = ? ORDER BY created_at DESC LIMIT ?`,
        kind,
        limit,
      )
    : db.getAllAsync<Thought>(`SELECT ${COLS} FROM thoughts ORDER BY created_at DESC LIMIT ?`, limit);
}

export async function searchThoughts(
  db: SQLiteDatabase,
  query: string,
  { kind, limit = 200 }: { kind?: ThoughtKind | null; limit?: number } = {},
): Promise<Thought[]> {
  const match = ftsQuery(query);
  if (!match) return listThoughts(db, { kind, limit });
  const cols = COLS.split(', ')
    .map((c) => `t.${c}`)
    .join(', ');
  return db.getAllAsync<Thought>(
    `SELECT ${cols} FROM thoughts_fts f JOIN thoughts t ON t.pk = f.rowid
     WHERE thoughts_fts MATCH ? ${kind ? 'AND t.kind = ?' : ''}
     ORDER BY bm25(thoughts_fts, 4.0, 1.0) LIMIT ?`,
    ...(kind ? [match, kind, limit] : [match, limit]),
  );
}

export async function updateThoughtBody(db: SQLiteDatabase, id: string, body: string): Promise<void> {
  await db.runAsync('UPDATE thoughts SET body = ?, updated_at = ? WHERE id = ?', body, Date.now(), id);
}

export async function deleteThought(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM thoughts WHERE id = ?', id);
}

export async function countThoughts(db: SQLiteDatabase): Promise<number> {
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM thoughts');
  return r?.n ?? 0;
}

// ---------- to-dos and reminders ----------

/** Puts a thought on the to-do list, optionally with a reminder time. Clears any "done" state. */
export async function setTodo(
  db: SQLiteDatabase,
  id: string,
  { remindAt, notifId }: { remindAt: number | null; notifId: string | null },
): Promise<void> {
  await db.runAsync(
    'UPDATE thoughts SET todo = 1, remind_at = ?, notif_id = ?, done_at = NULL, updated_at = ? WHERE id = ?',
    remindAt,
    notifId,
    Date.now(),
    id,
  );
}

export async function clearTodo(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(
    'UPDATE thoughts SET todo = 0, remind_at = NULL, notif_id = NULL, done_at = NULL, updated_at = ? WHERE id = ?',
    Date.now(),
    id,
  );
}

export async function setDone(db: SQLiteDatabase, id: string, done: boolean): Promise<void> {
  await db.runAsync(
    'UPDATE thoughts SET done_at = ?, notif_id = CASE WHEN ? THEN NULL ELSE notif_id END, updated_at = ? WHERE id = ?',
    done ? Date.now() : null,
    done ? 1 : 0,
    Date.now(),
    id,
  );
}

/** Open to-dos: those with a time first, soonest first; then the rest, newest first. */
export function listOpenTodos(db: SQLiteDatabase): Promise<Thought[]> {
  return db.getAllAsync<Thought>(
    `SELECT ${COLS} FROM thoughts WHERE todo = 1 AND done_at IS NULL
     ORDER BY (remind_at IS NULL), remind_at ASC, created_at DESC`,
  );
}

export function listDoneTodos(db: SQLiteDatabase, limit = 100): Promise<Thought[]> {
  return db.getAllAsync<Thought>(
    `SELECT ${COLS} FROM thoughts WHERE todo = 1 AND done_at IS NOT NULL ORDER BY done_at DESC LIMIT ?`,
    limit,
  );
}

// ---------- embeddings ----------

export async function saveEmbedding(db: SQLiteDatabase, id: string, model: string, vector: Float32Array): Promise<void> {
  const bytes = new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
  await db.runAsync(
    `INSERT INTO embeddings (thought_id, model, vector) VALUES (?, ?, ?)
     ON CONFLICT (thought_id) DO UPDATE SET model = excluded.model, vector = excluded.vector`,
    id,
    model,
    bytes,
  );
}

export async function loadEmbeddings(db: SQLiteDatabase, model: string): Promise<Map<string, Float32Array>> {
  const rows = await db.getAllAsync<{ thought_id: string; vector: Uint8Array }>(
    'SELECT thought_id, vector FROM embeddings WHERE model = ?',
    model,
  );
  const out = new Map<string, Float32Array>();
  for (const r of rows) {
    // Copy so the floats are aligned whatever offset the driver handed back.
    const copy = new Uint8Array(r.vector);
    out.set(r.thought_id, new Float32Array(copy.buffer, 0, Math.floor(copy.byteLength / 4)));
  }
  return out;
}

export async function idsWithoutEmbedding(db: SQLiteDatabase, model: string): Promise<string[]> {
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT t.id FROM thoughts t LEFT JOIN embeddings e ON e.thought_id = t.id AND e.model = ?
     WHERE e.thought_id IS NULL ORDER BY t.created_at DESC`,
    model,
  );
  return rows.map((r) => r.id);
}

export async function dropEmbeddings(db: SQLiteDatabase): Promise<void> {
  await db.runAsync('DELETE FROM embeddings');
}

// ---------- links ----------

export function listLinks(db: SQLiteDatabase): Promise<Link[]> {
  return db.getAllAsync<Link>('SELECT a_id, b_id, kind, weight FROM links');
}

export async function upsertLink(
  db: SQLiteDatabase,
  x: string,
  y: string,
  kind: LinkKind,
  weight: number,
): Promise<void> {
  if (x === y) return;
  const [a, b] = order(x, y);
  // A manual link is never downgraded to an auto one.
  await db.runAsync(
    `INSERT INTO links (a_id, b_id, kind, weight) VALUES (?, ?, ?, ?)
     ON CONFLICT (a_id, b_id) DO UPDATE SET
       weight = CASE WHEN links.kind = 'manual' AND excluded.kind = 'auto' THEN links.weight ELSE excluded.weight END,
       kind   = CASE WHEN links.kind = 'manual' THEN 'manual' ELSE excluded.kind END`,
    a,
    b,
    kind,
    weight,
  );
}

export async function removeLink(db: SQLiteDatabase, x: string, y: string): Promise<void> {
  const [a, b] = order(x, y);
  await db.runAsync('DELETE FROM links WHERE a_id = ? AND b_id = ?', a, b);
}

export type Neighbour = Thought & { link_kind: LinkKind; weight: number };

export function neighboursOf(db: SQLiteDatabase, id: string): Promise<Neighbour[]> {
  const cols = COLS.split(', ')
    .map((c) => `t.${c}`)
    .join(', ');
  return db.getAllAsync<Neighbour>(
    `SELECT ${cols}, l.kind AS link_kind, l.weight AS weight
     FROM links l JOIN thoughts t ON t.id = CASE WHEN l.a_id = ?1 THEN l.b_id ELSE l.a_id END
     WHERE l.a_id = ?1 OR l.b_id = ?1
     ORDER BY (l.kind = 'manual') DESC, l.weight DESC`,
    id,
  );
}

export async function replaceAutoLinks(
  db: SQLiteDatabase,
  links: { a: string; b: string; score: number }[],
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM links WHERE kind = 'auto'`);
    for (const l of links) await upsertLink(db, l.a, l.b, 'auto', l.score);
  });
}

// ---------- tags ----------

export function tagsOf(db: SQLiteDatabase, thoughtId: string): Promise<Tag[]> {
  return db.getAllAsync<Tag>(
    `SELECT g.id, g.name FROM thought_tags tt JOIN tags g ON g.id = tt.tag_id
     WHERE tt.thought_id = ? ORDER BY g.name`,
    thoughtId,
  );
}

export function allTagPairs(db: SQLiteDatabase): Promise<{ thought_id: string; name: string }[]> {
  return db.getAllAsync(`SELECT tt.thought_id, g.name FROM thought_tags tt JOIN tags g ON g.id = tt.tag_id`);
}

export async function addTag(db: SQLiteDatabase, thoughtId: string, rawName: string): Promise<void> {
  const name = rawName.trim().replace(/^#+/, '').slice(0, 32);
  if (!name) return;
  await db.runAsync('INSERT OR IGNORE INTO tags (id, name) VALUES (?, ?)', randomUUID(), name);
  const tag = await db.getFirstAsync<{ id: string }>('SELECT id FROM tags WHERE name = ?', name);
  if (tag) {
    await db.runAsync('INSERT OR IGNORE INTO thought_tags (thought_id, tag_id) VALUES (?, ?)', thoughtId, tag.id);
  }
}

export async function removeTag(db: SQLiteDatabase, thoughtId: string, tagId: string): Promise<void> {
  await db.runAsync('DELETE FROM thought_tags WHERE thought_id = ? AND tag_id = ?', thoughtId, tagId);
  await db.runAsync('DELETE FROM tags WHERE id = ? AND id NOT IN (SELECT tag_id FROM thought_tags)', tagId);
}

// ---------- layout ----------

export function loadLayout(db: SQLiteDatabase): Promise<{ thought_id: string; x: number; y: number }[]> {
  return db.getAllAsync('SELECT thought_id, x, y FROM graph_layout');
}

export async function saveLayout(db: SQLiteDatabase, points: { id: string; x: number; y: number }[]): Promise<void> {
  if (points.length === 0) return;
  await db.withTransactionAsync(async () => {
    for (const p of points) {
      await db.runAsync(
        `INSERT INTO graph_layout (thought_id, x, y) VALUES (?, ?, ?)
         ON CONFLICT (thought_id) DO UPDATE SET x = excluded.x, y = excluded.y`,
        p.id,
        p.x,
        p.y,
      );
    }
  });
}

// ---------- settings ----------

export async function getMeta(db: SQLiteDatabase, key: string): Promise<string | null> {
  const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key);
  return r?.value ?? null;
}

export async function setMeta(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

export async function wipeAll(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM thoughts; DELETE FROM tags;');
  });
}

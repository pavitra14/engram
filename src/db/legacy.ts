/**
 * The database as it was before version 0.3 (expo-sqlite, versioned migrations).
 * Kept for two reasons: `importLegacy` reads a phone's old file once and carries
 * its thoughts over, and the Node tests build an old file from these statements
 * to prove that import loses nothing. Nothing here is ever run on the new database.
 */
import type { Db } from './db';
import * as repo from './repo';
import { THOUGHT_COLUMNS } from './schema';

export const LEGACY_MIGRATIONS: string[] = [
  // v1 — thoughts, full-text search, links, tags, layout, settings
  `
  CREATE TABLE thoughts (
    pk          INTEGER PRIMARY KEY AUTOINCREMENT,
    id          TEXT NOT NULL UNIQUE,
    kind        TEXT NOT NULL CHECK (kind IN ('text','voice','link','image')),
    body        TEXT NOT NULL DEFAULT '',
    title       TEXT,
    url         TEXT,
    source      TEXT,
    media_path  TEXT,
    duration_ms INTEGER,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );
  CREATE INDEX thoughts_created ON thoughts (created_at DESC);

  CREATE VIRTUAL TABLE thoughts_fts USING fts5(
    title, body,
    content='thoughts', content_rowid='pk',
    tokenize='unicode61 remove_diacritics 2'
  );
  CREATE TRIGGER thoughts_ai AFTER INSERT ON thoughts BEGIN
    INSERT INTO thoughts_fts (rowid, title, body) VALUES (new.pk, new.title, new.body);
  END;
  CREATE TRIGGER thoughts_ad AFTER DELETE ON thoughts BEGIN
    INSERT INTO thoughts_fts (thoughts_fts, rowid, title, body) VALUES ('delete', old.pk, old.title, old.body);
  END;
  CREATE TRIGGER thoughts_au AFTER UPDATE OF title, body ON thoughts BEGIN
    INSERT INTO thoughts_fts (thoughts_fts, rowid, title, body) VALUES ('delete', old.pk, old.title, old.body);
    INSERT INTO thoughts_fts (rowid, title, body) VALUES (new.pk, new.title, new.body);
  END;

  -- Undirected: a_id < b_id always.
  CREATE TABLE links (
    a_id   TEXT NOT NULL REFERENCES thoughts (id) ON DELETE CASCADE,
    b_id   TEXT NOT NULL REFERENCES thoughts (id) ON DELETE CASCADE,
    kind   TEXT NOT NULL CHECK (kind IN ('auto','manual')),
    weight REAL NOT NULL DEFAULT 1,
    PRIMARY KEY (a_id, b_id),
    CHECK (a_id < b_id)
  );
  CREATE INDEX links_b ON links (b_id);

  CREATE TABLE tags (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE
  );
  CREATE TABLE thought_tags (
    thought_id TEXT NOT NULL REFERENCES thoughts (id) ON DELETE CASCADE,
    tag_id     TEXT NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
    PRIMARY KEY (thought_id, tag_id)
  );
  CREATE INDEX thought_tags_tag ON thought_tags (tag_id);

  CREATE TABLE graph_layout (
    thought_id TEXT PRIMARY KEY REFERENCES thoughts (id) ON DELETE CASCADE,
    x REAL NOT NULL,
    y REAL NOT NULL
  );

  CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // v2 — more kinds (video, file), file details, to-dos and reminders, embeddings.
  // SQLite cannot change a CHECK constraint, so the thoughts table is rebuilt.
  // migrate.ts turns foreign keys off around migrations so that dropping the old
  // table does not cascade into links, tags and layout.
  `
  DROP TRIGGER thoughts_ai;
  DROP TRIGGER thoughts_ad;
  DROP TRIGGER thoughts_au;

  CREATE TABLE thoughts_new (
    pk          INTEGER PRIMARY KEY AUTOINCREMENT,
    id          TEXT NOT NULL UNIQUE,
    kind        TEXT NOT NULL CHECK (kind IN ('text','voice','link','image','video','file')),
    body        TEXT NOT NULL DEFAULT '',
    title       TEXT,
    url         TEXT,
    source      TEXT,
    media_path  TEXT,
    duration_ms INTEGER,
    file_name   TEXT,
    mime_type   TEXT,
    file_size   INTEGER,
    todo        INTEGER NOT NULL DEFAULT 0,
    remind_at   INTEGER,
    done_at     INTEGER,
    notif_id    TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );
  INSERT INTO thoughts_new (pk, id, kind, body, title, url, source, media_path, duration_ms, created_at, updated_at)
    SELECT pk, id, kind, body, title, url, source, media_path, duration_ms, created_at, updated_at FROM thoughts;
  DROP TABLE thoughts;
  ALTER TABLE thoughts_new RENAME TO thoughts;

  CREATE INDEX thoughts_created ON thoughts (created_at DESC);
  CREATE INDEX thoughts_todo ON thoughts (todo, done_at, remind_at) WHERE todo = 1;

  CREATE TRIGGER thoughts_ai AFTER INSERT ON thoughts BEGIN
    INSERT INTO thoughts_fts (rowid, title, body) VALUES (new.pk, new.title, new.body);
  END;
  CREATE TRIGGER thoughts_ad AFTER DELETE ON thoughts BEGIN
    INSERT INTO thoughts_fts (thoughts_fts, rowid, title, body) VALUES ('delete', old.pk, old.title, old.body);
  END;
  CREATE TRIGGER thoughts_au AFTER UPDATE OF title, body ON thoughts BEGIN
    INSERT INTO thoughts_fts (thoughts_fts, rowid, title, body) VALUES ('delete', old.pk, old.title, old.body);
    INSERT INTO thoughts_fts (rowid, title, body) VALUES (new.pk, new.title, new.body);
  END;
  INSERT INTO thoughts_fts (thoughts_fts) VALUES ('rebuild');

  -- One vector per thought from the on-device language model. Unit length, float32.
  CREATE TABLE embeddings (
    thought_id TEXT PRIMARY KEY REFERENCES thoughts (id) ON DELETE CASCADE,
    model      TEXT NOT NULL,
    vector     BLOB NOT NULL
  );
  `,
];

type Row = Record<string, unknown>;
/** Runs a query against the old file and returns its rows. */
export type LegacyReader = (sql: string) => Promise<Row[]>;

/**
 * Copies everything out of an old database into the new one. Returns how many
 * thoughts came across. Meaning vectors and the search index are rebuilt, not copied.
 */
export async function importLegacy(db: Db, read: LegacyReader): Promise<number> {
  const tables = new Set((await read("SELECT name FROM sqlite_master WHERE type = 'table'")).map((r) => String(r.name)));
  if (!tables.has('thoughts')) return 0;
  const thoughts = await read('SELECT * FROM thoughts');
  const links = tables.has('links') ? await read('SELECT * FROM links') : [];
  const tags = tables.has('tags') ? await read('SELECT * FROM tags') : [];
  const thoughtTags = tables.has('thought_tags') ? await read('SELECT * FROM thought_tags') : [];
  const meta = tables.has('meta') ? await read('SELECT * FROM meta') : [];

  await db.tx(async (t) => {
    for (const row of thoughts) {
      const values = THOUGHT_COLUMNS.map((c) => {
        const v = row[c];
        if (v === undefined || v === null) return c === 'body' ? '' : c === 'todo' || c === 'priority' ? 0 : null;
        return v;
      });
      await t.run(
        `INSERT INTO thoughts (id, ${THOUGHT_COLUMNS.join(', ')}) VALUES (?, ${THOUGHT_COLUMNS.map(() => '?').join(', ')})`,
        [row.id, ...values],
      );
    }
    for (const l of links) await repo.upsertLink(t, String(l.a_id), String(l.b_id), l.kind === 'manual' ? 'manual' : 'auto', Number(l.weight ?? 1));
    for (const g of tags) await t.run('INSERT INTO tags (id, name) VALUES (?, ?)', [g.id, g.name]);
    for (const tt of thoughtTags) {
      await t.run('INSERT INTO thought_tags (id, thought_id, tag_id) VALUES (?, ?, ?)', [`${tt.thought_id}:${tt.tag_id}`, tt.thought_id, tt.tag_id]);
    }
    for (const m of meta) await repo.setMeta(t, String(m.key), String(m.value ?? ''));
  });
  await repo.reindexSearch(db);
  return thoughts.length;
}

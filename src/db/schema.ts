/**
 * Versioned migrations. Each entry runs once, in order, inside a transaction.
 * This file has no React Native imports so the SQL can be checked in Node
 * (see scripts/check-db.mjs).
 *
 * Never edit a migration that has shipped; append a new one.
 */
export const MIGRATIONS: string[] = [
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

/**
 * The shape of the data. No React Native imports, so the Node tests can use it.
 *
 * On the phone these become PowerSync tables (powersync.ts): each has a text `id`
 * and the columns below, and is marked local-only until the day a backend such as
 * Supabase is connected. That is why there are no SQL constraints, foreign keys or
 * auto-increment keys here: PowerSync tables cannot have them, and a row must mean
 * the same thing on a server. The rules live in repo.ts instead.
 *
 * Times are milliseconds since 1970 (a Postgres bigint).
 */
export type ColumnType = 'text' | 'integer' | 'real';

export const TABLES = {
  thoughts: {
    kind: 'text', // text | voice | link | image | video | file
    body: 'text', // plain words: what search and linking read
    body_html: 'text', // the formatted body, when it has formatting
    title: 'text',
    url: 'text',
    source: 'text',
    media_path: 'text',
    duration_ms: 'integer',
    file_name: 'text',
    mime_type: 'text',
    file_size: 'integer',
    todo: 'integer', // 1 when on the to-do list
    remind_at: 'integer',
    repeat: 'text', // daily | weekly | monthly
    priority: 'integer', // 1 when marked important
    done_at: 'integer',
    notif_id: 'text',
    event_id: 'text', // the calendar event this note is about
    event_title: 'text',
    event_at: 'integer',
    created_at: 'integer',
    updated_at: 'integer',
  },
  // Undirected: a_id < b_id always, and id is "a_id:b_id" so a pair exists once.
  links: { a_id: 'text', b_id: 'text', kind: 'text', weight: 'real' },
  tags: { name: 'text' },
  // id is "thought_id:tag_id".
  thought_tags: { thought_id: 'text', tag_id: 'text' },
  // Settings. id is the key.
  meta: { value: 'text' },
} as const satisfies Record<string, Record<string, ColumnType>>;

export type TableName = keyof typeof TABLES;

export const INDEXES: Partial<Record<TableName, Record<string, string[]>>> = {
  thoughts: { created: ['created_at'], todo: ['todo'] },
  links: { a: ['a_id'], b: ['b_id'] },
  thought_tags: { thought: ['thought_id'] },
};

export const THOUGHT_COLUMNS = Object.keys(TABLES.thoughts) as (keyof typeof TABLES.thoughts)[];

/** The same tables as ordinary SQLite tables, for the Node tests. */
export function plainDDL(): string {
  return (Object.keys(TABLES) as TableName[])
    .map((name) => {
      const cols = Object.entries(TABLES[name]).map(([c, t]) => `${c} ${t.toUpperCase()}`);
      return `CREATE TABLE ${name} (id TEXT PRIMARY KEY NOT NULL, ${cols.join(', ')});`;
    })
    .join('\n');
}

/**
 * Tables that are worked out from the thoughts and never leave the phone: meaning
 * vectors (as hex text) and the search index. These are ordinary SQLite tables in
 * the same file, created by repo.prepare().
 */
export const EMBEDDINGS_DDL =
  'CREATE TABLE IF NOT EXISTS embeddings (thought_id TEXT PRIMARY KEY NOT NULL, model TEXT NOT NULL, vector TEXT NOT NULL)';
export const SEARCH_DDL =
  "CREATE VIRTUAL TABLE IF NOT EXISTS thoughts_fts USING fts5(id UNINDEXED, title, body, tokenize='unicode61 remove_diacritics 2')";

/**
 * Bookkeeping for Engram Cloud, used only when the person has turned sync on.
 * `outbox` lists rows changed on this phone and not yet sent (n counts changes,
 * so an edit made while a batch is in flight is not forgotten). `sync_revs` is
 * the server's revision of each thought as this phone last saw it.
 */
export const OUTBOX_DDL =
  'CREATE TABLE IF NOT EXISTS outbox (tbl TEXT NOT NULL, id TEXT NOT NULL, del INTEGER NOT NULL DEFAULT 0, n INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (tbl, id))';
export const REVS_DDL = 'CREATE TABLE IF NOT EXISTS sync_revs (id TEXT PRIMARY KEY NOT NULL, rev INTEGER NOT NULL)';

/** The thought columns that are sent to the cloud. Device file paths and alarm ids stay on the phone. */
export const SYNCED_THOUGHT_COLUMNS = THOUGHT_COLUMNS.filter((c) => c !== 'media_path' && c !== 'notif_id');

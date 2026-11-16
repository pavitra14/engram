/**
 * Opens the database on the phone.
 *
 * It is a PowerSync database: SQLite on the device, shaped so that it can later
 * sync with Postgres (Supabase, for example) by connecting a backend. Today no
 * backend is connected and every table is local-only, so nothing leaves the phone.
 */
import { ANDROID_FILES_PATH, IOS_DOCUMENT_PATH, open } from '@op-engineering/op-sqlite';
import { column, PowerSyncDatabase, Schema, Table } from '@powersync/react-native';
import { randomUUID } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import type { Db } from './db';
import { importLegacy } from './legacy';
import * as repo from './repo';
import { INDEXES, TABLES, type TableName } from './schema';

const FILE = 'engram-v3.sqlite';
/** The file version 0.2 and earlier kept their thoughts in. */
const LEGACY_FILE = 'engram.db';

function schema(): Schema {
  const tables: Record<string, Table> = {};
  for (const name of Object.keys(TABLES) as TableName[]) {
    const cols: Record<string, (typeof column)[keyof typeof column]> = {};
    for (const [c, type] of Object.entries(TABLES[name])) cols[c] = column[type];
    tables[name] = new Table(cols, { localOnly: true, indexes: INDEXES[name] });
  }
  return new Schema(tables);
}

type Runner = {
  execute: (sql: string, params?: unknown[]) => Promise<unknown>;
  getAll: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
  getOptional: <T>(sql: string, params?: unknown[]) => Promise<T | null>;
};

function wrap(r: Runner, tx: Db['tx']): Db {
  return {
    run: async (sql, params = []) => {
      await r.execute(sql, params);
    },
    all: (sql, params = []) => r.getAll(sql, params),
    first: (sql, params = []) => r.getOptional(sql, params),
    tx,
  };
}

/** Carries thoughts over from the old expo-sqlite file, once. */
async function carryOver(db: Db): Promise<void> {
  if ((await repo.getMeta(db, 'legacy_imported')) === '1') return;
  try {
    const old = new File(Paths.document, 'SQLite', LEGACY_FILE);
    if (old.exists && (await repo.countThoughts(db)) === 0) {
      const base = Platform.OS === 'android' ? ANDROID_FILES_PATH : IOS_DOCUMENT_PATH;
      const legacy = open({ name: LEGACY_FILE, location: `${base}/SQLite` });
      try {
        const n = await importLegacy(db, async (sql) => (await legacy.execute(sql)).rows as Record<string, unknown>[]);
        console.log(`engram: carried over ${n} thoughts from the old database`);
      } finally {
        legacy.close();
      }
    }
  } catch (e) {
    // The old file stays where it is, so a later version can try again.
    console.log('engram: could not read the old database', e instanceof Error ? e.message : String(e));
    return;
  }
  await repo.setMeta(db, 'legacy_imported', '1');
}

export async function openDatabase(): Promise<Db> {
  repo.setIdMaker(randomUUID);
  const ps = new PowerSyncDatabase({ schema: schema(), database: { dbFilename: FILE } });
  await ps.init();
  const db: Db = wrap(ps as unknown as Runner, (fn) =>
    ps.writeTransaction(async (t) => {
      const inner: Db = wrap(t as unknown as Runner, (nested) => nested(inner));
      return fn(inner);
    }),
  );
  await repo.prepare(db);
  await carryOver(db);
  return db;
}

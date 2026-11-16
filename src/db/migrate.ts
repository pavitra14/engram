import type { SQLiteDatabase } from 'expo-sqlite';

import { MIGRATIONS } from './schema';

export async function migrate(db: SQLiteDatabase): Promise<void> {
  // Foreign keys stay off while migrating: a table rebuild must not cascade deletes.
  // The pragma has no effect inside a transaction, so it is set out here.
  await db.execAsync(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;`);
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    const next = version + 1;
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      await db.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
  await db.execAsync(`PRAGMA foreign_keys = ON;`);
}

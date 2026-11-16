/**
 * The small database surface the app uses. On the phone it is backed by PowerSync
 * (see powersync.ts); in the Node tests by node:sqlite. Keeping it this narrow is
 * what lets the same repo code run in both.
 */
export interface Db {
  run(sql: string, params?: unknown[]): Promise<void>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  first<T>(sql: string, params?: unknown[]): Promise<T | null>;
  /**
   * Runs `fn` in one write transaction. Inside it use only the `Db` passed in:
   * calling the outer one would wait for the transaction it is part of.
   */
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

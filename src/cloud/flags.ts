/**
 * Feature flags: switches kept on Engram's server for features that are not
 * ready for everyone.
 *
 * Every flag is off unless the server has said otherwise. "Off" is the answer
 * when the flag is missing, when this build has no server address, and when the
 * app has never managed to ask. The last answer the server gave is remembered,
 * so a phone that is offline keeps behaving the way it last did; the next
 * successful check replaces it.
 *
 * The check is one public request with no account and nothing about the person
 * in it.
 */
import { useSyncExternalStore } from 'react';

import type { Db } from '@/db/db';
import * as repo from '@/db/repo';

import { cloudConfigured, select } from './api';

/** Every flag the app knows. Add a name here and a row in the feature_flags table. */
export const FLAGS = ['cloud'] as const;
export type Flag = (typeof FLAGS)[number];

let on = new Set<Flag>();
const listeners = new Set<() => void>();

function set(next: Iterable<string>) {
  const known = new Set<Flag>();
  for (const k of next) if ((FLAGS as readonly string[]).includes(k)) known.add(k as Flag);
  on = known;
  listeners.forEach((l) => l());
}

export function flagOn(flag: Flag): boolean {
  return on.has(flag);
}

export function useFlag(flag: Flag): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => on.has(flag),
  );
}

/** Reads the remembered answer, then asks the server for a fresh one. Never throws. */
export async function loadFlags(db: Db): Promise<void> {
  try {
    const saved = await repo.getMeta(db, 'flags');
    if (saved) set(JSON.parse(saved) as string[]);
  } catch {
    set([]);
  }
  if (!cloudConfigured) {
    set([]);
    return;
  }
  try {
    const rows = await select<{ key: string; enabled: boolean }[]>('feature_flags?select=key,enabled');
    const enabled = rows.filter((r) => r.enabled === true).map((r) => r.key);
    set(enabled);
    await repo.setMeta(db, 'flags', JSON.stringify(enabled));
  } catch {
    // Unreachable: keep the remembered answer, which is "everything off" if there never was one.
  }
}

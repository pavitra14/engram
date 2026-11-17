/**
 * Anonymous usage counts, only if the person said yes (in the tour, the
 * one-time question after updating, or Settings).
 *
 * The phone adds 1 to a tally as things happen; nothing is sent then. On the
 * first open of a new day it sends each finished day as one small message
 * (see usage.logic.ts for its shape) and deletes it first, so a failed send
 * loses that day rather than counting it twice. No id, no time of day, no
 * content: docs/PRIVACY.md, "Usage counts", says exactly what goes.
 *
 * Sending also needs the `metrics` flag (the kill switch) and a release build.
 */
import Constants from 'expo-constants';
import { Appearance } from 'react-native';

import { cloudConfigured, SUPABASE_KEY, SUPABASE_URL } from '@/cloud/api';
import { flagOn } from '@/cloud/flags';
import type { Db } from '@/db/db';
import * as repo from '@/db/repo';

import {
  activeBucket,
  ageBucket,
  buildMessage,
  daysActiveIn,
  localDay,
  type Metric,
  M,
  notesBucket,
  plan,
  rememberDay,
  S,
  type UsageMessage,
} from './usage.logic';

export { M } from './usage.logic';

/** 'yes', 'no', or null when the person has not been asked yet. */
export type UsageAnswer = 'yes' | 'no' | null;

let db: Db | null = null;
let answer: UsageAnswer = null;

/** Called once at start-up. Counts this opening if the person said yes. */
export async function startUsage(d: Db): Promise<void> {
  db = d;
  const v = await repo.getMeta(d, 'usage').catch(() => null);
  answer = v === 'yes' || v === 'no' ? v : null;
  appOpened();
}

export function usageAnswer(): UsageAnswer {
  return answer;
}

export async function readUsageAnswer(d: Db): Promise<UsageAnswer> {
  const v = await repo.getMeta(d, 'usage');
  return v === 'yes' || v === 'no' ? v : null;
}

/** Records the person's choice. "No" deletes everything waiting on the phone. */
export async function setUsage(d: Db, yes: boolean): Promise<void> {
  answer = yes ? 'yes' : 'no';
  await repo.setMeta(d, 'usage', answer);
  if (!yes) {
    await repo.clearUsage(d);
    await repo.setMeta(d, 'usage_days', '[]');
  } else {
    appOpened();
  }
}

/** Adds one to today's tally. Does nothing unless the person said yes. Never throws, never waits. */
export function count(metric: Metric): void {
  if (answer !== 'yes' || !db) return;
  void repo.addUsage(db, localDay(Date.now()), metric).catch(() => {});
}

/** Counts an opening and remembers the date (kept on the phone for the "days active" range). */
export function appOpened(): void {
  if (answer !== 'yes' || !db) return;
  const d = db;
  const today = localDay(Date.now());
  count(M.opened);
  void (async () => {
    const days = JSON.parse((await repo.getMeta(d, 'usage_days')) ?? '[]') as string[];
    await repo.setMeta(d, 'usage_days', JSON.stringify(rememberDay(days, today)));
    if (!(await repo.getMeta(d, 'usage_since'))) await repo.setMeta(d, 'usage_since', String((await repo.firstThoughtAt(d)) ?? Date.now()));
  })().catch(() => {});
}

async function settingsOn(d: Db): Promise<number[]> {
  const on: number[] = [];
  const appearance = await repo.getMeta(d, 'appearance');
  if (appearance === 'black' || ((appearance ?? 'system') === 'system' && Appearance.getColorScheme() === 'dark')) on.push(S.black);
  const home = await repo.getMeta(d, 'home_view');
  if (home === 'split') on.push(S.split);
  if (home === 'map') on.push(S.mapHome);
  if ((await repo.getMeta(d, 'semantic')) === 'on') on.push(S.meaning);
  if ((await repo.getMeta(d, 'translate')) === 'on') on.push(S.translation);
  try {
    if ((JSON.parse((await repo.getMeta(d, 'lock')) ?? '{}') as { on?: boolean }).on) on.push(S.lock);
  } catch {}
  if ((await repo.getMeta(d, 'calendar')) === 'on') on.push(S.calendar);
  try {
    const b = JSON.parse((await repo.getMeta(d, 'briefs')) ?? '{}') as { morning?: unknown; evening?: unknown };
    if (typeof b.morning === 'number' || typeof b.evening === 'number') on.push(S.briefs);
  } catch {}
  // Read lazily: cloud.ts imports reminders.ts, which counts through this file.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cloud = require('@/cloud/cloud') as typeof import('@/cloud/cloud');
  if (cloud.signedIn()) on.push(S.cloud);
  return on;
}

async function messageFor(d: Db, day: string): Promise<UsageMessage> {
  const days = JSON.parse((await repo.getMeta(d, 'usage_days')) ?? '[]') as string[];
  const since = Number(await repo.getMeta(d, 'usage_since')) || Date.now();
  const end = Date.parse(`${day}T23:59:59`);
  const buckets = [activeBucket(Math.max(1, daysActiveIn(days, day))), ageBucket(since, end), notesBucket(await repo.countThoughts(d))];
  return buildMessage(day, Constants.expoConfig?.version ?? '0.0.0', await repo.usageFor(d, day), await settingsOn(d), buckets);
}

/** What the next message would hold if today ended now, for "See what's sent". */
export async function previewUsage(d: Db): Promise<UsageMessage> {
  return messageFor(d, localDay(Date.now()));
}

/** Sends finished days. Runs on opening and on coming back to the app; at most one round a day. */
export async function sendUsage(d: Db): Promise<void> {
  if (answer !== 'yes' || __DEV__ || !cloudConfigured || !flagOn('metrics')) return;
  const today = localDay(Date.now());
  if ((await repo.getMeta(d, 'usage_sent')) === today) return;
  await repo.setMeta(d, 'usage_sent', today);
  const { send, drop } = plan(await repo.usageDays(d), today);
  for (const day of drop) await repo.clearUsage(d, day);
  for (const day of send) {
    const message = await messageFor(d, day);
    // Deleted before sending: a failed send loses the day instead of counting it twice.
    await repo.clearUsage(d, day);
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_usage`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: message }),
      });
    } catch {
      // Offline: the day is gone, which is fine for counts.
    }
  }
}

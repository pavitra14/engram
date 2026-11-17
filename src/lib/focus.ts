/**
 * The focus timer: "Focus for 25 minutes" on a to-do. The phone tells you when
 * the time is up, with Done and Five more minutes on the notification. Each
 * finished session adds its minutes to the to-do.
 */
import * as Notifications from 'expo-notifications';
import { AndroidImportance, SchedulableTriggerInputTypes } from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import type { Db } from '@/db/db';
import * as repo from '@/db/repo';
import type { Thought } from '@/db/types';

import { dataChanged, useDataVersion } from './bus';
import { allowed } from './reminders';
import { titleOf } from './text';

export const FOCUS_MINUTES = 25;
export const FOCUS_DONE = 'focus_done';
export const FOCUS_MORE = 'focus_more';
const CATEGORY = 'focus';
const CHANNEL = 'focus';

export type Session = { id: string; title: string; start: number; until: number; notifId: string | null };

export async function currentFocus(db: Db): Promise<Session | null> {
  try {
    const s = JSON.parse((await repo.getMeta(db, 'focus')) ?? 'null');
    return s && typeof s.id === 'string' && typeof s.until === 'number' ? (s as Session) : null;
  } catch {
    return null;
  }
}

/** Starts a session on a to-do. Any session already running is ended first and counted. */
export async function startFocus(db: Db, thought: Thought, minutes: number = FOCUS_MINUTES): Promise<boolean> {
  await endFocus(db);
  const now = Date.now();
  const until = now + minutes * 60_000;
  let notifId: string | null = null;
  const may = await allowed();
  if (may) {
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Focus timer', importance: AndroidImportance.HIGH });
    await Notifications.setNotificationCategoryAsync(CATEGORY, [
      { identifier: FOCUS_DONE, buttonTitle: 'Done' },
      { identifier: FOCUS_MORE, buttonTitle: 'Five more minutes' },
    ]).catch(() => {});
    notifId = await Notifications.scheduleNotificationAsync({
      content: { title: 'Time is up', body: titleOf(thought), data: { thoughtId: thought.id, focus: true }, categoryIdentifier: CATEGORY },
      trigger: { type: SchedulableTriggerInputTypes.DATE, date: until, channelId: CHANNEL },
    });
  }
  const session: Session = { id: thought.id, title: titleOf(thought), start: now, until, notifId };
  await repo.setMeta(db, 'focus', JSON.stringify(session));
  dataChanged();
  return may;
}

/** Ends the running session, early or on time, and adds the minutes spent to its to-do. Returns those minutes. */
export async function endFocus(db: Db, now: number = Date.now()): Promise<number> {
  const s = await currentFocus(db);
  if (!s) return 0;
  if (s.notifId && now < s.until) await Notifications.cancelScheduledNotificationAsync(s.notifId).catch(() => {});
  const minutes = Math.round((Math.min(now, s.until) - s.start) / 60_000);
  if (minutes > 0) await repo.addFocus(db, s.id, minutes);
  await repo.setMeta(db, 'focus', 'null');
  dataChanged();
  return minutes;
}

/** If a session ran out while nobody was looking, count it. Run when the app opens. */
export async function settleFocus(db: Db): Promise<void> {
  const s = await currentFocus(db);
  if (s && Date.now() >= s.until) await endFocus(db);
}

/** The running session and the whole minutes left on it, refreshed as time passes. */
export function useFocus(db: Db): { session: Session; minutesLeft: number } | null {
  const version = useDataVersion();
  const [session, setSession] = useState<Session | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let live = true;
    void currentFocus(db).then((s) => {
      if (live) setSession(s);
    });
    return () => {
      live = false;
    };
  }, [db, version]);
  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [session]);
  if (!session || now >= session.until + 60_000) return null;
  return { session, minutesLeft: Math.max(0, Math.ceil((session.until - now) / 60_000)) };
}

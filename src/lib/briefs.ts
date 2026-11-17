/**
 * Notifications Engram posts for itself, all off until switched on in Settings:
 * a morning brief, an evening wrap-up, and a quick-note notification that stays
 * in the shade. Android cannot work out a notification's words at the moment it
 * fires, so the brief is written and scheduled again each time the app is open
 * or something changes; it is as fresh as the last time Engram was used.
 */
import * as Notifications from 'expo-notifications';
import { AndroidImportance, SchedulableTriggerInputTypes } from 'expo-notifications';
import { Platform } from 'react-native';

import type { Db } from '@/db/db';
import * as repo from '@/db/repo';

import { questionFor } from './habits';
import { titleOf } from './text';

export type Briefs = { morning: number | null; evening: number | null; sticky: boolean };
export const MORNINGS = [6, 7, 8, 9];
export const EVENINGS = [19, 20, 21, 22];
export const SPEAK = 'speak';
const QUIET = 'quiet';
const STICKY_ID = 'engram-quick-note';
const IDS = { morning: 'engram-morning', evening: 'engram-evening' };

export async function briefSettings(db: Db): Promise<Briefs> {
  try {
    const v = JSON.parse((await repo.getMeta(db, 'briefs')) ?? 'null');
    if (v && typeof v === 'object') return { morning: typeof v.morning === 'number' ? v.morning : null, evening: typeof v.evening === 'number' ? v.evening : null, sticky: v.sticky === true };
  } catch {
    // Fall through to everything off.
  }
  return { morning: null, evening: null, sticky: false };
}

export async function saveBriefSettings(db: Db, b: Briefs): Promise<void> {
  await repo.setMeta(db, 'briefs', JSON.stringify(b));
  await refreshBriefs(db);
}

const nextAt = (hour: number, now: number) => {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() <= now + 60_000) d.setDate(d.getDate() + 1);
  return d.getTime();
};
const startOfDay = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** The morning brief's words for the day that starts at `day`. */
export function morningWords(todos: { title: string | null; body: string; kind: string; url: string | null; remind_at: number | null }[], day: number, question: string | null): string {
  const end = day + 86_400_000;
  const due = todos.filter((t) => t.remind_at != null && t.remind_at < end);
  const parts: string[] = [];
  if (due.length > 0) {
    const names = due.slice(0, 3).map((t) => titleOf(t).slice(0, 40));
    parts.push(`${due.length} to do today: ${names.join(', ')}${due.length > 3 ? ' and more' : ''}.`);
  } else if (todos.length > 0) {
    parts.push(`Nothing is due today. ${todos.length} open on your list.`);
  } else {
    parts.push('Nothing on your list today.');
  }
  if (question) parts.push(question);
  return parts.join(' ');
}

async function may(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync().catch(() => null))?.granted ?? false;
}

/** Makes the scheduled brief and the quick-note notification match the settings and today's data. Never asks for permission. */
export async function refreshBriefs(db: Db): Promise<void> {
  try {
    const b = await briefSettings(db);
    await Notifications.cancelScheduledNotificationAsync(IDS.morning).catch(() => {});
    await Notifications.cancelScheduledNotificationAsync(IDS.evening).catch(() => {});
    const ok = await may();
    if (!ok || (!b.sticky && b.morning == null && b.evening == null)) {
      if (!b.sticky) await Notifications.dismissNotificationAsync(STICKY_ID).catch(() => {});
      return;
    }
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(QUIET, { name: 'Briefs and quick note', importance: AndroidImportance.LOW });
    const now = Date.now();
    if (b.morning != null) {
      const at = nextAt(b.morning, now);
      const todos = await repo.listOpenTodos(db);
      const ask = (await repo.getMeta(db, 'daily_question')) === 'off' ? null : questionFor(at);
      await Notifications.scheduleNotificationAsync({
        identifier: IDS.morning,
        content: { title: 'Your day', body: morningWords(todos, startOfDay(at), ask), data: { open: '/todo' } },
        trigger: { type: SchedulableTriggerInputTypes.DATE, date: at, channelId: QUIET },
      });
    }
    if (b.evening != null) {
      const at = nextAt(b.evening, now);
      const from = startOfDay(at);
      const saved = (await repo.listThoughts(db, { limit: 200 })).filter((t) => t.created_at >= from).length;
      const body = saved > 0 ? `You saved ${saved} ${saved === 1 ? 'thing' : 'things'} today. Any to-dos in them?` : 'Anything from today worth writing down?';
      await Notifications.scheduleNotificationAsync({
        identifier: IDS.evening,
        content: { title: 'Before the day ends', body, data: { open: saved > 0 ? '/' : '/compose' } },
        trigger: { type: SchedulableTriggerInputTypes.DATE, date: at, channelId: QUIET },
      });
    }
    if (b.sticky) {
      await Notifications.setNotificationCategoryAsync('quick', [{ identifier: SPEAK, buttonTitle: 'Speak' }]).catch(() => {});
      const shown = await Notifications.getPresentedNotificationsAsync().catch(() => []);
      if (!shown.some((n) => n.request.identifier === STICKY_ID)) {
        await Notifications.scheduleNotificationAsync({
          identifier: STICKY_ID,
          content: { title: 'Write a thought', body: 'Tap to write, or use Speak.', sticky: true, autoDismiss: false, data: { open: '/compose' }, categoryIdentifier: 'quick' },
          trigger: { channelId: QUIET },
        });
      }
    } else {
      await Notifications.dismissNotificationAsync(STICKY_ID).catch(() => {});
    }
  } catch (e) {
    console.log('engram: briefs not refreshed', e instanceof Error ? e.message : String(e));
  }
}

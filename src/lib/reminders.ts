import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, SchedulableTriggerInputTypes } from 'expo-notifications';
import type { Db } from '@/db/db';
import { Platform } from 'react-native';

import * as repo from '@/db/repo';
import type { Repeat, Thought } from '@/db/types';

import { dataChanged } from './bus';
import { nextRepeat, titleOf } from './text';
import { count, M } from '@/lib/usage';

const CHANNEL = 'reminders';
/** Reminders carry two buttons: Done, and In an hour. */
const CATEGORY = 'todo';
export const ACTION_DONE = 'done';
export const ACTION_LATER = 'later';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Sets up the reminder channel and buttons, and asks for permission to notify if that is still possible. */
export async function allowed(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Reminders',
      importance: AndroidImportance.HIGH,
    });
  }
  await Notifications.setNotificationCategoryAsync(CATEGORY, [
    { identifier: ACTION_DONE, buttonTitle: 'Done' },
    { identifier: ACTION_LATER, buttonTitle: 'In an hour' },
  ]).catch(() => {});
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Cancels the phone alarm for a thought's reminder, if it has one. */
export function cancelReminder(thought: { notif_id: string | null }): Promise<void> {
  return cancel(thought.notif_id);
}

async function cancel(notifId: string | null): Promise<void> {
  if (!notifId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notifId);
  } catch {
    // Already delivered or gone.
  }
}

/**
 * Puts a thought on the to-do list. With a time, the phone reminds you then;
 * with a repeat, it comes back each time you finish it.
 * Returns false when a time was asked for but notifications are not allowed:
 * the to-do and its time are still saved, there is just no alert.
 */
export async function addTodo(db: Db, thought: Thought, remindAt: number | null, repeat: Repeat | null = thought.repeat): Promise<boolean> {
  await cancel(thought.notif_id);
  let notifId: string | null = null;
  let alerting = true;
  if (remindAt && remindAt > Date.now()) {
    if (await allowed()) {
      notifId = await Notifications.scheduleNotificationAsync({
        content: { title: titleOf(thought), body: 'A reminder from Engram', data: { thoughtId: thought.id }, categoryIdentifier: CATEGORY },
        trigger: { type: SchedulableTriggerInputTypes.DATE, date: remindAt, channelId: CHANNEL },
      });
    } else {
      alerting = false;
    }
  }
  await repo.setTodo(db, thought.id, { remindAt, notifId, repeat });
  dataChanged();
  return alerting;
}

export async function removeTodo(db: Db, thought: Thought): Promise<void> {
  await cancel(thought.notif_id);
  await repo.clearTodo(db, thought.id);
  dataChanged();
}

/**
 * Marks a to-do done or not done. A repeating to-do is not finished for good:
 * it moves to its next time and stays on the list. Returns that next time, if so.
 */
export async function setDone(db: Db, thought: Thought, done: boolean): Promise<number | null> {
  if (done) count(M.todoDone);
  if (done && thought.repeat && thought.remind_at) {
    const next = nextRepeat(thought.remind_at, thought.repeat);
    await addTodo(db, thought, next, thought.repeat);
    return next;
  }
  if (done) await cancel(thought.notif_id);
  await repo.setDone(db, thought.id, done);
  dataChanged();
  return null;
}

/** Moves a reminder to later, by a number of milliseconds from now. */
export function snooze(db: Db, thought: Thought, ms: number): Promise<boolean> {
  return addTodo(db, thought, Date.now() + ms, thought.repeat);
}

export async function setImportant(db: Db, thought: Thought, important: boolean): Promise<void> {
  await repo.setPriority(db, thought.id, important);
  dataChanged();
}

const at = (base: Date, days: number, hour: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
};

/** Quick choices for when to be reminded, relative to now. */
export function reminderPresets(now: number = Date.now()): { label: string; at: number }[] {
  const d = new Date(now);
  const out = [{ label: 'In an hour', at: now + 3_600_000 }];
  if (d.getHours() < 17) out.push({ label: 'This evening, 6 pm', at: at(d, 0, 18) });
  out.push({ label: 'Tomorrow, 9 am', at: at(d, 1, 9) });
  out.push({ label: 'In a week, 9 am', at: at(d, 7, 9) });
  return out;
}

/** Android's own date picker, then its time picker. Resolves to null if either is dismissed. */
export function pickDateTime(initial: number = Date.now() + 3_600_000): Promise<number | null> {
  return new Promise((resolve) => {
    const start = new Date(initial);
    DateTimePickerAndroid.open({
      value: start,
      mode: 'date',
      minimumDate: new Date(),
      onChange: (event, date) => {
        if (event.type !== 'set' || !date) {
          resolve(null);
          return;
        }
        DateTimePickerAndroid.open({
          value: start,
          mode: 'time',
          onChange: (e2, time) => {
            if (e2.type !== 'set' || !time) {
              resolve(null);
              return;
            }
            const chosen = new Date(date);
            chosen.setHours(time.getHours(), time.getMinutes(), 0, 0);
            resolve(chosen.getTime());
          },
        });
      },
    });
  });
}

/** Which button on a reminder was pressed: "done", "later", or null for a plain tap. */
export function actionFrom(response: Notifications.NotificationResponse | null | undefined): string | null {
  const a = response?.actionIdentifier;
  return a === ACTION_DONE || a === ACTION_LATER ? a : null;
}

/** The thought a tapped reminder points at, if the app was opened that way. */
export function thoughtIdFrom(response: Notifications.NotificationResponse | null | undefined): string | null {
  const id = response?.notification.request.content.data?.thoughtId;
  return typeof id === 'string' ? id : null;
}

/**
 * After thoughts arrive from another device: make this phone's alarms match them.
 * A to-do with a future time gets an alarm here; anything else loses the one it had.
 * Never asks for notification permission by itself; without it, nothing is scheduled.
 */
export async function reconcileReminders(db: Db, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const may = (await Notifications.getPermissionsAsync().catch(() => null))?.granted ?? false;
  for (const id of ids.slice(0, 500)) {
    const t = await repo.getThought(db, id);
    if (!t) continue;
    await cancel(t.notif_id);
    let notifId: string | null = null;
    if (may && t.todo === 1 && !t.done_at && !t.trashed_at && t.remind_at && t.remind_at > Date.now()) {
      try {
        notifId = await Notifications.scheduleNotificationAsync({
          content: { title: titleOf(t), body: 'A reminder from Engram', data: { thoughtId: t.id }, categoryIdentifier: CATEGORY },
          trigger: { type: SchedulableTriggerInputTypes.DATE, date: t.remind_at, channelId: CHANNEL },
        });
      } catch {
        notifId = null;
      }
    }
    if (notifId !== t.notif_id) await repo.setNotifId(db, id, notifId);
  }
}

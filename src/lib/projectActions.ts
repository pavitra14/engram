/** Changing what the person has said about a group: its name, goal and date, and merging two groups. */
import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';

import type { Db } from '@/db/db';
import * as repo from '@/db/repo';
import type { Project } from '@/db/types';

import type { Brain } from './brain';
import { dataChanged } from './bus';
import type { Group } from './groups';
import { allowed } from './reminders';

/**
 * Saves a change to a group's name, goal or date. The stored members are brought
 * up to date at the same time, so the name keeps following the group as it grows.
 * With a date, the phone reminds you at nine the morning before.
 */
export async function updateProject(db: Db, group: Group, change: Partial<Pick<Project, 'name' | 'goal' | 'due_at'>>): Promise<void> {
  const old = group.project;
  const next = { name: old?.name ?? null, goal: old?.goal ?? null, due_at: old?.due_at ?? null, ...change };
  if (old?.notif_id) await Notifications.cancelScheduledNotificationAsync(old.notif_id).catch(() => {});
  // Nothing left to remember: forget the record altogether.
  if (!next.name?.trim() && !next.goal?.trim() && !next.due_at) {
    if (old) await repo.deleteProject(db, old.id);
    dataChanged();
    return;
  }
  let notifId: string | null = null;
  if (next.due_at) {
    const at = new Date(next.due_at);
    at.setDate(at.getDate() - 1);
    at.setHours(9, 0, 0, 0);
    if (at.getTime() > Date.now() && (await allowed())) {
      notifId = await Notifications.scheduleNotificationAsync({
        content: { title: `${next.name?.trim() || group.autoName || group.name} is due tomorrow`, body: next.goal?.trim() || 'A date you set in Engram', data: { open: `/group/${group.id}` } },
        trigger: { type: SchedulableTriggerInputTypes.DATE, date: at.getTime(), channelId: 'reminders' },
      }).catch(() => null);
    }
  }
  await repo.saveProject(db, { id: old?.id, name: next.name?.trim() || null, goal: next.goal?.trim() || null, due_at: next.due_at, members: group.members, notif_id: notifId });
  dataChanged();
}

/**
 * Joins two groups by linking their best-connected thoughts by hand. Groups
 * follow links, so this is how two become one; the links can be removed like any other.
 */
export async function mergeGroups(db: Db, brain: Brain, from: Group, into: Group): Promise<void> {
  const top = (g: Group) => [...g.members].sort((a, b) => (brain.degree.get(b) ?? 0) - (brain.degree.get(a) ?? 0)).slice(0, 3);
  const a = top(from);
  const b = top(into);
  for (let i = 0; i < Math.max(a.length, b.length); i++) await repo.upsertLink(db, a[i % a.length], b[i % b.length], 'manual', 1);
  // The merged group keeps the name of the one it was merged into, if that had one of its own.
  if (into.project) await repo.saveProject(db, { ...into.project, members: [...into.members, ...from.members] });
  if (from.project?.notif_id) await Notifications.cancelScheduledNotificationAsync(from.project.notif_id).catch(() => {});
  if (from.project) await repo.deleteProject(db, from.project.id);
  dataChanged();
}

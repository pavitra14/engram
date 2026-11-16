import * as Calendar from 'expo-calendar/legacy';

import type { Thought } from '@/db/types';

import { titleOf } from './text';

export type DayEvent = { id: string; title: string; start: number; end: number; allDay: boolean };

/**
 * Opens the phone's own "new event" screen, filled in from a thought. The
 * person confirms it there, so Engram needs no calendar permission for this.
 */
export async function addToCalendar(thought: Thought): Promise<void> {
  const start = thought.remind_at && thought.remind_at > Date.now() ? thought.remind_at : Date.now() + 3_600_000;
  const first = new Date(start);
  if (!thought.remind_at) first.setMinutes(0, 0, 0);
  await Calendar.createEventInCalendarAsync({
    title: titleOf(thought),
    notes: [thought.body.trim(), thought.url].filter(Boolean).join('\n\n'),
    startDate: first,
    endDate: new Date(first.getTime() + 30 * 60_000),
  });
}

export async function calendarAllowed(): Promise<boolean> {
  try {
    return (await Calendar.getCalendarPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function askForCalendar(): Promise<boolean> {
  return (await Calendar.requestCalendarPermissionsAsync()).granted;
}

/** The rest of today's events from every calendar on the phone, soonest first. */
export async function eventsToday(now: number = Date.now()): Promise<DayEvent[]> {
  if (!(await calendarAllowed())) return [];
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  if (calendars.length === 0) return [];
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const events = await Calendar.getEventsAsync(
    calendars.map((c) => c.id),
    new Date(now),
    end,
  );
  return events
    .map((e) => ({
      id: e.id,
      title: e.title || 'Untitled event',
      start: new Date(e.startDate).getTime(),
      end: new Date(e.endDate).getTime(),
      allDay: !!e.allDay,
    }))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start);
}

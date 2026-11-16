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

/** Events from every calendar on the phone between two times, all-day ones first within a day, then soonest first. */
export async function eventsBetween(from: number, to: number): Promise<DayEvent[]> {
  if (!(await calendarAllowed())) return [];
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  if (calendars.length === 0) return [];
  const events = await Calendar.getEventsAsync(
    calendars.map((c) => c.id),
    new Date(from),
    new Date(to),
  );
  return events
    .map((e) => ({
      id: e.id,
      title: e.title || 'Untitled event',
      start: new Date(e.startDate).getTime(),
      end: new Date(e.endDate).getTime(),
      allDay: !!e.allDay,
    }))
    .sort((a, b) => a.start - b.start);
}

/** The rest of today's events. */
export async function eventsToday(now: number = Date.now()): Promise<DayEvent[]> {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const rows = await eventsBetween(now, end.getTime());
  return rows.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start);
}

/** Events from tomorrow through the next seven days. */
export async function eventsThisWeek(now: number = Date.now()): Promise<DayEvent[]> {
  const from = new Date(now);
  from.setHours(24, 0, 0, 0);
  return eventsBetween(from.getTime(), from.getTime() + 7 * 86_400_000);
}

/** The route that starts a note about an event, remembering which event it was. */
export function noteForEvent(e: DayEvent) {
  return { pathname: '/compose' as const, params: { title: e.title, event_id: e.id, event_at: String(e.start) } };
}

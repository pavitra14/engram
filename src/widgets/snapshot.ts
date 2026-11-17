/**
 * What the widgets show. Android can redraw a widget while the app is closed,
 * so the few facts they need are kept in a small file the widget code can read
 * without opening the database.
 */
import { File, Paths } from 'expo-file-system';
import { createElement } from 'react';
import { Appearance, Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';

import type { Db } from '@/db/db';
import * as repo from '@/db/repo';
import { dueLabel, titleOf, when } from '@/lib/text';

import { MemoryWidget, noteForNow, QuickThoughtWidget, TodoWidget, type WidgetData } from './widgets';

const file = () => new File(Paths.document, 'widgets.json');

export function readWidgetData(): WidgetData {
  try {
    const f = file();
    if (f.exists) return JSON.parse(f.textSync()) as WidgetData;
  } catch {
    // Fall through to an empty widget.
  }
  return { dark: false, todos: [], open: 0 };
}

/** Writes the latest to-dos for the widgets and asks Android to redraw them. */
export async function refreshWidgets(db: Db): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const todos = await repo.listOpenTodos(db);
    const setting = await repo.getMeta(db, 'appearance');
    const dark = setting === 'black' || (setting !== 'light' && Appearance.getColorScheme() === 'dark');
    const now = Date.now();
    // A dozen older notes, spread through the collection, for the "From your notes" widget to turn over.
    const old = (await repo.listThoughts(db, { limit: 2000 })).filter((t) => now - t.created_at > 7 * 86_400_000 && !t.todo);
    const stride = Math.max(1, Math.floor(old.length / 12));
    const older = old.filter((_, i) => i % stride === 0).slice(0, 12).map((t) => ({ id: t.id, title: titleOf(t).slice(0, 140), when: when(t.created_at, now) }));
    const data: WidgetData = {
      dark,
      older,
      open: todos.length,
      todos: todos.slice(0, 4).map((t) => ({
        id: t.id,
        title: titleOf(t),
        due: t.remind_at ? dueLabel(t.remind_at) : null,
        overdue: !!t.remind_at && t.remind_at < now,
      })),
    };
    const f = file();
    if (!f.exists) f.create();
    f.write(JSON.stringify(data));
    await requestWidgetUpdate({ widgetName: 'Todo', renderWidget: () => createElement(TodoWidget, data), widgetNotFound: () => {} });
    await requestWidgetUpdate({ widgetName: 'Memory', renderWidget: () => createElement(MemoryWidget, { dark, note: noteForNow(older, now) }), widgetNotFound: () => {} });
    await requestWidgetUpdate({ widgetName: 'QuickThought', renderWidget: () => createElement(QuickThoughtWidget, { dark }), widgetNotFound: () => {} });
  } catch (e) {
    // Widgets are a convenience; the app carries on without them.
    console.log('engram: widgets not refreshed', e instanceof Error ? e.message : String(e));
  }
}

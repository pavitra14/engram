import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useDb } from '@/db/provider';
import type { Thought } from '@/db/types';
import { type Assistant, chatWith, installedAssistants, planPrompt } from '@/lib/assistants';
import { park, setPinned, setRemember } from '@/lib/actions';
import { addToCalendar } from '@/lib/calendar';
import { startFocus } from '@/lib/focus';
import { removeThought } from '@/lib/capture';
import { addTodo, reminderPresets, removeTodo, setDone, setImportant } from '@/lib/reminders';
import { titleOf } from '@/lib/text';

import { ActionSheet, type SheetOption } from './ActionSheet';

const Ctx = createContext<(t: Thought) => void>(() => {});

/** Opens the menu for a thought. Lists call this when a row is held down. */
export function useThoughtMenu(): (t: Thought) => void {
  return useContext(Ctx);
}

/**
 * The menu that appears when a thought is held down in any list: the same
 * actions as the three-dot menu on its own screen, without opening it first.
 */
export function ThoughtMenuProvider({ children }: { children: ReactNode }) {
  const db = useDb();
  const [thought, setThought] = useState<Thought | null>(null);
  const [visible, setVisible] = useState(false);
  const [assistants, setAssistants] = useState<Assistant[]>([]);

  useEffect(() => {
    void installedAssistants().then(setAssistants);
  }, []);

  const open = useCallback((t: Thought) => {
    setThought(t);
    setVisible(true);
  }, []);

  const options = useMemo<SheetOption[]>(() => {
    const t = thought;
    if (!t) return [];
    const tomorrow = reminderPresets().find((p) => /tomorrow/i.test(p.label));
    const todo: SheetOption[] = !t.todo
      ? [
          { label: 'Add to my to-do list', icon: 'check-square', onPress: () => void addTodo(db, t, null) },
          ...(tomorrow ? [{ label: `Remind me ${tomorrow.label.charAt(0).toLowerCase()}${tomorrow.label.slice(1)}`, icon: 'bell' as const, onPress: () => void addTodo(db, t, tomorrow.at) }] : []),
        ]
      : [
          t.done_at
            ? { label: 'Mark as not done', icon: 'rotate-ccw', onPress: () => void setDone(db, t, false) }
            : { label: 'Mark as done', icon: 'check', onPress: () => void setDone(db, t, true) },
          { label: t.priority ? 'Not important after all' : 'Mark as important', icon: 'star', onPress: () => void setImportant(db, t, !t.priority) },
          ...(t.done_at ? [] : [{ label: 'Focus on this for 25 minutes', icon: 'clock' as const, onPress: () => void startFocus(db, t) }]),
          ...(t.done_at
            ? []
            : t.list
              ? [{ label: 'Back to my to-do list', icon: 'corner-up-left' as const, onPress: () => void park(db, t, null) }]
              : [
                  { label: 'Waiting on someone', icon: 'user' as const, onPress: () => void park(db, t, 'waiting') },
                  { label: 'Someday, not now', icon: 'moon' as const, onPress: () => void park(db, t, 'someday') },
                ]),
          { label: 'Remove from to-do', icon: 'x', onPress: () => void removeTodo(db, t) },
        ];
    return [
      { label: 'Open', icon: 'arrow-up-right', onPress: () => router.push({ pathname: '/thought/[id]', params: { id: t.id } }) },
      ...todo,
      { label: t.pinned ? 'Unpin' : 'Pin to the top of Today', icon: 'bookmark', onPress: () => void setPinned(db, t, !t.pinned) },
      t.recall_at
        ? { label: 'Stop bringing this back', icon: 'rotate-cw', onPress: () => void setRemember(db, t, false) }
        : { label: 'Remember this', icon: 'rotate-cw', onPress: () => void setRemember(db, t, true) },
      { label: 'Add to calendar', icon: 'calendar', onPress: () => void addToCalendar(t).catch(() => {}) },
      ...assistants.map((a) => ({
        label: `Think this through with ${a.name}`,
        icon: 'message-circle' as const,
        onPress: () => void chatWith(a, planPrompt(null, [t])).catch(() => {}),
      })),
      {
        label: 'Copy text',
        icon: 'copy',
        onPress: () => void Clipboard.setStringAsync([t.title, t.body].filter(Boolean).join('\n\n') || t.url || t.file_name || ''),
      },
      // No confirmation: it goes to the trash, and the message that follows offers Undo.
      { label: 'Delete', icon: 'trash-2', danger: true, onPress: () => void removeThought(db, t) },
    ];
  }, [db, thought, assistants]);

  return (
    <Ctx.Provider value={open}>
      {children}
      <ActionSheet visible={visible} title={thought ? titleOf(thought).slice(0, 60) : undefined} options={options} onClose={() => setVisible(false)} />
    </Ctx.Provider>
  );
}

import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';

import { useDb } from '@/db/provider';
import type { Thought } from '@/db/types';
import { type Assistant, chatWith, installedAssistants, planPrompt } from '@/lib/assistants';
import { addToCalendar } from '@/lib/calendar';
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
          { label: 'Remove from to-do', icon: 'x', onPress: () => void removeTodo(db, t) },
        ];
    return [
      { label: 'Open', icon: 'arrow-up-right', onPress: () => router.push({ pathname: '/thought/[id]', params: { id: t.id } }) },
      ...todo,
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
      {
        label: 'Delete',
        icon: 'trash-2',
        danger: true,
        onPress: () =>
          Alert.alert('Delete this thought?', 'It is removed along with its links. This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => void removeThought(db, t) },
          ]),
      },
    ];
  }, [db, thought, assistants]);

  return (
    <Ctx.Provider value={open}>
      {children}
      <ActionSheet visible={visible} title={thought ? titleOf(thought).slice(0, 60) : undefined} options={options} onClose={() => setVisible(false)} />
    </Ctx.Provider>
  );
}

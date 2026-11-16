import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TodoRow } from '@/components/TodoRow';
import { Header, RoundButton } from '@/components/ui';
import { useDb } from '@/db/provider';
import * as repo from '@/db/repo';
import type { Thought } from '@/db/types';
import { useDataVersion } from '@/lib/bus';
import { type DayEvent, eventsThisWeek, noteForEvent } from '@/lib/calendar';
import { captureText } from '@/lib/capture';
import { addTodo } from '@/lib/reminders';
import { type DueBucket, DUE_ORDER, dueBucket, when } from '@/lib/text';
import { font, type, useTheme } from '@/theme';

/** The to-do list: add one in a line, see what is overdue and what is coming, and tick things off. */
export default function TodoScreen() {
  const db = useDb();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const version = useDataVersion();
  const [open, setOpen] = useState<Thought[] | null>(null);
  const [done, setDone] = useState<Thought[]>([]);
  const [events, setEvents] = useState<DayEvent[]>([]);
  const [draft, setDraft] = useState('');
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    Promise.all([repo.listOpenTodos(db), repo.listDoneTodos(db, 50)]).then(([o, d]) => {
      if (!live) return;
      setOpen(o);
      setDone(d);
    });
    return () => {
      live = false;
    };
  }, [db, version]);

  // The week ahead from the phone's calendar, if the person switched that on in Settings.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      (async () => {
        const on = (await repo.getMeta(db, 'calendar')) === 'on';
        const rows = on ? await eventsThisWeek().catch(() => []) : [];
        if (live) setEvents(rows);
      })();
      return () => {
        live = false;
      };
    }, [db]),
  );

  const sections = useMemo(() => {
    const by = new Map<DueBucket, Thought[]>();
    for (const t of open ?? []) {
      const b = dueBucket(t.remind_at, now);
      by.set(b, [...(by.get(b) ?? []), t]);
    }
    // Important ones lead each part of the list.
    return DUE_ORDER.filter((b) => by.has(b)).map((b) => ({ title: b, rows: by.get(b)!.sort((x, y) => y.priority - x.priority) }));
  }, [open, now]);

  const add = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    const thought = await captureText(db, text);
    await addTodo(db, thought, null);
  };

  const n = open?.length ?? 0;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 48 }}>
        <Header title="To do" back="Today" sub={open === null ? undefined : n === 0 ? 'Nothing open' : `${n} open`} />

        <View style={styles.addRow}>
          <View style={[styles.field, { backgroundColor: c.surface, borderColor: c.line }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={() => void add()}
              placeholder="Add a to-do"
              placeholderTextColor={c.faint}
              accessibilityLabel="New to-do"
              returnKeyType="done"
              submitBehavior="submit"
              style={[styles.input, { color: c.ink }]}
              selectionColor={c.accent}
            />
          </View>
          <RoundButton icon="plus" label="Add this to-do" tone="solid" disabled={!draft.trim()} onPress={() => void add()} />
        </View>

        {sections.map((s) => (
          <View key={s.title} style={{ marginTop: 22 }}>
            <Text style={[type.labelStrong, styles.heading, { color: s.title === 'Overdue' ? c.danger : c.ink }]}>
              {s.title}, {s.rows.length}
            </Text>
            {s.rows.map((t, i) => (
              <TodoRow key={t.id} thought={t} divider={i < s.rows.length - 1} />
            ))}
          </View>
        ))}

        {open !== null && n === 0 ? (
          <Text style={[type.body, styles.note, { color: c.soft }]}>
            Type one above, or open any thought and tap To do. Add a time and your phone reminds you.
          </Text>
        ) : null}

        {events.length > 0 ? (
          <View style={{ marginTop: 28 }}>
            <Text style={[type.labelStrong, styles.heading, { color: c.ink }]}>Coming up on your calendar</Text>
            {events.slice(0, 8).map((e) => (
              <Pressable
                key={e.id + e.start}
                accessibilityRole="button"
                accessibilityHint="Starts a note about this event"
                onPress={() => router.push(noteForEvent(e))}
                style={({ pressed }) => [styles.event, { opacity: pressed ? 0.6 : 1 }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.label, { color: c.ink }]} numberOfLines={1}>
                    {e.title}
                  </Text>
                  <Text style={[type.meta, { color: c.soft }]}>{when(e.start)}</Text>
                </View>
                <Feather name="edit-3" size={16} color={c.accent} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {done.length > 0 ? (
          <View style={{ marginTop: 28 }}>
            <Text style={[type.labelStrong, styles.heading, { color: c.ink }]}>Done</Text>
            {done.map((t, i) => (
              <TodoRow key={t.id} thought={t} divider={i < done.length - 1} />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginTop: 18 },
  field: { flex: 1, height: 52, borderRadius: 26, borderWidth: 1, justifyContent: 'center', paddingHorizontal: 20 },
  input: { fontFamily: font.regular, fontSize: 16, padding: 0 },
  note: { paddingHorizontal: 24, marginTop: 22 },
  heading: { paddingHorizontal: 24, paddingBottom: 4 },
  event: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 24 },
});

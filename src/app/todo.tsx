import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TodoRow } from '@/components/TodoRow';
import { Header, RoundButton } from '@/components/ui';
import { useDb } from '@/db/provider';
import * as repo from '@/db/repo';
import type { Thought } from '@/db/types';
import { useBrain } from '@/lib/brain';
import { dataChanged, useDataVersion } from '@/lib/bus';
import { checkItems, toggleCheck } from '@/lib/checks';
import { endFocus, useFocus } from '@/lib/focus';
import { type Habit, habitDoneToday, habitStreak, toggleHabit } from '@/lib/recall';
import { type DayEvent, eventsThisWeek, noteForEvent } from '@/lib/calendar';
import { captureText } from '@/lib/capture';
import { addTodo } from '@/lib/reminders';
import { type DueBucket, DUE_ORDER, dueBucket, titleOf, when } from '@/lib/text';
import { font, type, useTheme } from '@/theme';
import { count, M } from '@/lib/usage';

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
  const brain = useBrain(db);
  const focus = useFocus(db);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitDraft, setHabitDraft] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([repo.listOpenTodos(db), repo.listDoneTodos(db, 50), repo.getMeta(db, 'habits')]).then(([o, d, h]) => {
      if (!live) return;
      setOpen(o);
      setDone(d);
      try {
        const list = JSON.parse(h ?? '[]');
        setHabits(Array.isArray(list) ? list : []);
      } catch {
        setHabits([]);
      }
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
      if (t.list) continue;
      const b = dueBucket(t.remind_at, now);
      by.set(b, [...(by.get(b) ?? []), t]);
    }
    // Important ones lead each part of the list.
    return DUE_ORDER.filter((b) => by.has(b)).map((b) => ({ title: b, rows: by.get(b)!.sort((x, y) => y.priority - x.priority) }));
  }, [open, now]);

  const waiting = (open ?? []).filter((t) => t.list === 'waiting');
  const someday = (open ?? []).filter((t) => t.list === 'someday');

  // Unticked check boxes from every note, under the note they are in.
  const boxes = useMemo(() => {
    const out: { id: string; title: string; html: string; items: { index: number; text: string }[] }[] = [];
    for (const t of brain?.thoughts ?? []) {
      if (!t.body_html || !t.body_html.includes('checkbox')) continue;
      const items = checkItems(t.body_html).filter((i) => !i.done);
      if (items.length) out.push({ id: t.id, title: titleOf(t), html: t.body_html, items });
    }
    return out;
  }, [brain]);
  const boxCount = boxes.reduce((n, b) => n + b.items.length, 0);

  const tick = async (note: { id: string; html: string }, index: number) => {
    const t = await repo.getThought(db, note.id);
    if (!t?.body_html) return;
    // Only the one box changes; the words, and so the plain body, stay as they are.
    await repo.updateThought(db, t.id, { title: t.title, body: t.body, body_html: toggleCheck(t.body_html, index, true) });
    dataChanged();
  };

  const saveHabits = (next: Habit[]) => {
    setHabits(next);
    void repo.setMeta(db, 'habits', JSON.stringify(next));
  };
  const addHabit = () => {
    const name = (habitDraft ?? '').trim().slice(0, 40);
    setHabitDraft(null);
    if (name) saveHabits([...habits, { id: String(Date.now()), name, days: [] }]);
  };

  const add = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    const thought = await captureText(db, text);
    count(M.typed);
    // "Call the bank Friday 10am" has already become a to-do with its reminder.
    if (!thought.todo) await addTodo(db, thought, null);
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

        {focus ? (
          <View style={[styles.focus, { backgroundColor: c.surface, borderColor: c.accent }]}>
            <Feather name="clock" size={18} color={c.accent} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.label, { color: c.ink }]} numberOfLines={1}>
                {focus.session.title}
              </Text>
              <Text style={[type.meta, { color: c.soft }]}>{focus.minutesLeft > 0 ? `Focusing. ${focus.minutesLeft} min left` : 'Time is up'}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => void endFocus(db)} style={styles.stop}>
              <Text style={[type.smallStrong, { color: c.accent }]}>{focus.minutesLeft > 0 ? 'Stop' : 'Finish'}</Text>
            </Pressable>
          </View>
        ) : null}

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

        {boxCount > 0 ? (
          <View style={{ marginTop: 22 }}>
            <Text style={[type.labelStrong, styles.heading, { color: c.ink }]}>In your notes, {boxCount}</Text>
            {boxes.slice(0, 12).map((note) => (
              <View key={note.id}>
                <Pressable accessibilityRole="button" accessibilityHint="Opens the note" onPress={() => router.push({ pathname: '/thought/[id]', params: { id: note.id } })} style={styles.from}>
                  <Text style={[type.meta, { color: c.soft }]} numberOfLines={1}>
                    {note.title}
                  </Text>
                </Pressable>
                {note.items.slice(0, 6).map((item) => (
                  <Pressable
                    key={item.index}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: false }}
                    accessibilityLabel={`Tick: ${item.text}`}
                    onPress={() => void tick(note, item.index)}
                    style={({ pressed }) => [styles.box, { opacity: pressed ? 0.6 : 1 }]}>
                    <View style={[styles.square, { borderColor: c.soft }]} />
                    <Text style={[type.thoughtSmall, { color: c.ink, flex: 1 }]} numberOfLines={2}>
                      {item.text}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {[{ title: 'Waiting on someone', rows: waiting }, { title: 'Someday', rows: someday }].map((s) =>
          s.rows.length > 0 ? (
            <View key={s.title} style={{ marginTop: 22 }}>
              <Text style={[type.labelStrong, styles.heading, { color: c.ink }]}>
                {s.title}, {s.rows.length}
              </Text>
              {s.rows.map((t, i) => (
                <TodoRow key={t.id} thought={t} divider={i < s.rows.length - 1} />
              ))}
            </View>
          ) : null,
        )}

        <View style={{ marginTop: 28 }}>
          <View style={styles.habitHead}>
            <Text style={[type.labelStrong, { color: c.ink }]}>Every day</Text>
            <Pressable accessibilityRole="button" onPress={() => setHabitDraft('')} hitSlop={8} style={styles.stop}>
              <Text style={[type.smallStrong, { color: c.accent }]}>Add a habit</Text>
            </Pressable>
          </View>
          {habits.length === 0 && habitDraft === null ? (
            <Text style={[type.small, { color: c.soft, paddingHorizontal: 24 }]}>Something you want to do daily. Tick it each day and Engram counts the days in a row.</Text>
          ) : null}
          {habits.map((h) => {
            const did = habitDoneToday(h);
            const run = habitStreak(h);
            return (
              <Pressable
                key={h.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: did }}
                accessibilityLabel={`${h.name}, ${run} days in a row`}
                accessibilityHint="Hold to remove"
                onPress={() => saveHabits(habits.map((x) => (x.id === h.id ? toggleHabit(x) : x)))}
                onLongPress={() =>
                  Alert.alert(`Remove the habit ${h.name}?`, 'Its count of days is removed too.', [
                    { text: 'Keep', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => saveHabits(habits.filter((x) => x.id !== h.id)) },
                  ])
                }
                style={({ pressed }) => [styles.box, { opacity: pressed ? 0.6 : 1 }]}>
                <View style={[styles.round, { borderColor: did ? c.accent : c.soft, backgroundColor: did ? c.accent : 'transparent' }]}>
                  {did ? <Feather name="check" size={16} color={c.onAccent} /> : null}
                </View>
                <Text style={[type.thoughtSmall, { color: c.ink, flex: 1 }]} numberOfLines={1}>
                  {h.name}
                </Text>
                <Text style={[type.meta, { color: c.soft }]}>{run === 0 ? 'Not yet' : run === 1 ? '1 day' : `${run} days in a row`}</Text>
              </Pressable>
            );
          })}
          {habitDraft !== null ? (
            <View style={styles.addRow}>
              <View style={[styles.field, { backgroundColor: c.surface, borderColor: c.line }]}>
                <TextInput
                  autoFocus
                  value={habitDraft}
                  onChangeText={setHabitDraft}
                  onSubmitEditing={addHabit}
                  onBlur={addHabit}
                  placeholder="Read for ten minutes"
                  placeholderTextColor={c.faint}
                  accessibilityLabel="New habit"
                  returnKeyType="done"
                  style={[styles.input, { color: c.ink }]}
                  selectionColor={c.accent}
                />
              </View>
            </View>
          ) : null}
        </View>

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
  focus: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 18, paddingLeft: 16, paddingRight: 6, minHeight: 64, borderRadius: 20, borderWidth: 2 },
  stop: { minHeight: 48, minWidth: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  from: { minHeight: 32, justifyContent: 'flex-end', paddingHorizontal: 24, paddingTop: 8 },
  box: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48, paddingLeft: 27, paddingRight: 24, paddingVertical: 6 },
  square: { width: 24, height: 24, borderRadius: 6, borderWidth: 2 },
  round: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  habitHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 24, paddingRight: 16 },
  heading: { paddingHorizontal: 24, paddingBottom: 4 },
  event: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 24 },
});

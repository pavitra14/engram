import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Entry } from '@/components/Entry';
import { Button, Header, RoundButton } from '@/components/ui';
import { useDb } from '@/db/provider';
import type { Thought } from '@/db/types';
import { useBrain } from '@/lib/brain';
import { removeThought } from '@/lib/capture';
import { weekOf } from '@/lib/habits';
import { addTodo } from '@/lib/reminders';
import { daysAgo, titleOf, when } from '@/lib/text';
import { font, type, useTheme } from '@/theme';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * The weekly review: what the week looked like, then a short pile of older notes
 * to decide on one at a time. Keep it, make it a to-do, or let it go.
 */
export default function ReviewScreen() {
  const db = useDb();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const brain = useBrain(db);
  const [now] = useState(() => Date.now());
  const [handled, setHandled] = useState<string[]>([]);

  const week = useMemo(() => weekOf(brain?.thoughts ?? [], now), [brain, now]);
  const busiest = useMemo(() => {
    if (!brain) return null;
    const from = now - 7 * 86_400_000;
    let best: { name: string; id: string; n: number } | null = null;
    for (const g of brain.groups) {
      const n = g.members.filter((id) => (brain.byId.get(id)?.created_at ?? 0) >= from).length;
      if (n > 0 && (!best || n > best.n)) best = { name: g.name, id: g.id, n };
    }
    return best;
  }, [brain, now]);

  // Notes nobody has touched for two weeks and that are not to-dos: the ones most likely forgotten.
  const pile = useMemo(
    () =>
      (brain?.thoughts ?? [])
        .filter((t) => !t.todo && daysAgo(t.updated_at) >= 14 && !handled.includes(t.id))
        .sort((a, b) => a.updated_at - b.updated_at)
        .slice(0, 5),
    [brain, handled],
  );
  const current: Thought | undefined = pile[0];
  const done = (id: string) => setHandled((h) => [...h, id]);
  const top = Math.max(1, ...week.perDay);
  const today = new Date(now).getDay();

  const stat = (n: number, label: string, danger = false) => (
    <View style={styles.stat}>
      <Text style={{ fontFamily: font.serifMedium, fontSize: 34, color: danger && n > 0 ? c.danger : c.ink }}>{n}</Text>
      <Text style={[type.meta, { color: c.soft }]}>{label}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 48 }}>
        <Header title="Your week" back="Today" sub={week.streak > 1 ? `${week.streak} days in a row with a note` : 'The last seven days'}>
          <RoundButton icon="calendar" label="The month in review" onPress={() => router.push('/recap')} />
        </Header>

        <View style={styles.stats}>
          {stat(week.captured, week.captured === 1 ? 'note' : 'notes')}
          {stat(week.done, 'done')}
          {stat(week.open, 'still to do')}
          {stat(week.overdue, 'overdue', true)}
        </View>

        <View style={styles.bars} accessibilityLabel={`Notes per day this week: ${week.perDay.join(', ')}`}>
          {week.perDay.map((n, i) => (
            <View key={i} style={styles.barCol}>
              <View style={[styles.bar, { height: 6 + (n / top) * 64, backgroundColor: n > 0 ? c.accent : c.line }]} />
              <Text style={[type.meta, { color: i === 6 ? c.ink : c.soft }]}>{DAYS[(today - 6 + i + 7) % 7]}</Text>
            </View>
          ))}
        </View>

        {busiest ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/group/[id]', params: { id: busiest.id } })}
            style={({ pressed }) => [styles.card, { backgroundColor: c.surface, borderColor: c.line, opacity: pressed ? 0.7 : 1 }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.meta, { color: c.soft }]}>Most on your mind</Text>
              <Text style={{ fontFamily: font.serifMedium, fontSize: 22, color: c.ink }}>{busiest.name}</Text>
              <Text style={[type.meta, { color: c.soft }]}>
                {busiest.n} new {busiest.n === 1 ? 'note' : 'notes'} this week. Open it to turn them into a next step.
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={c.soft} />
          </Pressable>
        ) : null}

        <Text style={[type.labelStrong, styles.heading, { color: c.ink }]}>
          {current ? `Older notes to decide on, ${pile.length} left` : 'Older notes to decide on'}
        </Text>
        {current ? (
          <View>
            <Entry
              thought={current}
              sub={`Untouched since ${when(current.updated_at)}`}
              divider={false}
              onPress={() => router.push({ pathname: '/thought/[id]', params: { id: current.id } })}
            />
            <View style={styles.choices}>
              <Button title="Keep" onPress={() => done(current.id)} />
              <Button
                title="Make it a to-do"
                tone="solid"
                onPress={() => {
                  void addTodo(db, current, null);
                  done(current.id);
                }}
              />
              <Button
                title="Let it go"
                tone="danger"
                onPress={() => {
                  void removeThought(db, current, { quiet: true });
                  done(current.id);
                }}
              />
            </View>
            <Text style={[type.meta, styles.note, { color: c.soft }]}>
              &ldquo;Let it go&rdquo; moves &ldquo;{titleOf(current).slice(0, 40)}&rdquo; to the trash, where it stays for 30 days.
            </Text>
          </View>
        ) : (
          <Text style={[type.body, styles.note, { color: c.soft }]}>
            {brain && brain.thoughts.length === 0
              ? 'Nothing to review yet. Notes you have not touched for two weeks show up here.'
              : 'Nothing waiting. Notes you have not touched for two weeks show up here.'}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', paddingHorizontal: 24, marginTop: 20 },
  stat: { flex: 1, gap: 2 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 24, marginTop: 28, height: 96 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  bar: { width: '100%', borderRadius: 6 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 28, padding: 18, borderRadius: 20, borderWidth: 1 },
  heading: { paddingHorizontal: 24, marginTop: 32 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 24 },
  note: { paddingHorizontal: 24, marginTop: 12 },
});

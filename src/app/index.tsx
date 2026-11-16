import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useDb } from '@/db/provider';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, SectionList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CAPTURE_BAR_SPACE, CaptureBar } from '@/components/CaptureBar';
import { Entry } from '@/components/Entry';
import { GroupMap } from '@/components/GroupMap';
import { TodoRow } from '@/components/TodoRow';
import { Button, Header, Pill, RoundButton } from '@/components/ui';
import * as repo from '@/db/repo';
import type { Thought } from '@/db/types';
import { placement, useBrain } from '@/lib/brain';
import { type DayEvent, eventsToday, noteForEvent } from '@/lib/calendar';
import { loadSamples } from '@/lib/samples';
import { dayLabel, daysAgo, longDate, timeOfDay, when } from '@/lib/text';
import { type, useTheme } from '@/theme';

type HomeView = 'list' | 'split' | 'map';

/**
 * Home. Three layouts, chosen in Settings: the list of thoughts (the default),
 * the map above the list, or the map on its own.
 */
export default function HomeScreen() {
  const db = useDb();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const brain = useBrain(db);
  const [now] = useState(() => Date.now());
  const [todos, setTodos] = useState<Thought[]>([]);
  const [events, setEvents] = useState<DayEvent[]>([]);
  const [view, setView] = useState<HomeView>('list');
  const [toured, setToured] = useState(false);

  // A new install starts with the tour. A phone that already holds thoughts has no need of it.
  useEffect(() => {
    let live = true;
    (async () => {
      if ((await repo.getMeta(db, 'tour_done')) === '1' || (await repo.countThoughts(db)) > 0) {
        await repo.setMeta(db, 'tour_done', '1');
        if (live) setToured(true);
        return;
      }
      if (live) router.replace('/tour');
    })();
    return () => {
      live = false;
    };
  }, [db]);
  const { width, height } = useWindowDimensions();

  // `brain` changes whenever the data does, which is the reload signal here.
  useEffect(() => {
    let live = true;
    repo.listOpenTodos(db).then((rows) => {
      if (live) setTodos(rows);
    });
    return () => {
      live = false;
    };
  }, [db, brain]);

  // Today's calendar, if the person switched it on in Settings.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      (async () => {
        const v = await repo.getMeta(db, 'home_view');
        if (live) setView(v === 'split' || v === 'map' ? v : 'list');
        const on = (await repo.getMeta(db, 'calendar')) === 'on';
        const rows = on ? await eventsToday().catch(() => []) : [];
        if (live) setEvents(rows);
      })();
      return () => {
        live = false;
      };
    }, [db]),
  );

  const sections = useMemo(() => {
    const out: { title: string; data: Thought[] }[] = [];
    for (const t of brain?.thoughts ?? []) {
      const title = dayLabel(t.created_at);
      const last = out[out.length - 1];
      if (last && last.title === title) last.data.push(t);
      else out.push({ title, data: [t] });
    }
    return out;
  }, [brain]);

  // One older thought a day, so things written weeks ago get a second look.
  const again = useMemo(() => {
    const old = (brain?.thoughts ?? []).filter((t) => daysAgo(t.created_at) >= 7 && !t.todo);
    return old.length ? old[Math.floor(now / 86_400_000) % old.length] : null;
  }, [brain, now]);

  const today = brain?.thoughts.filter((t) => daysAgo(t.created_at) <= 0).length ?? 0;
  const empty = brain !== null && brain.thoughts.length === 0;

  const header = (
    <Header title="Today" sub={`${longDate(now)}, ${today} ${today === 1 ? 'thought' : 'thoughts'}`}>
      <RoundButton icon="search" label="Search your thoughts" onPress={() => router.push('/search')} />
      <RoundButton icon="share-2" label="Open the map of your groups" onPress={() => router.push('/map')} />
      <RoundButton icon="check-square" label="To-do list" onPress={() => router.push('/todo')} />
      <RoundButton icon="sliders" label="Settings" onPress={() => router.push('/settings')} />
    </Header>
  );

  const groupPills =
    brain && brain.groups.length > 0 ? (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groups}>
        {brain.groups.map((g) => (
          <Pill key={g.id} tone={g.tone} label={`${g.name}, ${g.members.length}`} onPress={() => router.push({ pathname: '/group/[id]', params: { id: g.id } })} />
        ))}
      </ScrollView>
    ) : null;

  const agenda = (
    <>
      {events.length > 0 ? (
        <View>
          <Text style={[type.labelStrong, styles.heading, { color: c.ink }]}>On your calendar today</Text>
          {events.slice(0, 4).map((e) => (
            <Pressable
              key={e.id + e.start}
              accessibilityRole="button"
              accessibilityHint="Starts a note about this event"
              onPress={() => router.push(noteForEvent(e))}
              style={({ pressed }) => [styles.event, { opacity: pressed ? 0.6 : 1 }]}>
              <Text style={[type.small, { color: c.soft, width: 76 }]}>{e.allDay ? 'All day' : timeOfDay(e.start)}</Text>
              <Text style={[type.label, { color: c.ink, flex: 1 }]} numberOfLines={1}>
                {e.title}
              </Text>
              <Feather name="edit-3" size={16} color={c.accent} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {todos.length > 0 ? (
        <View>
          <View style={styles.todoHead}>
            <Text style={[type.labelStrong, { color: c.ink }]}>To do, {todos.length}</Text>
            {todos.length > 3 ? (
              <Pressable accessibilityRole="button" onPress={() => router.push('/todo')} hitSlop={8} style={styles.seeAll}>
                <Text style={[type.smallStrong, { color: c.accent }]}>See all</Text>
              </Pressable>
            ) : null}
          </View>
          {todos.slice(0, 3).map((t, i) => (
            <TodoRow key={t.id} thought={t} divider={i < Math.min(todos.length, 3) - 1} />
          ))}
        </View>
      ) : null}

      {again ? (
        <View>
          <Text style={[type.labelStrong, styles.heading, { color: c.ink }]}>Worth another look</Text>
          <Entry
            thought={again}
            size="small"
            sub={`You saved this ${when(again.created_at)}. Still true? Still to do?`}
            divider={false}
            onPress={() => router.push({ pathname: '/thought/[id]', params: { id: again.id } })}
          />
        </View>
      ) : null}
    </>
  );

  const emptyState = empty ? (
    <View style={styles.empty}>
      <Text style={[type.title, { color: c.ink }]}>Nothing here yet</Text>
      <Text style={[type.body, { color: c.soft }]}>
        Write or speak a thought below, or share something to Engram from any app. Related thoughts link themselves and
        gather into groups.
      </Text>
      <Button title="Load sample thoughts" onPress={() => void loadSamples(db)} style={{ alignSelf: 'flex-start' }} />
    </View>
  ) : undefined;

  const map = brain && brain.thoughts.length > 0 ? <GroupMap brain={brain} width={width} /> : null;
  const bottom = insets.bottom + CAPTURE_BAR_SPACE + 40;

  if (!toured) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  if (view === 'map') {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: bottom, gap: 24 }}>
          {header}
          {map}
          {emptyState}
          {agenda}
          {brain && brain.thoughts.length > 0 ? (
            <View>
              <Text style={[type.labelStrong, styles.heading, { color: c.ink }]}>Latest</Text>
              {brain.thoughts.slice(0, 5).map((t, i) => (
                <Entry
                  key={t.id}
                  thought={t}
                  size="small"
                  sub={placement(brain, t)}
                  divider={i < Math.min(brain.thoughts.length, 5) - 1}
                  onPress={() => router.push({ pathname: '/thought/[id]', params: { id: t.id } })}
                />
              ))}
            </View>
          ) : null}
        </ScrollView>
        <CaptureBar clipboard />
      </View>
    );
  }

  const split = view === 'split';
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {split ? (
        <View style={{ paddingTop: insets.top + 20 }}>
          {header}
          {map ? (
            <ScrollView
              nestedScrollEnabled
              style={{ height: Math.round(height * 0.36), marginTop: 12, borderBottomWidth: 1, borderBottomColor: c.rule }}
              contentContainerStyle={{ paddingVertical: 16 }}>
              {map}
            </ScrollView>
          ) : null}
        </View>
      ) : null}
      <SectionList
        sections={sections}
        keyExtractor={(t) => t.id}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: split ? 16 : insets.top + 20, paddingBottom: bottom }}
        ListHeaderComponent={
          <View style={{ gap: 20, paddingBottom: 8 }}>
            {split ? null : header}
            {split ? null : groupPills}
            {agenda}
          </View>
        }
        renderSectionHeader={({ section }) =>
          section.title === 'Today' ? null : <Text style={[type.labelStrong, styles.day, { color: c.ink }]}>{section.title}</Text>
        }
        renderItem={({ item, index, section }) => (
          <Entry
            thought={item}
            sub={brain ? placement(brain, item) : undefined}
            divider={index < section.data.length - 1}
            onPress={() => router.push({ pathname: '/thought/[id]', params: { id: item.id } })}
          />
        )}
        ListEmptyComponent={emptyState}
      />
      <CaptureBar clipboard />
    </View>
  );
}

const styles = StyleSheet.create({
  groups: { gap: 8, paddingHorizontal: 24 },
  heading: { paddingHorizontal: 24, paddingBottom: 4 },
  event: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 24 },
  todoHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, minHeight: 32 },
  seeAll: { minHeight: 32, justifyContent: 'center' },
  day: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 2 },
  empty: { gap: 16, paddingHorizontal: 24, paddingTop: 24 },
});

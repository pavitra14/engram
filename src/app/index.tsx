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
import { answerSuggestion, removeThought, type Suggestion, suggestLinks } from '@/lib/capture';
import { askLater, keepRemembering, stopRemembering } from '@/lib/actions';
import { type DayEvent, eventsToday, noteForEvent } from '@/lib/calendar';
import { DECISION_STEP, dueRecalls, milestone, onThisDay, surprise } from '@/lib/recall';
import { showToast } from '@/lib/toast';
import { loadSamples } from '@/lib/samples';
import { questionFor, streak, weekOf } from '@/lib/habits';
import { dayLabel, daysAgo, longDate, timeOfDay, titleOf, when } from '@/lib/text';
import { font, type, useTheme } from '@/theme';

type HomeView = 'list' | 'split' | 'map';

/** Link suggestions answered since the app opened. A few at a sitting is enough. */
let suggestionsAnswered = 0;
const SUGGESTIONS_PER_SITTING = 3;

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
  const [question, setQuestion] = useState<'show' | 'hide'>('hide');
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

  // One pair that nearly linked, worked out a moment after the list has settled.
  useEffect(() => {
    if (!brain || brain.thoughts.length < 4 || suggestionsAnswered >= SUGGESTIONS_PER_SITTING) return;
    let live = true;
    const timer = setTimeout(() => {
      void suggestLinks(db, 1)
        .then((rows) => {
          if (live) setSuggestion(rows[0] ?? null);
        })
        .catch(() => {});
    }, 900);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [db, brain]);

  // A milestone is mentioned once, quietly. Loading many thoughts at once (samples, a backup) passes them without comment.
  useEffect(() => {
    if (!brain) return;
    void (async () => {
      const n = brain.thoughts.length;
      const before = Number(await repo.getMeta(db, 'count_seen')) || 0;
      if (n === before) return;
      await repo.setMeta(db, 'count_seen', String(n));
      let seen: string[] = [];
      try {
        seen = JSON.parse((await repo.getMeta(db, 'milestones')) ?? '[]');
      } catch {
        seen = [];
      }
      const all: string[] = [];
      for (let m = milestone(n, streak(brain.thoughts), [...seen, ...all]); m; m = milestone(n, streak(brain.thoughts), [...seen, ...all])) all.push(m.key);
      if (all.length === 0) return;
      const newest = milestone(n, streak(brain.thoughts), seen);
      await repo.setMeta(db, 'milestones', JSON.stringify([...seen, ...all]));
      if (newest && n - before === 1) showToast(newest.text);
    })();
  }, [db, brain]);

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
        // Today's question shows until it is answered or hidden for the day, unless switched off in Settings.
        const off = (await repo.getMeta(db, 'daily_question')) === 'off';
        const hidden = (await repo.getMeta(db, 'question_hidden')) === questionFor();
        if (live) setQuestion(off || hidden ? 'hide' : 'show');
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

  const pinned = useMemo(() => (brain?.thoughts ?? []).filter((t) => t.pinned).sort((a, b) => (b.pinned ?? 0) - (a.pinned ?? 0)), [brain]);
  // Something that asked to come back today takes the place of "Worth another look".
  const due = useMemo(() => dueRecalls(brain?.thoughts ?? [], now)[0] ?? null, [brain, now]);
  const thisDay = useMemo(() => onThisDay(brain?.thoughts ?? [], now), [brain, now]);
  const openThought = (id: string) => router.push({ pathname: '/thought/[id]', params: { id } });

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

  const ask = questionFor(now);
  const answered = (brain?.thoughts ?? []).some((t) => t.title === ask && daysAgo(t.created_at) === 0);
  const week = useMemo(() => weekOf(brain?.thoughts ?? [], now), [brain, now]);

  const agenda = (
    <>
      {question === 'show' && !answered && !empty ? (
        <View style={[styles.ask, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Text style={[type.meta, { color: c.soft }]}>Today&rsquo;s question</Text>
          <Text style={{ fontFamily: font.serifMedium, fontSize: 21, lineHeight: 27, color: c.ink }}>{ask}</Text>
          <View style={styles.askRow}>
            <Button title="Answer" tone="solid" onPress={() => router.push({ pathname: '/compose', params: { title: ask } })} />
            <Button
              title="Not today"
              onPress={() => {
                setQuestion('hide');
                void repo.setMeta(db, 'question_hidden', ask);
              }}
            />
          </View>
        </View>
      ) : null}

      {pinned.length > 0 ? (
        <View>
          <Text style={[type.labelStrong, styles.heading, { color: c.ink }]}>Pinned</Text>
          {pinned.map((t, i) => (
            <Entry key={t.id} thought={t} size="small" divider={i < pinned.length - 1} onPress={() => openThought(t.id)} />
          ))}
        </View>
      ) : null}

      {brain && brain.thoughts.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Opens your weekly review"
          onPress={() => router.push('/review')}
          style={({ pressed }) => [styles.week, { opacity: pressed ? 0.6 : 1 }]}>
          <Feather name="bar-chart-2" size={16} color={c.accent} />
          <Text style={[type.small, { color: c.ink, flex: 1 }]}>
            This week: {week.captured} {week.captured === 1 ? 'note' : 'notes'}, {week.done} done
            {week.streak > 1 ? `, ${week.streak} days in a row` : ''}
          </Text>
          <Text style={[type.smallStrong, { color: c.accent }]}>Review</Text>
        </Pressable>
      ) : null}

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

      {due ? (
        <View style={[styles.ask, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Text style={[type.meta, { color: c.soft }]}>
            {due.recall_step === DECISION_STEP ? `You decided this ${when(due.created_at)}. How did it turn out?` : `You asked to remember this. Still useful?`}
          </Text>
          <Pressable accessibilityRole="button" accessibilityHint="Opens this note" onPress={() => openThought(due.id)}>
            <Text style={{ fontFamily: font.serifMedium, fontSize: 21, lineHeight: 27, color: c.ink }} numberOfLines={3}>
              {titleOf(due)}
            </Text>
          </Pressable>
          {due.recall_step === DECISION_STEP ? (
            <View style={styles.askRow}>
              <Button
                title="Write what happened"
                tone="solid"
                onPress={() => {
                  void stopRemembering(db, due);
                  openThought(due.id);
                }}
              />
              <Button title="Ask in a month" onPress={() => void askLater(db, due)} />
            </View>
          ) : (
            <View style={styles.askRow}>
              <Button
                title="Keep"
                tone="solid"
                onPress={() => void keepRemembering(db, due).then((more) => showToast(more ? 'It will come back again later.' : 'That was the last time. It stays in your notes.'))}
              />
              <Button title="Done with it" onPress={() => void stopRemembering(db, due)} />
              <Button title="Delete" tone="danger" onPress={() => void removeThought(db, due)} />
            </View>
          )}
        </View>
      ) : null}

      {!due && (thisDay || again) ? (
        <View>
          <View style={styles.todoHead}>
            <Text style={[type.labelStrong, { color: c.ink }]}>{thisDay ? thisDay.ago : 'Worth another look'}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Opens an older note chosen at random"
              onPress={() => {
                const pick = surprise(brain?.thoughts ?? [], Math.random());
                if (pick) openThought(pick.id);
              }}
              hitSlop={8}
              style={styles.seeAll}>
              <Text style={[type.smallStrong, { color: c.accent }]}>Surprise me</Text>
            </Pressable>
          </View>
          {thisDay ? (
            <Entry thought={thisDay.thought} size="small" sub="You wrote this on this day." divider={false} onPress={() => openThought(thisDay.thought.id)} />
          ) : again ? (
            <Entry thought={again} size="small" sub={`You saved this ${when(again.created_at)}. Still true? Still to do?`} divider={false} onPress={() => openThought(again.id)} />
          ) : null}
        </View>
      ) : null}

      {suggestion ? (
        <View style={[styles.ask, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Text style={[type.meta, { color: c.soft }]}>These two seem related</Text>
          {[suggestion.a, suggestion.b].map((t) => (
            <Pressable key={t.id} accessibilityRole="button" accessibilityHint="Opens this note" onPress={() => openThought(t.id)} style={styles.pair}>
              <Text style={[type.thoughtSmall, { color: c.ink }]} numberOfLines={2}>
                {titleOf(t)}
              </Text>
            </Pressable>
          ))}
          <View style={styles.askRow}>
            <Button
              title="Link them"
              tone="solid"
              onPress={() => {
                suggestionsAnswered += 1;
                setSuggestion(null);
                void answerSuggestion(db, suggestion, true);
              }}
            />
            <Button
              title="Not related"
              onPress={() => {
                suggestionsAnswered += 1;
                setSuggestion(null);
                void answerSuggestion(db, suggestion, false);
              }}
            />
          </View>
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
  ask: { marginHorizontal: 16, padding: 18, borderRadius: 20, borderWidth: 1, gap: 10 },
  askRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  pair: { minHeight: 48, justifyContent: 'center' },
  week: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 24 },
  groups: { gap: 8, paddingHorizontal: 24 },
  heading: { paddingHorizontal: 24, paddingBottom: 4 },
  event: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 24 },
  todoHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, minHeight: 32 },
  seeAll: { minHeight: 32, justifyContent: 'center' },
  day: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 2 },
  empty: { gap: 16, paddingHorizontal: 24, paddingTop: 24 },
});

import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CAPTURE_BAR_SPACE, CaptureBar } from '@/components/CaptureBar';
import { Entry } from '@/components/Entry';
import { Button, Header, Pill, RoundButton } from '@/components/ui';
import type { Thought } from '@/db/types';
import { placement, useBrain } from '@/lib/brain';
import { loadSamples } from '@/lib/samples';
import { dayLabel, daysAgo, longDate } from '@/lib/text';
import { type, useTheme } from '@/theme';

/** Home: today's thoughts as a readable stream, with your groups one tap away. */
export default function HomeScreen() {
  const db = useSQLiteContext();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const brain = useBrain(db);
  const [now] = useState(() => Date.now());

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

  const today = brain?.thoughts.filter((t) => daysAgo(t.created_at) <= 0).length ?? 0;
  const empty = brain !== null && brain.thoughts.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <SectionList
        sections={sections}
        keyExtractor={(t) => t.id}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + CAPTURE_BAR_SPACE + 40 }}
        ListHeaderComponent={
          <View style={{ gap: 20, paddingBottom: 8 }}>
            <Header
              title="Today"
              sub={`${longDate(now)}, ${today} ${today === 1 ? 'thought' : 'thoughts'}`}>
              <RoundButton icon="search" label="Search your thoughts" onPress={() => router.push('/search')} />
              <RoundButton icon="share-2" label="Open the map of your groups" onPress={() => router.push('/map')} />
              <RoundButton icon="sliders" label="Settings" onPress={() => router.push('/settings')} />
            </Header>
            {brain && brain.groups.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groups}>
                {brain.groups.map((g) => (
                  <Pill
                    key={g.id}
                    tone={g.tone}
                    label={`${g.name}, ${g.members.length}`}
                    onPress={() => router.push({ pathname: '/group/[id]', params: { id: g.id } })}
                  />
                ))}
              </ScrollView>
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) =>
          section.title === 'Today' ? null : (
            <Text style={[type.labelStrong, styles.day, { color: c.ink }]}>{section.title}</Text>
          )
        }
        renderItem={({ item, index, section }) => (
          <Entry
            thought={item}
            sub={brain ? placement(brain, item) : undefined}
            divider={index < section.data.length - 1}
            onPress={() => router.push({ pathname: '/thought/[id]', params: { id: item.id } })}
          />
        )}
        ListEmptyComponent={
          empty ? (
            <View style={styles.empty}>
              <Text style={[type.title, { color: c.ink }]}>Nothing here yet</Text>
              <Text style={[type.body, { color: c.soft }]}>
                Write or speak a thought below, or share something to Engram from any app. Related thoughts link
                themselves and gather into groups.
              </Text>
              <Button title="Load sample thoughts" onPress={() => void loadSamples(db)} style={{ alignSelf: 'flex-start' }} />
            </View>
          ) : undefined
        }
      />
      <CaptureBar clipboard />
    </View>
  );
}

const styles = StyleSheet.create({
  groups: { gap: 8, paddingHorizontal: 24 },
  day: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 2 },
  empty: { gap: 16, paddingHorizontal: 24, paddingTop: 24 },
});

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CAPTURE_BAR_SPACE, CaptureBar } from '@/components/CaptureBar';
import { GroupMap } from '@/components/GroupMap';
import { Header, RoundButton } from '@/components/ui';
import { useDb } from '@/db/provider';
import { brainAt, placement, useBrain } from '@/lib/brain';
import { titleOf } from '@/lib/text';
import { type, useTheme } from '@/theme';

/** The map: groups as named circles, and thoughts that belong to no group as small circles of their own. */
export default function MapScreen() {
  const db = useDb();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const brain = useBrain(db);
  const params = useLocalSearchParams<{ play?: string }>();
  // Playing the map: step through time from the first thought to now and draw the map as it was at each step.
  const [step, setStep] = useState<number | null>(params.play ? 0 : null);
  const [now] = useState(() => Date.now());
  const moments = useMemo(() => {
    const all = brain?.thoughts ?? [];
    if (all.length < 2) return [];
    const first = all[all.length - 1].created_at;
    const last = now;
    // About a week a step, but never more than 40 steps however long the history is.
    const size = Math.max(7 * 86_400_000, Math.ceil((last - first) / 40));
    const out: number[] = [];
    for (let t = first; t < last; t += size) out.push(t);
    out.push(last);
    return out;
  }, [brain, now]);
  const playing = step !== null && step < moments.length;
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => setStep((s) => (s === null ? null : s + 1)), 650);
    return () => clearTimeout(timer);
  }, [playing, step]);
  const shown = useMemo(() => (brain && playing ? brainAt(brain, moments[step]) : brain), [brain, playing, moments, step]);

  const latest = brain?.thoughts[0];
  const total = brain?.thoughts.length ?? 0;
  const groupCount = brain?.groups.length ?? 0;
  const alone = brain?.loose.length ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + CAPTURE_BAR_SPACE + 40 }}>
        <Header
          title="Map"
          back="Today"
          sub={`${total} ${total === 1 ? 'thought' : 'thoughts'}, ${groupCount} ${groupCount === 1 ? 'group' : 'groups'}${alone ? `, ${alone} on ${alone === 1 ? 'its' : 'their'} own` : ''}`}>
          {moments.length > 2 ? (
            <RoundButton icon={playing ? 'square' : 'play'} label={playing ? 'Stop playing the map' : 'Play the map growing from your first thought'} onPress={() => setStep(playing ? null : 0)} />
          ) : null}
          <RoundButton icon="search" label="Search your thoughts" onPress={() => router.push('/search')} />
        </Header>

        {playing && shown ? (
          <Text style={[type.small, styles.note, { color: c.accent }]} accessibilityLiveRegion="polite">
            {new Date(moments[step]).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}: {shown.thoughts.length}{' '}
            {shown.thoughts.length === 1 ? 'thought' : 'thoughts'}, {shown.groups.length} {shown.groups.length === 1 ? 'group' : 'groups'}
          </Text>
        ) : null}

        {shown && total > 0 ? (
          <View style={{ marginTop: 28 }}>
            <GroupMap brain={shown} width={width} />
          </View>
        ) : null}

        {brain && total === 0 ? (
          <Text style={[type.body, styles.note, { color: c.soft }]}>
            Nothing here yet. Thoughts appear as circles, and gather into a group when two or more of them link.
          </Text>
        ) : null}

        {brain && latest ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/thought/[id]', params: { id: latest.id } })}
            style={({ pressed }) => [styles.latest, { backgroundColor: c.surface, borderColor: c.line, opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[type.label, { color: c.ink }]} numberOfLines={2}>
              {titleOf(latest)}
            </Text>
            <Text style={[type.meta, { color: c.soft }]}>Your latest thought. {placement(brain, latest)}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <CaptureBar />
    </View>
  );
}

const styles = StyleSheet.create({
  note: { paddingHorizontal: 24, paddingTop: 24 },
  latest: { marginHorizontal: 16, marginTop: 24, padding: 16, borderRadius: 20, borderWidth: 1, gap: 4 },
});

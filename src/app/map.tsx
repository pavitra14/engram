import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CAPTURE_BAR_SPACE, CaptureBar } from '@/components/CaptureBar';
import { GroupMap } from '@/components/GroupMap';
import { Header, RoundButton } from '@/components/ui';
import { useDb } from '@/db/provider';
import { placement, useBrain } from '@/lib/brain';
import { titleOf } from '@/lib/text';
import { type, useTheme } from '@/theme';

/** The map: groups as named circles, and thoughts that belong to no group as small circles of their own. */
export default function MapScreen() {
  const db = useDb();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const brain = useBrain(db);

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
          <RoundButton icon="search" label="Search your thoughts" onPress={() => router.push('/search')} />
        </Header>

        {brain && total > 0 ? (
          <View style={{ marginTop: 28 }}>
            <GroupMap brain={brain} width={width} />
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

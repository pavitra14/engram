import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CAPTURE_BAR_SPACE, CaptureBar } from '@/components/CaptureBar';
import { Entry } from '@/components/Entry';
import { Header, Pill } from '@/components/ui';
import type { Thought } from '@/db/types';
import { useBrain } from '@/lib/brain';
import { when } from '@/lib/text';
import { type, useTheme } from '@/theme';

/**
 * One group's thoughts. The id is a group id, or "loose" for thoughts that
 * link to nothing, or "largest" (used by the automated test).
 */
export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const brain = useBrain(db);

  const loose = id === 'loose';
  const group = brain ? (id === 'largest' ? brain.groups[0] : brain.groupById.get(id)) : undefined;
  const ids = loose ? (brain?.loose ?? []) : (group?.members ?? []);
  const thoughts = ids.map((x) => brain?.byId.get(x)).filter((t): t is Thought => !!t);
  const missing = brain !== null && !loose && !group;

  const title = loose ? 'Not in a group' : (group?.name ?? '');
  const count = thoughts.length;
  const sub =
    brain === null
      ? undefined
      : loose
        ? `${count} ${count === 1 ? 'thought links' : 'thoughts link'} to nothing yet`
        : group
          ? `${count} thoughts, newest ${when(group.newest)}`
          : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={thoughts}
        keyExtractor={(t) => t.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + CAPTURE_BAR_SPACE + 40 }}
        ListHeaderComponent={
          <View style={{ gap: 18, paddingBottom: 6 }}>
            <Header title={missing ? 'This group has changed' : title} back="Map" sub={sub} />
            {missing ? (
              <Text style={[type.body, styles.note, { color: c.soft }]}>
                Groups follow your links, so this one merged or split. Go back to the map to find its thoughts.
              </Text>
            ) : null}
            {group && group.near.length > 0 && brain ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.near}>
                <Text style={[type.meta, { color: c.soft }]}>Near</Text>
                {group.near.map((n) => {
                  const other = brain.groupById.get(n);
                  return other ? (
                    <Pill
                      key={n}
                      tone={other.tone}
                      label={other.name}
                      onPress={() => router.replace({ pathname: '/group/[id]', params: { id: n } })}
                    />
                  ) : null;
                })}
              </ScrollView>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => {
          const n = brain?.degree.get(item.id) ?? 0;
          return (
            <Entry
              thought={item}
              size="small"
              sub={n === 0 ? undefined : `Linked to ${n} ${n === 1 ? 'thought' : 'thoughts'}`}
              divider={index < thoughts.length - 1}
              onPress={() => router.push({ pathname: '/thought/[id]', params: { id: item.id } })}
            />
          );
        }}
      />
      <CaptureBar />
    </View>
  );
}

const styles = StyleSheet.create({
  near: { alignItems: 'center', gap: 8, paddingHorizontal: 24 },
  note: { paddingHorizontal: 24 },
});

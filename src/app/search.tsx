import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useDb } from '@/db/provider';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Entry } from '@/components/Entry';
import { Pill, RoundButton } from '@/components/ui';
import * as repo from '@/db/repo';
import type { Thought, ThoughtKind } from '@/db/types';
import { placement, useBrain } from '@/lib/brain';
import { font, KINDS, type, useTheme } from '@/theme';

const PLURAL: Record<ThoughtKind, string> = {
  text: 'Notes',
  voice: 'Voice',
  link: 'Links',
  image: 'Images',
  video: 'Videos',
  file: 'Files',
};

export default function SearchScreen() {
  const db = useDb();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const brain = useBrain(db);
  const params = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(() => (typeof params.q === 'string' ? params.q : ''));
  const [kind, setKind] = useState<ThoughtKind | null>(null);
  const [hits, setHits] = useState<Thought[] | null>(null);

  const q = query.trim();

  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      const rows = q ? await repo.searchThoughts(db, q, { limit: 300 }) : [];
      if (live) setHits(rows);
    }, 120);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [db, q, brain]);

  const counts = useMemo(() => {
    const m = new Map<ThoughtKind, number>();
    for (const h of hits ?? []) m.set(h.kind, (m.get(h.kind) ?? 0) + 1);
    return m;
  }, [hits]);

  const shown = (hits ?? []).filter((h) => !kind || h.kind === kind);
  const groups = q && brain ? brain.groups.filter((g) => g.name.toLowerCase().includes(q.toLowerCase())).slice(0, 2) : [];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 12 }}>
      <View style={styles.top}>
        <View style={[styles.field, { backgroundColor: c.surface, borderColor: c.accent }]}>
          <Feather name="search" size={18} color={c.soft} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search your thoughts"
            placeholderTextColor={c.faint}
            accessibilityLabel="Search your thoughts"
            returnKeyType="search"
            style={[styles.input, { color: c.ink }]}
            selectionColor={c.accent}
          />
          {query ? <RoundButton icon="x" label="Clear search" tone="plain" onPress={() => setQuery('')} /> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={styles.cancel}>
          <Text style={[type.label, { color: c.ink }]}>Cancel</Text>
        </Pressable>
      </View>

      {q ? (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.filters}>
            <Pill label={`All, ${hits?.length ?? 0}`} selected={kind === null} onPress={() => setKind(null)} />
            {KINDS.map((k) => (
              <Pill key={k} label={`${PLURAL[k]}, ${counts.get(k) ?? 0}`} selected={kind === k} onPress={() => setKind(kind === k ? null : k)} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <FlatList
        data={shown}
        keyExtractor={(t) => t.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        ListHeaderComponent={
          groups.length > 0 ? (
            <View style={styles.groups}>
              {groups.map((g) => (
                <Pressable
                  key={g.id}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/group/[id]', params: { id: g.id } })}
                  style={({ pressed }) => [
                    styles.group,
                    { backgroundColor: c.groupFill[g.tone], borderColor: c.groupLine[g.tone], opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <Text style={{ fontFamily: font.serifMedium, fontSize: 20, color: c.ink }}>{g.name}</Text>
                  <Text style={[type.small, { color: c.groupText }]}>Group, {g.members.length} thoughts</Text>
                </Pressable>
              ))}
            </View>
          ) : undefined
        }
        renderItem={({ item, index }) => (
          <Entry
            thought={item}
            size="small"
            query={q}
            sub={brain ? placement(brain, item) : undefined}
            divider={index < shown.length - 1}
            onPress={() => router.push({ pathname: '/thought/[id]', params: { id: item.id } })}
          />
        )}
        ListEmptyComponent={
          <Text style={[type.body, styles.none, { color: c.soft }]}>
            {!q
              ? 'Search the words in any thought, transcript or link.'
              : hits === null
                ? ''
                : 'Nothing matches. Try fewer words or another filter.'}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  field: { flex: 1, height: 56, borderRadius: 28, borderWidth: 2, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 18, paddingRight: 4 },
  input: { flex: 1, fontFamily: font.regular, fontSize: 16, paddingVertical: 0 },
  cancel: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 6 },
  filters: { gap: 8, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  groups: { gap: 8, paddingHorizontal: 24, paddingTop: 16 },
  group: { minHeight: 56, borderRadius: 20, borderWidth: 1, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  none: { paddingHorizontal: 24, paddingTop: 28 },
});

import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThoughtRow } from '@/components/ThoughtRow';
import { Chip, IconButton, KindDot } from '@/components/ui';
import * as repo from '@/db/repo';
import type { Thought, ThoughtKind } from '@/db/types';
import { useDataVersion } from '@/lib/bus';
import { colors, font, kindLabel, KINDS, radius, space, type } from '@/theme';

export default function StreamScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const version = useDataVersion();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<ThoughtKind | null>(null);
  const [rows, setRows] = useState<Thought[] | null>(null);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      const result = await repo.searchThoughts(db, query, { kind, limit: 500 });
      if (live) setRows(result);
    }, 120);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [db, query, kind, version]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.head}>
        <IconButton icon="arrow-left" label="Back to the graph" onPress={() => router.back()} />
        <View style={styles.search}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search your thoughts"
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            returnKeyType="search"
            selectionColor={colors.text}
          />
          {query ? <IconButton icon="x" label="Clear search" size={40} onPress={() => setQuery('')} /> : null}
        </View>
      </View>

      <View style={styles.filters}>
        <Chip label="All" selected={kind === null} onPress={() => setKind(null)} />
        {KINDS.map((k) => (
          <Chip
            key={k}
            label={kindLabel[k]}
            selected={kind === k}
            onPress={() => setKind(kind === k ? null : k)}
            leading={<KindDot kind={k} size={8} />}
          />
        ))}
      </View>

      <FlatList
        data={rows ?? []}
        keyExtractor={(t) => t.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item }) => (
          <ThoughtRow thought={item} onPress={() => router.push({ pathname: '/thought/[id]', params: { id: item.id } })} />
        )}
        ListEmptyComponent={
          rows ? (
            <Text style={[type.body, styles.none]}>
              {query || kind ? 'No thoughts match. Try fewer words or another filter.' : 'No thoughts yet. Capture one from the graph screen.'}
            </Text>
          ) : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  head: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.sm },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space.md + 2,
    paddingRight: 4,
    marginRight: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.inkRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  searchInput: { flex: 1, height: 46, color: colors.text, fontFamily: font.regular, fontSize: 15.5 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: space.md, paddingVertical: space.md },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: space.lg + 9 + space.md },
  none: { color: colors.textSoft, textAlign: 'center', padding: space.xl },
});

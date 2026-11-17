import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { entryMeta } from '@/components/Entry';
import { Button, Header, KindGlyph } from '@/components/ui';
import { useDb } from '@/db/provider';
import * as repo from '@/db/repo';
import type { Thought } from '@/db/types';
import { useDataVersion } from '@/lib/bus';
import { deleteForever, restoreThought, TRASH_DAYS } from '@/lib/capture';
import { titleOf } from '@/lib/text';
import { type, useTheme } from '@/theme';

/** What has been deleted in the last 30 days. Put a thing back, or empty the lot. */
export default function TrashScreen() {
  const db = useDb();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const version = useDataVersion();
  const [rows, setRows] = useState<Thought[] | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    void repo.listTrash(db).then((r) => {
      if (live) setRows(r);
    });
    return () => {
      live = false;
    };
  }, [db, version]);

  const empty = () =>
    Alert.alert('Empty the trash?', `${rows?.length ?? 0} thoughts and their files are deleted for good. This cannot be undone.`, [
      { text: 'Keep them', style: 'cancel' },
      {
        text: 'Empty the trash',
        style: 'destructive',
        onPress: async () => {
          for (const t of rows ?? []) await deleteForever(db, t);
        },
      },
    ]);

  const n = rows?.length ?? 0;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={rows ?? []}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40 }}
        ListHeaderComponent={
          <View style={{ gap: 16, paddingBottom: 8 }}>
            <Header title="Trash" back="Settings" sub={rows === null ? undefined : n === 0 ? 'Empty' : `${n} ${n === 1 ? 'thought' : 'thoughts'}, kept for ${TRASH_DAYS} days`} />
            {n > 0 ? (
              <View style={styles.pad}>
                <Button title="Empty the trash" tone="danger" onPress={empty} style={{ alignSelf: 'flex-start' }} />
              </View>
            ) : rows !== null ? (
              <Text style={[type.body, styles.pad, { color: c.soft }]}>
                Deleted thoughts wait here for {TRASH_DAYS} days in case you want them back, then they are removed for good.
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const left = Math.max(0, TRASH_DAYS - Math.floor((now - (item.trashed_at ?? now)) / 86_400_000));
          return (
            <View style={[styles.row, { borderBottomColor: c.rule }]}>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={styles.meta}>
                  <KindGlyph kind={item.kind} />
                  <Text style={[type.meta, { color: c.soft }]} numberOfLines={1}>
                    {entryMeta(item)}
                  </Text>
                </View>
                <Text style={[type.thoughtSmall, { color: c.ink }]} numberOfLines={2} onPress={() => router.push({ pathname: '/thought/[id]', params: { id: item.id } })}>
                  {titleOf(item)}
                </Text>
                <Text style={[type.meta, { color: c.soft }]}>{left <= 1 ? 'Removed for good tomorrow' : `Removed for good in ${left} days`}</Text>
              </View>
              <Button title="Put back" onPress={() => void restoreThought(db, item.id)} />
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});

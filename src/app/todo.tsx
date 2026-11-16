import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CAPTURE_BAR_SPACE, CaptureBar } from '@/components/CaptureBar';
import { TodoRow } from '@/components/TodoRow';
import { Header } from '@/components/ui';
import * as repo from '@/db/repo';
import type { Thought } from '@/db/types';
import { useDataVersion } from '@/lib/bus';
import { type, useTheme } from '@/theme';

/** Everything you asked to be reminded of or marked as to do, open first. */
export default function TodoScreen() {
  const db = useSQLiteContext();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const version = useDataVersion();
  const [open, setOpen] = useState<Thought[] | null>(null);
  const [done, setDone] = useState<Thought[]>([]);

  useEffect(() => {
    let live = true;
    Promise.all([repo.listOpenTodos(db), repo.listDoneTodos(db, 50)]).then(([o, d]) => {
      if (!live) return;
      setOpen(o);
      setDone(d);
    });
    return () => {
      live = false;
    };
  }, [db, version]);

  const n = open?.length ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + CAPTURE_BAR_SPACE + 40 }}>
        <Header title="To do" back="Today" sub={open === null ? undefined : n === 0 ? 'Nothing open' : `${n} open`} />
        <View style={{ marginTop: 18 }}>
          {open?.map((t, i) => <TodoRow key={t.id} thought={t} divider={i < open.length - 1} />)}
          {open !== null && n === 0 ? (
            <Text style={[type.body, styles.note, { color: c.soft }]}>
              Open any thought and tap To do to add it here, with or without a reminder.
            </Text>
          ) : null}
        </View>
        {done.length > 0 ? (
          <View style={{ marginTop: 28 }}>
            <Text style={[type.labelStrong, styles.heading, { color: c.ink }]}>Done</Text>
            {done.map((t, i) => (
              <TodoRow key={t.id} thought={t} divider={i < done.length - 1} />
            ))}
          </View>
        ) : null}
      </ScrollView>
      <CaptureBar />
    </View>
  );
}

const styles = StyleSheet.create({
  note: { paddingHorizontal: 24 },
  heading: { paddingHorizontal: 24, paddingBottom: 4 },
});

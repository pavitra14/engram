import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Thought } from '@/db/types';
import { setDone } from '@/lib/reminders';
import { dueLabel, titleOf } from '@/lib/text';
import { type, useTheme } from '@/theme';

/** One to-do: a round check you can tap, the thought's words, and when it is due. */
export function TodoRow({ thought, divider = true }: { thought: Thought; divider?: boolean }) {
  const db = useSQLiteContext();
  const { c } = useTheme();
  const done = thought.done_at != null;
  const [now] = useState(() => Date.now());
  const overdue = !done && thought.remind_at != null && thought.remind_at < now;
  const title = titleOf(thought);
  return (
    <View style={[styles.row, divider && { borderBottomWidth: 1, borderBottomColor: c.rule }]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={done ? `Mark as not done: ${title}` : `Mark as done: ${title}`}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          void setDone(db, thought, !done);
        }}
        hitSlop={8}
        style={styles.checkWrap}>
        <View style={[styles.check, { borderColor: done ? c.accent : c.soft, backgroundColor: done ? c.accent : 'transparent' }]}>
          {done ? <Feather name="check" size={16} color={c.onAccent} /> : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/thought/[id]', params: { id: thought.id } })}
        style={({ pressed }) => [styles.words, { opacity: pressed ? 0.6 : 1 }]}>
        <Text
          style={[type.thoughtSmall, { color: done ? c.soft : c.ink, textDecorationLine: done ? 'line-through' : 'none' }]}
          numberOfLines={2}>
          {title}
        </Text>
        {done ? (
          <Text style={[type.meta, { color: c.soft }]}>Done</Text>
        ) : thought.remind_at ? (
          <View style={styles.due}>
            <Feather name="bell" size={12} color={overdue ? c.danger : c.soft} />
            <Text style={[type.meta, { color: overdue ? c.danger : c.soft }]}>{dueLabel(thought.remind_at)}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 24 },
  checkWrap: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  words: { flex: 1, paddingVertical: 12, gap: 4 },
  due: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});

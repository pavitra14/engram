import { Feather } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Thought } from '@/db/types';
import { clock, dueLabel, fileSize, highlightRuns, hostOf, titleOf, when } from '@/lib/text';
import { kindLabel, type, useTheme } from '@/theme';

import { useThoughtMenu } from './ThoughtMenu';

import { KindGlyph } from './ui';

export function entryMeta(t: Thought): string {
  const parts = [kindLabel[t.kind]];
  if (t.source === 'share') parts[0] = `${parts[0]}, shared`;
  if (t.source === 'clipboard') parts[0] = `${parts[0]}, pasted`;
  if ((t.kind === 'voice' || t.kind === 'video') && t.duration_ms) parts.push(clock(t.duration_ms));
  if ((t.kind === 'video' || t.kind === 'file') && t.file_size) parts.push(fileSize(t.file_size));
  parts.push(when(t.created_at));
  return parts.join(', ');
}

/** One thought in a list: what it is, its words in reading type, and where it sits. */
export function Entry({
  thought,
  sub,
  onPress,
  size = 'regular',
  query,
  divider = true,
  trailing,
}: {
  thought: Thought;
  /** The quiet last line, e.g. "In Sourdough, linked to 3 thoughts". */
  sub?: string;
  onPress: () => void;
  size?: 'regular' | 'small';
  /** Search words to mark in the text. */
  query?: string;
  divider?: boolean;
  trailing?: string;
}) {
  const { c } = useTheme();
  const openMenu = useThoughtMenu();
  const text = titleOf(thought);
  const runs = query ? highlightRuns(text, query) : [{ text, hit: false }];
  const host = hostOf(thought.url);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Hold for more actions"
      onPress={onPress}
      onLongPress={() => openMenu(thought)}
      delayLongPress={350}
      style={({ pressed }) => [
        styles.entry,
        divider && { borderBottomWidth: 1, borderBottomColor: c.rule },
        { opacity: pressed ? 0.6 : 1 },
      ]}>
      <View style={styles.meta}>
        <KindGlyph kind={thought.kind} />
        <Text style={[type.meta, { color: c.soft, flex: 1 }]} numberOfLines={1}>
          {entryMeta(thought)}
        </Text>
        {trailing ? <Text style={[type.meta, { color: c.accent }]}>{trailing}</Text> : null}
      </View>
      <View style={styles.main}>
        <Text style={[size === 'small' ? type.thoughtSmall : type.thought, { color: c.ink, flex: 1 }]} numberOfLines={4}>
          {runs.map((r, i) =>
            r.hit ? (
              <Text key={i} style={{ backgroundColor: c.highlight }}>
                {r.text}
              </Text>
            ) : (
              r.text
            ),
          )}
        </Text>
        {thought.kind === 'image' && thought.media_path ? (
          <Image source={{ uri: thought.media_path }} style={[styles.thumb, { backgroundColor: c.surface }]} accessibilityIgnoresInvertColors />
        ) : null}
      </View>
      {thought.en_lang && (thought.en_title || thought.en_body) ? (
        <Text style={[type.small, { color: c.soft }]} numberOfLines={2}>
          In English: {(thought.en_title || thought.en_body || '').replace(/\s+/g, ' ').slice(0, 160)}
        </Text>
      ) : null}
      {thought.title?.trim() && thought.body.trim() ? (
        <Text style={[type.small, { color: c.soft }]} numberOfLines={2}>
          {thought.body.trim().replace(/\s+/g, ' ').slice(0, 180)}
        </Text>
      ) : null}
      {host && thought.body.trim() ? <Text style={[type.small, { color: c.soft }]}>{host}</Text> : null}
      {thought.todo === 1 ? (
        <View style={styles.meta}>
          <Feather name={thought.done_at ? 'check-circle' : 'bell'} size={13} color={c.soft} />
          <Text style={[type.small, { color: c.soft }]}>
            {thought.done_at ? 'Done' : thought.remind_at ? dueLabel(thought.remind_at) : 'To do'}
          </Text>
        </View>
      ) : null}
      {sub ? <Text style={[type.small, { color: c.soft }]}>{sub}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  entry: { gap: 6, paddingVertical: 16, paddingHorizontal: 24 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  main: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  thumb: { width: 64, height: 64, borderRadius: 12 },
});

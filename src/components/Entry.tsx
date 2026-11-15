import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Thought } from '@/db/types';
import { clock, highlightRuns, hostOf, titleOf, when } from '@/lib/text';
import { kindLabel, type, useTheme } from '@/theme';

import { KindGlyph } from './ui';

export function entryMeta(t: Thought): string {
  const parts = [kindLabel[t.kind]];
  if (t.source === 'share') parts[0] = `${parts[0]}, shared`;
  if (t.source === 'clipboard') parts[0] = `${parts[0]}, pasted`;
  if (t.kind === 'voice' && t.duration_ms) parts.push(clock(t.duration_ms));
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
  const text = titleOf(thought);
  const runs = query ? highlightRuns(text, query) : [{ text, hit: false }];
  const host = hostOf(thought.url);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
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
      <Text style={[size === 'small' ? type.thoughtSmall : type.thought, { color: c.ink }]} numberOfLines={4}>
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
      {host && thought.body.trim() ? <Text style={[type.small, { color: c.soft }]}>{host}</Text> : null}
      {sub ? <Text style={[type.small, { color: c.soft }]}>{sub}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  entry: { gap: 6, paddingVertical: 16, paddingHorizontal: 24 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});

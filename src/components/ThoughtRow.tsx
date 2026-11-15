import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Thought } from '@/db/types';
import { clock, hostOf, relativeTime, titleOf } from '@/lib/text';
import { colors, space, type } from '@/theme';

import { KindDot } from './ui';

export function thoughtMeta(t: Thought): string {
  const parts = [relativeTime(t.created_at)];
  if (t.kind === 'voice' && t.duration_ms) parts.unshift(clock(t.duration_ms));
  const host = hostOf(t.url);
  if (host) parts.unshift(host);
  return parts.join('  ');
}

export function ThoughtRow({ thought, onPress, trailing }: { thought: Thought; onPress: () => void; trailing?: string }) {
  const title = titleOf(thought);
  const rest = thought.body.trim().split('\n').slice(1).join(' ').trim();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.inkRaised }]}>
      <View style={styles.dot}>
        <KindDot kind={thought.kind} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={2}>
          {title}
        </Text>
        {rest ? (
          <Text style={[type.small, { color: colors.textSoft }]} numberOfLines={1}>
            {rest}
          </Text>
        ) : null}
        <Text style={[type.small, { color: colors.textFaint }]}>{thoughtMeta(thought)}</Text>
      </View>
      {trailing ? <Text style={[type.small, { color: colors.textFaint }]}>{trailing}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: 14,
    alignItems: 'flex-start',
  },
  dot: { height: 23, justifyContent: 'center' },
});

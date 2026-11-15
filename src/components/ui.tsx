import { Feather } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { ThoughtKind } from '@/db/types';
import { colors, kindColor, kindLabel, radius, space, type } from '@/theme';

export type IconName = ComponentProps<typeof Feather>['name'];

export function IconButton({
  icon,
  label,
  onPress,
  tone = 'plain',
  size = 44,
  color,
  disabled,
}: {
  icon: IconName;
  /** Spoken by screen readers. */
  label: string;
  onPress: () => void;
  tone?: 'plain' | 'raised' | 'solid';
  size?: number;
  color?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.icon,
        { width: size, height: size },
        tone === 'raised' && styles.iconRaised,
        tone === 'solid' && styles.iconSolid,
        pressed && { opacity: 0.6 },
        disabled && { opacity: 0.35 },
      ]}>
      <Feather name={icon} size={Math.round(size * 0.45)} color={color ?? (tone === 'solid' ? colors.ink : colors.text)} />
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  tone = 'quiet',
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  tone?: 'quiet' | 'solid' | 'danger';
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const fg = tone === 'solid' ? colors.ink : tone === 'danger' ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === 'solid' ? styles.buttonSolid : styles.buttonQuiet,
        pressed && { opacity: 0.65 },
        style,
      ]}>
      {icon ? <Feather name={icon} size={16} color={fg} /> : null}
      <Text style={[type.bodyStrong, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function KindDot({ kind, size = 9 }: { kind: ThoughtKind; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size, backgroundColor: kindColor[kind] }} />;
}

export function KindBadge({ kind }: { kind: ThoughtKind }) {
  return (
    <View style={styles.badge}>
      <KindDot kind={kind} />
      <Text style={[type.smallStrong, { color: colors.textSoft }]}>{kindLabel[kind]}</Text>
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  leading,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  leading?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && { opacity: 0.7 }]}>
      {leading}
      <Text style={[type.smallStrong, { color: selected ? colors.text : colors.textSoft }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  iconRaised: { backgroundColor: colors.inkRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong },
  iconSolid: { backgroundColor: colors.text },
  button: {
    minHeight: 48,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonQuiet: { backgroundColor: colors.inkRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong },
  buttonSolid: { backgroundColor: colors.text },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  chipSelected: { backgroundColor: colors.inkLifted, borderColor: colors.lineStrong },
});

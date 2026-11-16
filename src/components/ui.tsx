import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { ThoughtKind } from '@/db/types';
import { font, type, useTheme } from '@/theme';

export type IconName = ComponentProps<typeof Feather>['name'];

const KIND_ICON: Record<ThoughtKind, IconName> = {
  text: 'circle',
  voice: 'mic',
  link: 'link-2',
  image: 'image',
  video: 'film',
  file: 'file-text',
};

/** Kind is shown by shape as well as position, never by colour alone. */
export function KindGlyph({ kind, size = 14 }: { kind: ThoughtKind; size?: number }) {
  const { c } = useTheme();
  return <Feather name={KIND_ICON[kind]} size={size} color={c.accent} />;
}

/** A 48 pt round icon button: the minimum comfortable target on both Android and iOS. */
export function RoundButton({
  icon,
  label,
  onPress,
  tone = 'outline',
  size = 48,
  disabled,
}: {
  icon: IconName;
  /** Spoken by screen readers. */
  label: string;
  onPress: () => void;
  tone?: 'outline' | 'solid' | 'plain';
  size?: number;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  const bg = tone === 'solid' ? c.accent : tone === 'outline' ? c.surface : 'transparent';
  const fg = tone === 'solid' ? c.onAccent : tone === 'plain' ? c.soft : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.round,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          borderColor: tone === 'outline' ? c.line : 'transparent',
          opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        },
      ]}>
      <Feather name={icon} size={Math.round(size * 0.42)} color={fg} />
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  tone = 'outline',
  icon,
  style,
  disabled,
}: {
  title: string;
  onPress: () => void;
  tone?: 'outline' | 'solid' | 'danger';
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  const fg = tone === 'solid' ? c.onAccent : tone === 'danger' ? c.danger : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: tone === 'solid' ? c.accent : c.surface,
          borderColor: tone === 'solid' ? c.accent : c.line,
          opacity: disabled ? 0.4 : pressed ? 0.65 : 1,
        },
        style,
      ]}>
      {icon ? <Feather name={icon} size={16} color={fg} /> : null}
      <Text style={[type.label, { color: fg, fontFamily: tone === 'solid' ? font.semibold : font.medium }]}>{title}</Text>
    </Pressable>
  );
}

/** A pill. With `tone` it takes a group's colour; with `selected` it inverts. */
export function Pill({
  label,
  onPress,
  tone,
  selected,
  icon,
}: {
  label: string;
  onPress?: () => void;
  tone?: number;
  selected?: boolean;
  icon?: IconName;
}) {
  const { c } = useTheme();
  const grouped = tone != null;
  const bg = grouped ? c.groupFill[tone % c.groupFill.length] : selected ? c.ink : c.surface;
  const border = grouped ? c.groupLine[tone % c.groupLine.length] : selected ? c.ink : c.line;
  const fg = !grouped && selected ? c.onInk : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={selected == null ? undefined : { selected }}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, { backgroundColor: bg, borderColor: border, opacity: pressed ? 0.7 : 1 }]}>
      {icon ? <Feather name={icon} size={14} color={fg} /> : null}
      <Text style={[type.smallStrong, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Large serif title with a line under it, and optional back link and buttons. */
export function Header({
  title,
  sub,
  back,
  children,
}: {
  title: string;
  sub?: string;
  /** Label for the back link, usually the screen you came from. */
  back?: string;
  children?: ReactNode;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.header}>
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Back to ${back}`}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={8}
          style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}>
          <Feather name="chevron-left" size={18} color={c.soft} />
          <Text style={[type.smallStrong, { color: c.soft }]}>{back}</Text>
        </Pressable>
      ) : null}
      <View style={styles.headerRow}>
        <Text style={[type.display, { color: c.ink, flex: 1 }]} numberOfLines={2}>
          {title}
        </Text>
        {children ? <View style={styles.headerButtons}>{children}</View> : null}
      </View>
      {sub ? <Text style={[type.small, { color: c.soft }]}>{sub}</Text> : null}
    </View>
  );
}

export function Notice({ text }: { text: string | null }) {
  const { c } = useTheme();
  if (!text) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.notice, { backgroundColor: c.ink }]}>
      <Text style={[type.small, { color: c.onInk }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  round: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  button: {
    minHeight: 56,
    paddingHorizontal: 22,
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pill: {
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  header: { gap: 2, paddingLeft: 24, paddingRight: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerButtons: { flexDirection: 'row', gap: 6 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 48, marginLeft: -6, alignSelf: 'flex-start' },
  notice: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16 },
});

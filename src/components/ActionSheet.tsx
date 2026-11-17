import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type, useTheme } from '@/theme';

import type { IconName } from './ui';

export type SheetOption = { label: string; icon?: IconName; danger?: boolean; onPress: () => void };

const IN = 220;
const OUT = 160;

/**
 * A menu that slides up from the bottom while the screen behind it dims. Used
 * wherever there are more choices than a system alert can hold (Android alerts
 * show three buttons at most).
 */
export function ActionSheet({
  visible,
  title,
  message,
  options,
  onClose,
}: {
  visible: boolean;
  title?: string;
  /** A few lines under the title, for a question that needs explaining. */
  message?: string;
  options: SheetOption[];
  onClose: () => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  // The modal stays mounted until the sheet has slid back down.
  const [shown, setShown] = useState(visible);
  const [height, setHeight] = useState(480);
  const [progress] = useState(() => new Animated.Value(0));
  if (visible && !shown) setShown(true);

  useEffect(() => {
    if (visible) {
      Animated.timing(progress, { toValue: 1, duration: IN, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      Animated.timing(progress, { toValue: 0, duration: OUT, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
        if (finished) setShown(false);
      });
    }
  }, [visible, progress]);

  return (
    <Modal visible={shown} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.screen}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, opacity: progress }]} />
        <Pressable style={{ flex: 1 }} accessibilityLabel="Close menu" onPress={onClose} />
        <Animated.View
          onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
          style={[
            styles.sheet,
            { backgroundColor: c.bg, borderColor: c.line, paddingBottom: insets.bottom + 12 },
            { transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }] },
          ]}>
          <View style={[styles.handle, { backgroundColor: c.line }]} />
          {title ? <Text style={[type.labelStrong, styles.title, { color: c.ink }]}>{title}</Text> : null}
          {message ? <Text style={[type.small, styles.message, { color: c.soft }]}>{message}</Text> : null}
          {/* A long menu scrolls inside the sheet, so its last choice is never off the screen. */}
          <ScrollView style={{ maxHeight: Math.round(window.height * 0.7) }} bounces={false}>
          {options.map((o) => (
            <Pressable
              key={o.label}
              accessibilityRole="button"
              onPress={() => {
                onClose();
                o.onPress();
              }}
              style={({ pressed }) => [styles.option, { backgroundColor: pressed ? c.surface : 'transparent' }]}>
              {o.icon ? <Feather name={o.icon} size={20} color={o.danger ? c.danger : c.soft} /> : null}
              <Text style={[type.body, { color: o.danger ? c.danger : c.ink }]}>{o.label}</Text>
            </Pressable>
          ))}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, paddingTop: 12 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 8 },
  title: { paddingHorizontal: 24, paddingVertical: 10 },
  message: { paddingHorizontal: 24, paddingBottom: 12 },
  option: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 24 },
});

import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hideToast, useToast } from '@/lib/toast';
import { type, useTheme } from '@/theme';

/** Shows the current short message, above the capture bar, with its one action if it has one. */
export function ToastHost() {
  const toast = useToast();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  if (!toast) return null;
  return (
    <Animated.View
      key={toast.id}
      entering={FadeInDown.duration(160)}
      exiting={FadeOutDown.duration(120)}
      accessibilityLiveRegion="polite"
      style={[styles.toast, { bottom: insets.bottom + 128, backgroundColor: c.ink }]}>
      <Text style={[type.small, { color: c.onInk, flex: 1 }]} numberOfLines={2}>
        {toast.text}
      </Text>
      {toast.action ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            toast.onAction?.();
            hideToast();
          }}
          hitSlop={8}
          style={styles.action}>
          <Text style={[type.smallStrong, { color: c.onInk, textDecorationLine: 'underline' }]}>{toast.action}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: { position: 'absolute', left: 16, right: 16, minHeight: 52, borderRadius: 16, paddingLeft: 18, paddingRight: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  action: { minHeight: 48, minWidth: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
});

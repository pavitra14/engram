import { Feather } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type, useTheme } from '@/theme';

import type { IconName } from './ui';

export type SheetOption = { label: string; icon?: IconName; danger?: boolean; onPress: () => void };

/**
 * A menu that rises from the bottom. Used wherever there are more choices than
 * a system alert can hold (Android alerts show three buttons at most).
 */
export function ActionSheet({
  visible,
  title,
  options,
  onClose,
}: {
  visible: boolean;
  title?: string;
  options: SheetOption[];
  onClose: () => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={[styles.screen, { backgroundColor: c.scrim }]}>
        <Pressable style={{ flex: 1 }} accessibilityLabel="Close menu" onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: c.bg, borderColor: c.line, paddingBottom: insets.bottom + 12 }]}>
          <View style={[styles.handle, { backgroundColor: c.line }]} />
          {title ? <Text style={[type.labelStrong, styles.title, { color: c.ink }]}>{title}</Text> : null}
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
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, paddingTop: 12 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 8 },
  title: { paddingHorizontal: 24, paddingVertical: 10 },
  option: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 24 },
});

import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RoundButton } from '@/components/ui';
import { captureText } from '@/lib/capture';
import { font, type, useTheme } from '@/theme';

/** The notepad: a full page for longer notes. The first line becomes the title in lists. */
export default function ComposeScreen() {
  const db = useSQLiteContext();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ text?: string }>();
  const [text, setText] = useState(() => (typeof params.text === 'string' ? params.text : ''));
  const [saving, setSaving] = useState(false);
  const has = text.trim().length > 0;
  const words = has ? text.trim().split(/\s+/).length : 0;

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const close = () => {
    if (!has) {
      leave();
      return;
    }
    Alert.alert('Discard this note?', 'What you wrote has not been saved.', [
      { text: 'Keep writing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: leave },
    ]);
  };

  const save = async () => {
    if (!has || saving) return;
    setSaving(true);
    try {
      await captureText(db, text);
      leave();
    } catch (e) {
      setSaving(false);
      Alert.alert('The note was not saved', e instanceof Error ? e.message : 'Try again.');
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
        <RoundButton icon="x" label="Close the editor" tone="plain" onPress={close} />
        <Text style={[type.meta, { color: c.soft }]}>{words === 0 ? 'New note' : `${words} ${words === 1 ? 'word' : 'words'}`}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save note"
          disabled={!has || saving}
          onPress={save}
          style={({ pressed }) => [styles.save, { backgroundColor: c.accent, opacity: !has || saving ? 0.4 : pressed ? 0.7 : 1 }]}>
          <Text style={[type.labelStrong, { color: c.onAccent }]}>Save</Text>
        </Pressable>
      </View>
      <TextInput
        autoFocus
        multiline
        value={text}
        onChangeText={setText}
        placeholder="Start writing. The first line becomes the title."
        placeholderTextColor={c.faint}
        accessibilityLabel="Note text"
        textAlignVertical="top"
        style={[styles.page, { color: c.ink, paddingBottom: insets.bottom + 24 }]}
        selectionColor={c.accent}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 8 },
  save: { height: 48, paddingHorizontal: 22, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  page: { flex: 1, paddingHorizontal: 24, paddingTop: 12, fontFamily: font.serif, fontSize: 21, lineHeight: 31 },
});

import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormatBar, NoteEditor, type NoteEditorHandle } from '@/components/NoteEditor';
import { RoundButton } from '@/components/ui';
import { useDb } from '@/db/provider';
import { captureNote } from '@/lib/capture';
import { when } from '@/lib/text';
import { type, useTheme } from '@/theme';

/** A new note: a title and a body with formatting. Opened from the capture bar, a widget, or a calendar event. */
export default function ComposeScreen() {
  const db = useDb();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ text?: string; title?: string; event_id?: string; event_at?: string }>();
  const editor = useRef<NoteEditorHandle | null>(null);
  const [has, setHas] = useState(() => !!(params.text || params.title));
  const [typed, setTyped] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inBody, setInBody] = useState(false);
  const [active, setActive] = useState({});
  const eventAt = params.event_at ? Number(params.event_at) : null;

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const close = () => {
    if (!typed) {
      leave();
      return;
    }
    Alert.alert('Discard this note?', 'What you wrote has not been saved.', [
      { text: 'Keep writing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: leave },
    ]);
  };

  const save = async () => {
    if (!has || saving || !editor.current) return;
    setSaving(true);
    try {
      const note = await editor.current.value();
      if (!note.title.trim() && !note.text.trim()) {
        setSaving(false);
        return;
      }
      await captureNote(
        db,
        note,
        params.event_id ? { event_id: params.event_id, event_title: params.title ?? null, event_at: eventAt } : {},
      );
      leave();
    } catch (e) {
      setSaving(false);
      Alert.alert('The note was not saved', e instanceof Error ? e.message : 'Try again.');
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
        <RoundButton icon="x" label="Close without saving" tone="plain" onPress={close} />
        <Text style={[type.meta, { color: c.soft }]}>{eventAt ? `For ${when(eventAt)}` : 'New note'}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save note"
          disabled={!has || saving}
          onPress={save}
          style={({ pressed }) => [styles.save, { backgroundColor: c.accent, opacity: !has || saving ? 0.4 : pressed ? 0.7 : 1 }]}>
          <Text style={[type.labelStrong, { color: c.onAccent }]}>Save</Text>
        </Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 48 }}>
        <NoteEditor
          ref={editor}
          initialTitle={params.title}
          initialText={params.text}
          autoFocus={params.title ? 'body' : 'title'}
          bodyPlaceholder="Write here. Lists, headings and check boxes are in the bar above the keyboard."
          onChange={(v) => {
            setTyped(true);
            setHas(v.title.trim().length > 0 || v.text.trim().length > 0);
          }}
          onFocusBody={setInBody}
          onActive={setActive}
        />
      </ScrollView>
      {inBody ? <FormatBar active={active} onFormat={(k) => editor.current?.format(k)} /> : <View style={{ height: insets.bottom }} />}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 8 },
  save: { height: 48, paddingHorizontal: 22, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});

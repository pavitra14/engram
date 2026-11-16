import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Keyboard, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { captureText } from '@/lib/capture';
import { font, type, useTheme } from '@/theme';

import { Notice, RoundButton } from './ui';

/**
 * Knows whether the clipboard holds text, without reading it. Reading happens
 * only when the person taps the prompt, so the system's "pasted from
 * clipboard" notice appears only for a paste they asked for.
 */
function useClipboardPrompt() {
  const [available, setAvailable] = useState(false);

  const check = useCallback(() => {
    Clipboard.hasStringAsync()
      .then(setAvailable)
      .catch(() => setAvailable(false));
  }, []);

  useEffect(() => {
    check();
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    const clip = Clipboard.addClipboardListener(() => check());
    return () => {
      app.remove();
      Clipboard.removeClipboardListener(clip);
    };
  }, [check]);

  return { available, dismiss: () => setAvailable(false) };
}

/**
 * The one place thoughts enter the app. Type and send, tap the mic to talk,
 * open the full-page editor for a longer note, or save what you just copied.
 */
export function CaptureBar({ clipboard = false }: { clipboard?: boolean }) {
  const db = useSQLiteContext();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const clip = useClipboardPrompt();
  const hasDraft = draft.trim().length > 0;

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3600);
    return () => clearTimeout(t);
  }, [notice]);

  const save = async (text: string, source?: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await captureText(db, text, source);
      return true;
    } catch (e) {
      setNotice(`Could not save that. ${e instanceof Error ? e.message : ''}`.trim());
      return false;
    }
  };

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    Keyboard.dismiss();
    if (!(await save(body))) setDraft(body);
  };

  const paste = async () => {
    try {
      const text = (await Clipboard.getStringAsync()).trim();
      clip.dismiss();
      if (!text) {
        setNotice('The clipboard has no text to save.');
        return;
      }
      if (await save(text, 'clipboard')) setNotice('Saved from your clipboard.');
    } catch {
      setNotice('The clipboard could not be read.');
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.wrap} pointerEvents="box-none">
      <View style={[styles.inner, { paddingBottom: insets.bottom + 12, backgroundColor: c.bg }]}>
        <Notice text={notice} />

        {clipboard && clip.available && !hasDraft ? (
          <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOutDown.duration(160)} style={styles.clipRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Reads your clipboard and saves it as a thought"
              onPress={paste}
              style={({ pressed }) => [
                styles.clip,
                { backgroundColor: c.surface, borderColor: c.line, opacity: pressed ? 0.7 : 1 },
              ]}>
              <Feather name="clipboard" size={16} color={c.accent} />
              <Text style={[type.smallStrong, { color: c.ink }]}>Save what you copied</Text>
            </Pressable>
            <RoundButton icon="x" label="Hide the clipboard prompt" tone="plain" onPress={clip.dismiss} />
          </Animated.View>
        ) : null}

        <View style={styles.row}>
          <View style={[styles.field, { backgroundColor: c.surface, borderColor: c.line }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Write a thought"
              placeholderTextColor={c.faint}
              accessibilityLabel="New thought"
              multiline
              style={[styles.input, { color: c.ink }]}
              selectionColor={c.accent}
            />
            {!hasDraft ? (
              <RoundButton
                icon="maximize-2"
                label="Open the full-page editor"
                tone="plain"
                onPress={() => router.push('/compose')}
              />
            ) : null}
          </View>
          {hasDraft ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save thought"
              onPress={send}
              style={({ pressed }) => [styles.primary, { backgroundColor: c.accent, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
              <Feather name="arrow-up" size={26} color={c.onAccent} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Record a voice note"
              onPress={() => {
                Keyboard.dismiss();
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push('/voice');
              }}
              style={({ pressed }) => [styles.primary, { backgroundColor: c.accent, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
              <Feather name="mic" size={26} color={c.onAccent} />
            </Pressable>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/** Space a scrolling screen should leave so its last row clears the bar. */
export const CAPTURE_BAR_SPACE = 120;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  inner: { paddingHorizontal: 16, paddingTop: 10, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  field: {
    flex: 1,
    minHeight: 64,
    borderRadius: 32,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 22,
    paddingRight: 8,
  },
  input: { flex: 1, maxHeight: 132, paddingVertical: 12, fontFamily: font.regular, fontSize: 16, lineHeight: 22 },
  primary: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  clipRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  clip: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
  },
});

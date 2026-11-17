import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useDb } from '@/db/provider';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Keyboard, KeyboardAvoidingView, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { captureFile, captureText, saveNote } from '@/lib/capture';
import { wordsInPicture } from '@/lib/ocr';
import { font, useTheme } from '@/theme';

import { ActionSheet } from './ActionSheet';
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
 * open the full note editor, attach a file, or save what you just copied.
 */
export function CaptureBar({ clipboard = false }: { clipboard?: boolean }) {
  const db = useDb();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
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

  const pickMedia = async () => {
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, quality: 1 });
      if (picked.canceled) return;
      for (const a of picked.assets) {
        await captureFile(db, a.uri, { mimeType: a.mimeType, name: a.fileName, durationMs: a.duration ?? null });
      }
      setNotice(picked.assets.length === 1 ? 'Saved.' : `Saved ${picked.assets.length} items.`);
    } catch (e) {
      setNotice(`Could not add that. ${e instanceof Error ? e.message : ''}`.trim());
    }
  };

  // Photograph a page or a whiteboard: the picture is kept, and the words on it become the note's body.
  const scan = async () => {
    try {
      const may = await ImagePicker.requestCameraPermissionsAsync();
      if (!may.granted) {
        setNotice('Camera access is off. Turn it on in system settings to scan paper.');
        return;
      }
      const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.9 });
      if (shot.canceled || !shot.assets[0]) return;
      const a = shot.assets[0];
      const saved = await captureFile(db, a.uri, { mimeType: a.mimeType ?? 'image/jpeg', name: a.fileName, source: 'scan' });
      const words = saved.media_path ? await wordsInPicture(saved.media_path).catch(() => '') : '';
      if (words) await saveNote(db, saved.id, { title: '', text: words, html: null });
      setNotice(words ? 'Scanned. The words are in the note.' : 'Saved the picture. No words could be read from it.');
      router.push({ pathname: '/thought/[id]', params: { id: saved.id } });
    } catch (e) {
      setNotice(`Could not scan that. ${e instanceof Error ? e.message : ''}`.trim());
    }
  };

  const pickFiles = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (picked.canceled) return;
      for (const a of picked.assets) await captureFile(db, a.uri, { mimeType: a.mimeType, name: a.name });
      setNotice(picked.assets.length === 1 ? 'Saved.' : `Saved ${picked.assets.length} files.`);
    } catch (e) {
      setNotice(`Could not add that. ${e instanceof Error ? e.message : ''}`.trim());
    }
  };

  const attach = () => {
    Keyboard.dismiss();
    setAttaching(true);
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.wrap} pointerEvents="box-none">
      <View style={[styles.inner, { paddingBottom: insets.bottom + 12, backgroundColor: c.bg }]}>
        <Notice text={notice} />

        <View style={styles.row}>
          {!hasDraft ? (
            <View style={styles.attach}>
              <RoundButton icon="plus" label="Add a photo, video or file" onPress={attach} />
            </View>
          ) : null}
          {clipboard && clip.available && !hasDraft ? (
            <View style={styles.attach}>
              <RoundButton icon="clipboard" label="Save what you copied as a thought" onPress={paste} />
            </View>
          ) : null}
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
                label="Write a note with a title and formatting"
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
      <ActionSheet
        visible={attaching}
        title="Add to Engram"
        onClose={() => setAttaching(false)}
        options={[
          { label: 'Photo or video', icon: 'image', onPress: () => void pickMedia() },
          { label: 'File', icon: 'file-text', onPress: () => void pickFiles() },
          { label: 'Scan paper or a whiteboard', icon: 'camera', onPress: () => void scan() },
        ]}
      />
    </KeyboardAvoidingView>
  );
}

/** Space a scrolling screen should leave so its last row clears the bar. */
export const CAPTURE_BAR_SPACE = 120;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  inner: { paddingHorizontal: 16, paddingTop: 10, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  attach: { height: 64, justifyContent: 'center' },
  field: {
    flex: 1,
    minHeight: 64,
    borderRadius: 32,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    paddingRight: 6,
  },
  input: { flex: 1, maxHeight: 132, paddingVertical: 12, fontFamily: font.regular, fontSize: 16, lineHeight: 22 },
  primary: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
});

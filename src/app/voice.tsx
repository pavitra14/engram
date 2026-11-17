import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Notice } from '@/components/ui';
import { clock } from '@/lib/text';
import { useVoice } from '@/lib/useVoice';
import { type, useTheme } from '@/theme';
import { count, M } from '@/lib/usage';

const BARS = 24;

function Timer({ since }: { since: number }) {
  const { c } = useTheme();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  return <Text style={[type.label, { color: c.soft, fontVariant: ['tabular-nums'] }]}>{since ? clock(now - since) : '0:00'}</Text>;
}

/** Full-screen voice capture: your words appear as you speak, with one big button to save. */
export default function VoiceScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  useEffect(() => {
    if (from === 'widget') count(M.fromWidget);
    else if (from === 'shortcut' || from === 'tile') count(M.fromTileOrShortcut);
  }, [from]);
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [notice, setNotice] = useState<string | null>(null);
  const voice = useVoice(setNotice);
  const [levels, setLevels] = useState<number[]>(() => new Array(BARS).fill(0));
  const began = useRef(false);
  const wasActive = useRef(false);
  const { start, phase, level } = voice;

  useEffect(() => {
    if (began.current) return;
    began.current = true;
    void start();
  }, [start]);

  // Leave once the note is saved or discarded.
  useEffect(() => {
    if (phase !== 'idle') {
      wasActive.current = true;
      return;
    }
    if (!wasActive.current) return;
    const t = setTimeout(() => (router.canGoBack() ? router.back() : router.replace('/')), notice ? 1800 : 0);
    return () => clearTimeout(t);
  }, [phase, notice]);

  useEffect(() => {
    if (phase !== 'listening') return;
    const t = setInterval(() => setLevels((prev) => [...prev.slice(1), level]), 110);
    return () => clearInterval(t);
  }, [phase, level]);

  const saving = phase === 'saving';
  const transcribing = voice.mode === 'transcribe';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }}>
      <View style={styles.top}>
        <View style={styles.status}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: phase === 'listening' ? c.accent : c.faint }} />
          <Text style={[type.label, { color: c.ink }]}>
            {saving ? 'Saving' : phase === 'idle' ? 'Getting ready' : transcribing ? 'Listening' : 'Recording audio'}
          </Text>
        </View>
        <Timer since={phase === 'listening' ? voice.startedAt : 0} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.words}>
        <Text style={[styles.transcript, { color: voice.text ? c.ink : c.faint }]}>
          {voice.text || (transcribing ? 'Say what is on your mind.' : 'This note is saved as audio, without a transcript.')}
        </Text>
      </ScrollView>

      <View style={styles.bottom}>
        <Notice text={notice} />
        <View style={styles.bars} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {levels.map((l, i) => (
            <View key={i} style={{ width: 6, borderRadius: 3, height: 8 + Math.round(l * 52), backgroundColor: c.accent, opacity: 0.35 + l * 0.65 }} />
          ))}
        </View>
        <Text style={[type.small, { color: c.soft, textAlign: 'center' }]}>
          {transcribing ? 'Transcribed on this phone. Audio never leaves it.' : 'Recorded on this phone. Audio never leaves it.'}
        </Text>
        <View style={styles.actions}>
          <Button title="Discard" onPress={voice.cancel} disabled={phase !== 'listening'} style={styles.side} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save voice note"
            disabled={phase !== 'listening'}
            onPress={voice.stop}
            style={({ pressed }) => [
              styles.save,
              { backgroundColor: c.accent, opacity: phase !== 'listening' ? 0.4 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] },
            ]}>
            <Feather name="check" size={38} color={c.onAccent} />
          </Pressable>
          <View style={styles.side} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  words: { paddingHorizontal: 24, paddingTop: 40, paddingBottom: 24 },
  transcript: { fontFamily: 'Newsreader_400Regular', fontSize: 32, lineHeight: 42, letterSpacing: -0.4 },
  bottom: { paddingHorizontal: 24, gap: 18 },
  bars: { height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  side: { width: 112 },
  save: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
});

import * as Haptics from 'expo-haptics';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { captureText } from '@/lib/capture';
import { clock } from '@/lib/text';
import { useVoice } from '@/lib/useVoice';
import { colors, font, kindColor, radius, space, type } from '@/theme';

import { IconButton } from './ui';

function Timer({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  return <Text style={[type.smallStrong, styles.timer]}>{clock(now - since)}</Text>;
}

function LevelOrb({ level }: { level: number }) {
  const s = useSharedValue(1);
  useEffect(() => {
    s.set(withSpring(1 + level * 1.1, { damping: 14, stiffness: 180 }));
  }, [level, s]);
  const halo = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <View style={styles.orbWrap}>
      <Animated.View style={[styles.orbHalo, halo]} />
      <View style={styles.orb} />
    </View>
  );
}

/** The one place thoughts enter the app: type and send, or tap the mic and talk. */
export function CaptureDock({ onNotice }: { onNotice: (message: string) => void }) {
  const db = useSQLiteContext();
  const [draft, setDraft] = useState('');
  const voice = useVoice(onNotice);
  const hasDraft = draft.trim().length > 0;

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    Keyboard.dismiss();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await captureText(db, body);
    } catch (e) {
      setDraft(body);
      onNotice(`Could not save that thought. ${e instanceof Error ? e.message : ''}`.trim());
    }
  };

  if (voice.phase !== 'idle') {
    const saving = voice.phase === 'saving';
    return (
      <View style={[styles.dock, styles.dockVoice]}>
        <View style={styles.voiceHead}>
          <LevelOrb level={saving ? 0 : voice.level} />
          <Text style={[type.smallStrong, { color: colors.textSoft, flex: 1 }]}>
            {saving ? 'Saving' : voice.mode === 'transcribe' ? 'Listening' : 'Recording audio'}
          </Text>
          {!saving && <Timer since={voice.startedAt} />}
        </View>
        <Text style={[type.body, styles.transcript]} numberOfLines={5}>
          {voice.text ||
            (voice.mode === 'transcribe' ? 'Say what is on your mind.' : 'This note is saved as audio, without a transcript.')}
        </Text>
        <View style={styles.voiceActions}>
          <IconButton icon="x" label="Discard recording" tone="raised" onPress={voice.cancel} disabled={saving} />
          <IconButton icon="check" label="Save voice note" tone="solid" size={52} onPress={voice.stop} disabled={saving} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.dock}>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="Capture a thought"
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        multiline
        selectionColor={kindColor.text}
        accessibilityLabel="New thought"
      />
      {hasDraft ? (
        <IconButton icon="arrow-up" label="Save thought" tone="solid" onPress={send} />
      ) : (
        <IconButton
          icon="mic"
          label="Record a voice note"
          tone="raised"
          color={kindColor.voice}
          onPress={() => {
            Keyboard.dismiss();
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            void voice.start();
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    paddingLeft: space.md + 4,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: radius.sheet,
    backgroundColor: 'rgba(18, 23, 51, 0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
  },
  dockVoice: { flexDirection: 'column', alignItems: 'stretch', padding: space.md, gap: space.sm },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 132,
    paddingVertical: 10,
    color: colors.text,
    fontFamily: font.regular,
    fontSize: 15.5,
    lineHeight: 22,
  },
  voiceHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  timer: { color: colors.textSoft, fontVariant: ['tabular-nums'] },
  transcript: { color: colors.text, minHeight: 46 },
  voiceActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orbWrap: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  orbHalo: { position: 'absolute', width: 14, height: 14, borderRadius: 14, backgroundColor: 'rgba(95, 227, 208, 0.28)' },
  orb: { width: 10, height: 10, borderRadius: 10, backgroundColor: kindColor.voice },
});

import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { type SharePayload, useIncomingShare } from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { entryMeta } from '@/components/Entry';
import { Button, KindGlyph } from '@/components/ui';
import type { Thought } from '@/db/types';
import { loadBrain, placement } from '@/lib/brain';
import { capture, captureText, importMedia } from '@/lib/capture';
import { firstUrl, titleOf } from '@/lib/text';
import { type, useTheme } from '@/theme';

type State = { phase: 'saving' } | { phase: 'saved'; first: Thought; count: number; where: string } | { phase: 'failed'; message: string };

async function savePayload(db: ReturnType<typeof useSQLiteContext>, p: SharePayload): Promise<Thought | null> {
  const value = p.value?.trim();
  if (!value) return null;
  const kind = p.shareType ?? 'text';
  if (kind === 'text' || kind === 'url') return captureText(db, value, 'share');
  if (kind === 'image') {
    return capture(db, { kind: 'image', body: '', media_path: await importMedia(value, p.mimeType, 'jpg'), source: 'share' });
  }
  if (kind === 'audio') {
    return capture(db, { kind: 'voice', body: '', media_path: await importMedia(value, p.mimeType, 'm4a'), source: 'share' });
  }
  // Files and video are not supported yet; keep a link if the value is one.
  return firstUrl(value) ? captureText(db, value, 'share') : null;
}

/**
 * Shown when another app shares something to Engram. Saves at once, says where
 * the item landed, then steps out of the way so you return to what you were doing.
 */
export default function HandleShareScreen() {
  const db = useSQLiteContext();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { sharedPayloads, clearSharedPayloads } = useIncomingShare();
  const [state, setState] = useState<State>({ phase: 'saving' });
  const [stay, setStay] = useState(false);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    if (sharedPayloads.length === 0) {
      const t = setTimeout(() => {
        if (!handled.current) router.replace('/');
      }, 700);
      return () => clearTimeout(t);
    }
    handled.current = true;
    (async () => {
      try {
        const saved: Thought[] = [];
        for (const p of sharedPayloads) {
          const t = await savePayload(db, p);
          if (t) saved.push(t);
        }
        clearSharedPayloads();
        if (saved.length === 0) {
          setState({ phase: 'failed', message: 'Engram can save text, links, images and audio. This item is none of those.' });
          return;
        }
        const brain = await loadBrain(db, Date.now());
        setState({ phase: 'saved', first: saved[0], count: saved.length, where: placement(brain, saved[0]) });
      } catch (e) {
        setState({ phase: 'failed', message: e instanceof Error ? e.message : 'The item could not be saved.' });
      }
    })();
  }, [db, sharedPayloads, clearSharedPayloads]);

  const leave = () => {
    router.replace('/');
    BackHandler.exitApp();
  };

  useEffect(() => {
    if (state.phase !== 'saved' || stay) return;
    const t = setTimeout(leave, 2600);
    return () => clearTimeout(t);
  }, [state.phase, stay]);

  return (
    <Animated.View entering={FadeIn.duration(160)} style={[styles.screen, { backgroundColor: c.scrim }]}>
      <Pressable style={{ flex: 1 }} accessibilityLabel="Close" onPress={leave} />
      <Animated.View
        entering={SlideInDown.duration(260)}
        accessibilityLiveRegion="polite"
        style={[styles.sheet, { backgroundColor: c.bg, borderColor: c.line, paddingBottom: insets.bottom + 20 }]}>
        <View style={[styles.handle, { backgroundColor: c.line }]} />
        {state.phase === 'saved' ? (
          <>
            <View style={styles.head}>
              <View style={[styles.tick, { backgroundColor: c.accent }]}>
                <Feather name="check" size={22} color={c.onAccent} />
              </View>
              <Text style={[type.title, { color: c.ink }]}>{state.count === 1 ? 'Saved to Engram' : `Saved ${state.count} items`}</Text>
            </View>
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
              <View style={styles.meta}>
                <KindGlyph kind={state.first.kind} />
                <Text style={[type.meta, { color: c.soft }]}>{entryMeta(state.first)}</Text>
              </View>
              <Text style={[type.thought, { color: c.ink }]} numberOfLines={3}>
                {titleOf(state.first)}
              </Text>
              <Text style={[type.small, { color: c.soft }]}>{state.where}</Text>
            </View>
            <View style={styles.buttons}>
              <Button
                title="Add a note"
                style={{ flex: 1 }}
                onPress={() => {
                  setStay(true);
                  router.replace({ pathname: '/thought/[id]', params: { id: state.first.id } });
                }}
              />
              <Button title="Done" tone="solid" style={{ flex: 1 }} onPress={leave} />
            </View>
            <Text style={[type.meta, { color: c.soft, textAlign: 'center' }]}>This closes on its own if you do nothing.</Text>
          </>
        ) : state.phase === 'failed' ? (
          <>
            <Text style={[type.title, { color: c.ink }]}>Not saved</Text>
            <Text style={[type.body, { color: c.soft }]}>{state.message}</Text>
            <Button title="Open Engram" onPress={() => router.replace('/')} />
          </>
        ) : (
          <Text style={[type.title, { color: c.soft }]}>Saving</Text>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, paddingHorizontal: 24, paddingTop: 12, gap: 18 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  tick: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 16, borderRadius: 20, borderWidth: 1, gap: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttons: { flexDirection: 'row', gap: 12 },
});

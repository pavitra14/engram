import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { type SharePayload, useIncomingShare } from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { capture, captureText, importMedia } from '@/lib/capture';
import { firstUrl } from '@/lib/text';
import { colors, kindColor, radius, space, type } from '@/theme';

type State = { phase: 'saving' } | { phase: 'saved'; count: number } | { phase: 'failed'; message: string };

async function savePayload(db: ReturnType<typeof useSQLiteContext>, p: SharePayload): Promise<boolean> {
  const value = p.value?.trim();
  if (!value) return false;
  const kind = p.shareType ?? 'text';
  if (kind === 'text' || kind === 'url') {
    await captureText(db, value, 'share');
    return true;
  }
  if (kind === 'image') {
    const media = await importMedia(value, p.mimeType, 'jpg');
    await capture(db, { kind: 'image', body: '', media_path: media, source: 'share' });
    return true;
  }
  if (kind === 'audio') {
    const media = await importMedia(value, p.mimeType, 'm4a');
    await capture(db, { kind: 'voice', body: '', media_path: media, source: 'share' });
    return true;
  }
  // Files and video are not supported yet; keep a link if the value is one.
  if (firstUrl(value)) {
    await captureText(db, value, 'share');
    return true;
  }
  return false;
}

/**
 * Shown when another app shares something to Engram. Saves at once, confirms,
 * then steps out of the way so you land back where you were.
 */
export default function HandleShareScreen() {
  const db = useSQLiteContext();
  const { sharedPayloads, clearSharedPayloads } = useIncomingShare();
  const [state, setState] = useState<State>({ phase: 'saving' });
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    if (sharedPayloads.length === 0) {
      // Opened without anything to save (for example after a restart).
      const t = setTimeout(() => {
        if (!handled.current) router.replace('/');
      }, 600);
      return () => clearTimeout(t);
    }
    handled.current = true;
    (async () => {
      try {
        let count = 0;
        for (const p of sharedPayloads) if (await savePayload(db, p)) count += 1;
        clearSharedPayloads();
        setState(
          count > 0
            ? { phase: 'saved', count }
            : { phase: 'failed', message: 'Engram can save text, links, images and audio. This item is none of those.' },
        );
      } catch (e) {
        setState({ phase: 'failed', message: e instanceof Error ? e.message : 'The item could not be saved.' });
      }
    })();
  }, [db, sharedPayloads, clearSharedPayloads]);

  useEffect(() => {
    if (state.phase !== 'saved') return;
    const t = setTimeout(() => {
      router.replace('/');
      BackHandler.exitApp();
    }, 1300);
    return () => clearTimeout(t);
  }, [state.phase]);

  return (
    <View style={styles.screen}>
      <View style={styles.card} accessibilityLiveRegion="polite">
        {state.phase === 'saved' ? (
          <>
            <View style={styles.tick}>
              <Feather name="check" size={26} color={colors.ink} />
            </View>
            <Text style={[type.title, { color: colors.text }]}>
              {state.count === 1 ? 'Saved to Engram' : `Saved ${state.count} items to Engram`}
            </Text>
            <Button title="Open Engram" onPress={() => router.replace('/')} />
          </>
        ) : state.phase === 'failed' ? (
          <>
            <Text style={[type.title, { color: colors.text }]}>Not saved</Text>
            <Text style={[type.body, { color: colors.textSoft, textAlign: 'center' }]}>{state.message}</Text>
            <Button title="Open Engram" onPress={() => router.replace('/')} />
          </>
        ) : (
          <Text style={[type.title, { color: colors.textSoft }]}>Saving</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  card: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: space.md,
    padding: space.xl,
    borderRadius: radius.sheet,
    backgroundColor: colors.inkRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
  },
  tick: {
    width: 56,
    height: 56,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: kindColor.voice,
  },
});

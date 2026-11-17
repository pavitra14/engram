import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  clearSharedPayloads,
  getResolvedSharedPayloadsAsync,
  getSharedPayloads,
  type ResolvedSharePayload,
  type SharePayload,
} from 'expo-sharing';
import { File } from 'expo-file-system';
import { useDb } from '@/db/provider';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { entryMeta } from '@/components/Entry';
import { Button, KindGlyph } from '@/components/ui';
import type { Thought } from '@/db/types';
import { loadBrain, placement } from '@/lib/brain';
import type { Db } from '@/db/db';
import * as repo from '@/db/repo';
import { captureFile, captureText, mergeInto } from '@/lib/capture';
import { firstUrl, titleOf } from '@/lib/text';
import { font, type, useTheme } from '@/theme';

type State =
  | { phase: 'saving' }
  | { phase: 'saved'; first: Thought; all: Thought[]; count: number; where: string; into?: boolean }
  | { phase: 'failed'; message: string };

/** The brain as it is this moment, not a cached one. */
const freshBrain = (db: Db) => loadBrain(db, Date.now());

const isWords = (p: SharePayload) => p.shareType === 'text' || p.shareType === 'url';

/** The copy of a shared file that the share library made in Engram's cache, if it made one. */
function cachedCopy(r: ResolvedSharePayload | undefined): string | null {
  const uri = r?.contentUri;
  if (!uri || !uri.startsWith('file:')) return null;
  try {
    return new File(uri).exists ? uri : null;
  } catch {
    return null;
  }
}

async function savePayload(
  db: Db,
  p: SharePayload,
  resolved: ResolvedSharePayload | undefined,
): Promise<Thought | null> {
  const value = p.value?.trim();
  if (!value) return null;
  const kind = p.shareType;
  if (kind === 'text' || kind === 'url') return captureText(db, value, 'share');
  if (kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'file') {
    // A shared "file" whose value is really a web address is kept as a link.
    if (kind === 'file' && /^https?:\/\//i.test(value)) return captureText(db, value, 'share');
    const mimeType = resolved?.contentMimeType ?? p.mimeType ?? undefined;
    const name = resolved?.originalName && resolved.originalName !== 'unknown' ? resolved.originalName : undefined;
    return captureFile(db, cachedCopy(resolved) ?? value, { mimeType, name, source: 'share' });
  }
  return firstUrl(value) ? captureText(db, value, 'share') : null;
}

/**
 * Shown when another app shares something to Engram. Saves at once, says where
 * the item landed, then steps out of the way so you return to what you were doing.
 */
export default function HandleShareScreen() {
  const db = useDb();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  // Read once, directly. The library's hook also "resolves" every share, which for a shared
  // web address means fetching it. Engram never goes online with what you share.
  const [sharedPayloads] = useState<SharePayload[]>(() => getSharedPayloads());
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
        // Files are copied into Engram's cache by the share library; that step is local.
        // It is skipped when the share is words or a web address, because there it would go online.
        let resolved: ResolvedSharePayload[] = [];
        if (!sharedPayloads.some(isWords)) {
          resolved = await getResolvedSharedPayloadsAsync().catch(() => []);
        }
        const saved: Thought[] = [];
        for (const p of sharedPayloads) {
          const t = await savePayload(db, p, resolved.find((r) => r.value === p.value));
          if (t) saved.push(t);
        }
        clearSharedPayloads();
        if (saved.length === 0) {
          setState({ phase: 'failed', message: 'There was nothing in that share that Engram could save.' });
          return;
        }
        const brain = await loadBrain(db, Date.now());
        setState({ phase: 'saved', first: saved[0], all: saved, count: saved.length, where: placement(brain, saved[0]) });
      } catch (e) {
        console.log('engram: share failed', e instanceof Error ? e.message : String(e));
        setState({ phase: 'failed', message: 'The item could not be copied into Engram. Try sharing it again.' });
      }
    })();
  }, [db, sharedPayloads]);

  // "Add to another note": pick from the latest notes, or search for one.
  const [choosing, setChoosing] = useState(false);
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState<Thought[]>([]);
  useEffect(() => {
    if (!choosing || state.phase !== 'saved') return;
    let live = true;
    const mine = new Set(state.all.map((t) => t.id));
    const timer = setTimeout(async () => {
      const rows = query.trim() ? await repo.searchThoughts(db, query, { limit: 20 }) : await repo.listThoughts(db, { limit: 20 });
      if (live) setNotes(rows.filter((r) => !mine.has(r.id) && (r.kind === 'text' || r.kind === 'link')).slice(0, 5));
    }, 120);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [db, choosing, query, state]);

  const addTo = async (target: Thought) => {
    if (state.phase !== 'saved') return;
    setChoosing(false);
    const merged = await mergeInto(db, state.all, target.id);
    if (!merged) return;
    const brain = await freshBrain(db);
    setState({ phase: 'saved', first: merged, all: [merged], count: 1, where: placement(brain, merged), into: true });
    setStay(false);
  };

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
        {state.phase === 'saved' && choosing ? (
          <>
            <Text style={[type.title, { color: c.ink }]}>Add to which note?</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Find a note"
              placeholderTextColor={c.faint}
              accessibilityLabel="Find a note to add this to"
              style={[styles.find, { color: c.ink, borderColor: c.line, backgroundColor: c.surface }]}
              selectionColor={c.accent}
            />
            <View>
              {notes.map((n) => (
                <Pressable key={n.id} accessibilityRole="button" onPress={() => void addTo(n)} style={({ pressed }) => [styles.pick, { borderBottomColor: c.rule, opacity: pressed ? 0.6 : 1 }]}>
                  <Text style={[type.thoughtSmall, { color: c.ink }]} numberOfLines={1}>
                    {titleOf(n)}
                  </Text>
                </Pressable>
              ))}
              {notes.length === 0 ? <Text style={[type.small, { color: c.soft }]}>No notes match. It stays saved as its own note.</Text> : null}
            </View>
            <Button title="Keep it as its own note" onPress={() => setChoosing(false)} />
          </>
        ) : state.phase === 'saved' ? (
          <>
            <View style={styles.head}>
              <View style={[styles.tick, { backgroundColor: c.accent }]}>
                <Feather name="check" size={22} color={c.onAccent} />
              </View>
              <Text style={[type.title, { color: c.ink }]}>{state.into ? 'Added to your note' : state.count === 1 ? 'Saved to Engram' : `Saved ${state.count} items`}</Text>
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
            {state.into ? null : (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setStay(true);
                  setChoosing(true);
                }}
                style={styles.instead}>
                <Text style={[type.smallStrong, { color: c.accent }]}>Add to another note instead</Text>
              </Pressable>
            )}
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
  instead: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  find: { height: 52, borderRadius: 26, borderWidth: 1, paddingHorizontal: 18, fontFamily: font.regular, fontSize: 16 },
  pick: { minHeight: 52, justifyContent: 'center', borderBottomWidth: 1 },
});

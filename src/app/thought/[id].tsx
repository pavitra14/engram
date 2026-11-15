import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThoughtRow } from '@/components/ThoughtRow';
import { Button, Chip, IconButton, KindBadge } from '@/components/ui';
import * as repo from '@/db/repo';
import type { Tag, Thought } from '@/db/types';
import { dataChanged, useDataVersion } from '@/lib/bus';
import { relink, removeThought } from '@/lib/capture';
import { clock, hostOf, titleOf } from '@/lib/text';
import { colors, font, kindColor, radius, space, type } from '@/theme';

function AudioPlayer({ uri }: { uri: string }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const duration = status.duration || 0;
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;

  const toggle = () => {
    if (status.playing) {
      player.pause();
      return;
    }
    if (duration > 0 && status.currentTime >= duration - 0.05) void player.seekTo(0);
    player.play();
  };

  return (
    <View style={styles.player}>
      <IconButton
        icon={status.playing ? 'pause' : 'play'}
        label={status.playing ? 'Pause voice note' : 'Play voice note'}
        tone="solid"
        onPress={toggle}
      />
      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={[type.small, styles.time]}>
        {clock(status.currentTime * 1000)} / {clock(duration * 1000)}
      </Text>
    </View>
  );
}

export default function ThoughtScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const version = useDataVersion();

  const [thought, setThought] = useState<Thought | null | undefined>(undefined);
  const [body, setBody] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const [neighbours, setNeighbours] = useState<repo.Neighbour[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectQuery, setConnectQuery] = useState('');
  const [candidates, setCandidates] = useState<Thought[]>([]);
  const saved = useRef('');
  const latest = useRef('');

  useEffect(() => {
    let live = true;
    (async () => {
      const t = await repo.getThought(db, id);
      if (!live) return;
      setThought(t);
      if (t && saved.current === '' && latest.current === '') {
        saved.current = t.body;
        latest.current = t.body;
        setBody(t.body);
      }
      if (t) {
        const [g, n] = await Promise.all([repo.tagsOf(db, id), repo.neighboursOf(db, id)]);
        if (!live) return;
        setTags(g);
        setNeighbours(n);
      }
    })();
    return () => {
      live = false;
    };
  }, [db, id, version]);

  const commit = useCallback(async () => {
    const next = latest.current;
    if (next === saved.current) return;
    saved.current = next;
    await repo.updateThoughtBody(db, id, next.trim());
    await relink(db, id);
    dataChanged();
  }, [db, id]);

  // Save edits when leaving the screen.
  useEffect(
    () => () => {
      void commit();
    },
    [commit],
  );

  useEffect(() => {
    if (!connecting) return;
    let live = true;
    const timer = setTimeout(async () => {
      const linked = new Set(neighbours.map((n) => n.id));
      const rows = await repo.searchThoughts(db, connectQuery, { limit: 30 });
      if (live) setCandidates(rows.filter((r) => r.id !== id && !linked.has(r.id)).slice(0, 8));
    }, 120);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [db, id, connecting, connectQuery, neighbours]);

  if (thought === undefined) return <View style={styles.screen} />;

  if (thought === null) {
    return (
      <View style={[styles.screen, styles.missing, { paddingTop: insets.top + space.xl }]}>
        <Text style={[type.title, { color: colors.text }]}>This thought no longer exists</Text>
        <Button title="Back to the graph" onPress={() => router.back()} />
      </View>
    );
  }

  const addTag = async () => {
    const name = tagDraft.trim();
    if (!name) return;
    setTagDraft('');
    await repo.addTag(db, id, name);
    await relink(db, id);
    dataChanged();
  };

  const dropTag = async (tag: Tag) => {
    await repo.removeTag(db, id, tag.id);
    await relink(db, id);
    dataChanged();
  };

  const confirmDelete = () => {
    Alert.alert('Delete this thought?', 'Its connections and any recording are deleted too. This cannot be undone.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          latest.current = saved.current; // nothing left to save
          await removeThought(db, thought);
          router.back();
        },
      },
    ]);
  };

  const host = hostOf(thought.url);
  const created = new Date(thought.created_at).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <View style={[styles.head, { paddingTop: insets.top + 8 }]}>
        <IconButton icon="arrow-left" label="Back" onPress={() => router.back()} />
        <IconButton icon="trash-2" label="Delete thought" color={colors.danger} onPress={confirmDelete} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: insets.bottom + space.xl, gap: space.lg }}>
        <View style={styles.metaRow}>
          <KindBadge kind={thought.kind} />
          <Text style={[type.small, { color: colors.textFaint }]}>{created}</Text>
        </View>

        {thought.kind === 'image' && thought.media_path ? (
          <Image source={{ uri: thought.media_path }} style={styles.image} resizeMode="cover" accessibilityLabel="Saved image" />
        ) : null}

        {thought.kind === 'voice' && thought.media_path ? <AudioPlayer uri={thought.media_path} /> : null}

        {thought.url ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => Linking.openURL(thought.url as string).catch(() => {})}
            style={({ pressed }) => [styles.linkCard, pressed && { opacity: 0.7 }]}>
            <Text style={[type.bodyStrong, { color: kindColor.link }]} numberOfLines={1}>
              {host ?? 'Open link'}
            </Text>
            <Text style={[type.small, { color: colors.textSoft }]} numberOfLines={2}>
              {thought.url}
            </Text>
          </Pressable>
        ) : null}

        <TextInput
          value={body}
          onChangeText={(v) => {
            latest.current = v;
            setBody(v);
          }}
          onBlur={() => void commit()}
          placeholder={
            thought.kind === 'voice' ? 'No transcript. Add a note about this recording.' : 'Add a note'
          }
          placeholderTextColor={colors.textFaint}
          multiline
          scrollEnabled={false}
          style={styles.body}
          selectionColor={kindColor[thought.kind]}
          accessibilityLabel="Thought text"
        />

        <View style={styles.section}>
          <Text style={[type.smallStrong, styles.sectionTitle]}>Tags</Text>
          <View style={styles.tags}>
            {tags.map((g) => (
              <Chip key={g.id} label={`${g.name}  ×`} onPress={() => void dropTag(g)} />
            ))}
            <TextInput
              value={tagDraft}
              onChangeText={setTagDraft}
              onSubmitEditing={() => void addTag()}
              submitBehavior="submit"
              placeholder="Add a tag"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              returnKeyType="done"
              style={styles.tagInput}
              selectionColor={colors.text}
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={[type.smallStrong, styles.sectionTitle]}>
              {neighbours.length === 0 ? 'Connections' : `Connections (${neighbours.length})`}
            </Text>
            <Chip
              label={connecting ? 'Done' : 'Connect'}
              selected={connecting}
              onPress={() => {
                setConnecting(!connecting);
                setConnectQuery('');
              }}
            />
          </View>

          {connecting ? (
            <View style={styles.connectBox}>
              <TextInput
                autoFocus
                value={connectQuery}
                onChangeText={setConnectQuery}
                placeholder="Find a thought to connect"
                placeholderTextColor={colors.textFaint}
                style={styles.connectInput}
                selectionColor={colors.text}
              />
              {candidates.map((c) => (
                <ThoughtRow
                  key={c.id}
                  thought={c}
                  trailing="Connect"
                  onPress={async () => {
                    await repo.upsertLink(db, id, c.id, 'manual', 1);
                    dataChanged();
                  }}
                />
              ))}
              {candidates.length === 0 ? (
                <Text style={[type.small, styles.hint]}>No other thoughts match.</Text>
              ) : null}
            </View>
          ) : null}

          {neighbours.length === 0 && !connecting ? (
            <Text style={[type.small, styles.hint]}>
              Nothing related yet. Engram links thoughts that share words, tags or a website, and you can connect any two by hand.
            </Text>
          ) : null}

          {neighbours.map((n) => (
            <View key={n.id} style={styles.neighbour}>
              <View style={{ flex: 1 }}>
                <ThoughtRow
                  thought={n}
                  trailing={n.link_kind === 'manual' ? 'by you' : `${Math.round(n.weight * 100)}%`}
                  onPress={() => router.push({ pathname: '/thought/[id]', params: { id: n.id } })}
                />
              </View>
              <IconButton
                icon="x"
                label={`Remove connection to ${titleOf(n)}`}
                size={40}
                color={colors.textFaint}
                onPress={async () => {
                  await repo.removeLink(db, id, n.id);
                  dataChanged();
                }}
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  missing: { alignItems: 'center', gap: space.lg, paddingHorizontal: space.lg },
  head: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.sm, paddingBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.card, backgroundColor: colors.inkRaised },
  player: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.sm,
    paddingRight: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.inkRaised,
  },
  track: { flex: 1, height: 4, borderRadius: 4, backgroundColor: colors.inkLifted, overflow: 'hidden' },
  trackFill: { height: 4, backgroundColor: kindColor.voice },
  time: { color: colors.textSoft, fontVariant: ['tabular-nums'] },
  linkCard: {
    padding: space.md,
    gap: 4,
    borderRadius: radius.card,
    backgroundColor: colors.inkRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  body: { color: colors.text, fontFamily: font.regular, fontSize: 18, lineHeight: 28, padding: 0, minHeight: 60 },
  section: { gap: space.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.textSoft },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  tagInput: { minWidth: 110, height: 36, padding: 0, color: colors.text, fontFamily: font.regular, fontSize: 13 },
  connectBox: {
    borderRadius: radius.card,
    backgroundColor: colors.inkRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  connectInput: {
    height: 48,
    paddingHorizontal: space.md,
    color: colors.text,
    fontFamily: font.regular,
    fontSize: 15.5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  hint: { color: colors.textFaint, paddingVertical: space.sm, paddingHorizontal: 2 },
  neighbour: { flexDirection: 'row', alignItems: 'center', marginHorizontal: -space.lg, paddingRight: space.sm },
});

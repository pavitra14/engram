import * as Clipboard from 'expo-clipboard';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Entry, entryMeta } from '@/components/Entry';
import { Button, KindGlyph, Pill, RoundButton } from '@/components/ui';
import * as repo from '@/db/repo';
import type { Tag, Thought } from '@/db/types';
import { useBrain } from '@/lib/brain';
import { dataChanged } from '@/lib/bus';
import { relink, removeThought } from '@/lib/capture';
import { whyLinked } from '@/lib/linker';
import { clock, hostOf } from '@/lib/text';
import { font, type, useTheme } from '@/theme';

function AudioPlayer({ uri }: { uri: string }) {
  const { c } = useTheme();
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
    <View style={[styles.player, { backgroundColor: c.surface, borderColor: c.line }]}>
      <RoundButton
        icon={status.playing ? 'pause' : 'play'}
        label={status.playing ? 'Pause voice note' : 'Play voice note'}
        tone="solid"
        onPress={toggle}
      />
      <View style={[styles.track, { backgroundColor: c.rule }]}>
        <View style={{ height: 4, borderRadius: 2, width: `${progress * 100}%`, backgroundColor: c.accent }} />
      </View>
      <Text style={[type.meta, { color: c.soft, fontVariant: ['tabular-nums'] }]}>
        {clock(status.currentTime * 1000)} / {clock(duration * 1000)}
      </Text>
    </View>
  );
}

export default function ThoughtScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const brain = useBrain(db);

  const [thought, setThought] = useState<Thought | null | undefined>(undefined);
  const [body, setBody] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const [neighbours, setNeighbours] = useState<repo.Neighbour[]>([]);
  const [tagDraft, setTagDraft] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkQuery, setLinkQuery] = useState('');
  const [candidates, setCandidates] = useState<Thought[]>([]);
  const saved = useRef<string | null>(null);
  const latest = useRef('');

  useEffect(() => {
    let live = true;
    (async () => {
      const t = await repo.getThought(db, id);
      if (!live) return;
      setThought(t);
      if (!t) return;
      if (saved.current === null) {
        saved.current = t.body;
        latest.current = t.body;
        setBody(t.body);
      }
      const [g, n] = await Promise.all([repo.tagsOf(db, id), repo.neighboursOf(db, id)]);
      if (!live) return;
      setTags(g);
      setNeighbours(n);
    })();
    return () => {
      live = false;
    };
    // `brain` changes whenever the data does, which is the reload signal here.
  }, [db, id, brain]);

  const commit = useCallback(async () => {
    const next = latest.current;
    if (saved.current === null || next === saved.current) return;
    saved.current = next;
    await repo.updateThoughtBody(db, id, next.trim());
    await relink(db, id);
    dataChanged();
  }, [db, id]);

  // Edits are saved when you leave the field or the screen.
  useEffect(
    () => () => {
      void commit();
    },
    [commit],
  );

  useEffect(() => {
    if (!linking) return;
    let live = true;
    const timer = setTimeout(async () => {
      const linked = new Set(neighbours.map((n) => n.id));
      const rows = await repo.searchThoughts(db, linkQuery, { limit: 30 });
      if (live) setCandidates(rows.filter((r) => r.id !== id && !linked.has(r.id)).slice(0, 6));
    }, 120);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [db, id, linking, linkQuery, neighbours]);

  if (thought === undefined) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  if (thought === null) {
    return (
      <View style={[styles.missing, { backgroundColor: c.bg, paddingTop: insets.top + 80 }]}>
        <Text style={[type.title, { color: c.ink }]}>This thought was deleted</Text>
        <Button title="Back to today" onPress={() => router.replace('/')} />
      </View>
    );
  }

  const group = brain?.groupById.get(brain.groupOf.get(id) ?? '');
  const host = hostOf(thought.url);

  const addTag = async () => {
    const name = (tagDraft ?? '').trim();
    setTagDraft(null);
    if (!name) return;
    await repo.addTag(db, id, name);
    await relink(db, id);
    dataChanged();
  };

  const dropTag = (tag: Tag) => {
    Alert.alert(`Remove the tag ${tag.name}?`, undefined, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await repo.removeTag(db, id, tag.id);
          await relink(db, id);
          dataChanged();
        },
      },
    ]);
  };

  const confirmDelete = () => {
    Alert.alert('Delete this thought?', 'Its links and any recording are deleted too. This cannot be undone.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          latest.current = saved.current ?? '';
          await removeThought(db, thought);
          if (router.canGoBack()) router.back();
          else router.replace('/');
        },
      },
    ]);
  };

  const more = () => {
    Alert.alert('This thought', undefined, [
      { text: 'Copy text', onPress: () => void Clipboard.setStringAsync(latest.current || thought.url || '') },
      { text: 'Delete', style: 'destructive', onPress: confirmDelete },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const me = { id, text: body, url: thought.url, tags: tags.map((t) => t.name) };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
        <RoundButton
          icon="chevron-left"
          label="Back"
          tone="plain"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
        <RoundButton icon="more-horizontal" label="More actions: copy or delete" onPress={more} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 40, gap: 16 }}>
        <View style={styles.meta}>
          <KindGlyph kind={thought.kind} />
          <Text style={[type.meta, { color: c.soft }]}>{entryMeta(thought)}</Text>
        </View>

        {thought.kind === 'image' && thought.media_path ? (
          <Image source={{ uri: thought.media_path }} style={[styles.image, { backgroundColor: c.surface }]} resizeMode="cover" accessibilityLabel="Saved image" />
        ) : null}

        <TextInput
          value={body}
          onChangeText={(v) => {
            latest.current = v;
            setBody(v);
          }}
          onBlur={() => void commit()}
          placeholder={thought.kind === 'voice' ? 'No transcript. Add a note about this recording.' : 'Add a note'}
          placeholderTextColor={c.faint}
          accessibilityLabel="Thought text"
          multiline
          scrollEnabled={false}
          style={[styles.body, { color: c.ink }]}
          selectionColor={c.accent}
        />

        {thought.url ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => Linking.openURL(thought.url as string).catch(() => {})}
            style={({ pressed }) => [styles.link, { backgroundColor: c.surface, borderColor: c.line, opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[type.label, { color: c.accent }]} numberOfLines={1}>
              {host ?? 'Open link'}
            </Text>
            <Text style={[type.meta, { color: c.soft }]} numberOfLines={2}>
              {thought.url}
            </Text>
          </Pressable>
        ) : null}

        {thought.kind === 'voice' && thought.media_path ? <AudioPlayer uri={thought.media_path} /> : null}

        <View style={styles.pills}>
          {group ? (
            <Pill tone={group.tone} label={`In ${group.name}`} onPress={() => router.push({ pathname: '/group/[id]', params: { id: group.id } })} />
          ) : null}
          {tags.map((g) => (
            <Pill key={g.id} label={g.name} icon="hash" onPress={() => dropTag(g)} />
          ))}
          {tagDraft === null ? (
            <Pill label="Add a tag" icon="plus" onPress={() => setTagDraft('')} />
          ) : (
            <TextInput
              autoFocus
              value={tagDraft}
              onChangeText={setTagDraft}
              onSubmitEditing={() => void addTag()}
              onBlur={() => void addTag()}
              placeholder="Tag name"
              placeholderTextColor={c.faint}
              accessibilityLabel="New tag"
              autoCapitalize="none"
              returnKeyType="done"
              style={[styles.tagInput, { color: c.ink, borderColor: c.accent, backgroundColor: c.surface }]}
              selectionColor={c.accent}
            />
          )}
        </View>

        <View>
          <View style={styles.linksHead}>
            <Text style={[type.labelStrong, { color: c.ink }]}>
              {neighbours.length === 0 ? 'Linked thoughts' : `Linked thoughts, ${neighbours.length}`}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setLinking(!linking);
                setLinkQuery('');
              }}
              hitSlop={8}
              style={styles.linkAnother}>
              <Text style={[type.smallStrong, { color: c.accent, fontFamily: font.semibold }]}>{linking ? 'Done' : 'Link another'}</Text>
            </Pressable>
          </View>

          {linking ? (
            <View style={[styles.picker, { backgroundColor: c.surface, borderColor: c.line }]}>
              <TextInput
                autoFocus
                value={linkQuery}
                onChangeText={setLinkQuery}
                placeholder="Find a thought to link"
                placeholderTextColor={c.faint}
                accessibilityLabel="Find a thought to link"
                style={[styles.pickerInput, { color: c.ink, borderBottomColor: c.rule }]}
                selectionColor={c.accent}
              />
              {candidates.map((cand, i) => (
                <Entry
                  key={cand.id}
                  thought={cand}
                  size="small"
                  trailing="Link"
                  divider={i < candidates.length - 1}
                  onPress={async () => {
                    await repo.upsertLink(db, id, cand.id, 'manual', 1);
                    dataChanged();
                  }}
                />
              ))}
              {candidates.length === 0 ? <Text style={[type.small, styles.hint, { color: c.soft }]}>No other thoughts match.</Text> : null}
            </View>
          ) : null}

          {neighbours.length === 0 && !linking ? (
            <Text style={[type.small, { color: c.soft, paddingTop: 4 }]}>
              Nothing linked yet. Engram links thoughts that share words, a tag or a website, and you can link any two yourself.
            </Text>
          ) : null}

          {neighbours.map((n) => (
            <View key={n.id} style={[styles.neighbour, { borderTopColor: c.rule }]}>
              <View style={{ flex: 1, marginHorizontal: -24 }}>
                <Entry
                  thought={n}
                  size="small"
                  divider={false}
                  sub={n.link_kind === 'manual' ? 'Linked by you' : whyLinked(me, { id: n.id, text: `${n.title ?? ''} ${n.body}`, url: n.url })}
                  onPress={() => router.push({ pathname: '/thought/[id]', params: { id: n.id } })}
                />
              </View>
              <RoundButton
                icon="x"
                label="Remove this link"
                tone="plain"
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
  missing: { flex: 1, alignItems: 'center', gap: 24, paddingHorizontal: 24 },
  bar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: 20 },
  body: { ...type.thoughtLarge, padding: 0, minHeight: 40 },
  link: { padding: 16, gap: 4, borderRadius: 20, borderWidth: 1 },
  player: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 8, paddingRight: 18, borderRadius: 32, borderWidth: 1 },
  track: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagInput: { height: 48, minWidth: 140, borderRadius: 24, borderWidth: 2, paddingHorizontal: 16, fontFamily: font.medium, fontSize: 14 },
  linksHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  linkAnother: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 4 },
  picker: { borderRadius: 20, borderWidth: 1, overflow: 'hidden', marginBottom: 8 },
  pickerInput: { height: 52, paddingHorizontal: 18, fontFamily: font.regular, fontSize: 16, borderBottomWidth: 1 },
  hint: { padding: 18 },
  neighbour: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, paddingLeft: 24, marginLeft: -24 },
});

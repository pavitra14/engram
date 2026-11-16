import * as Clipboard from 'expo-clipboard';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router, useLocalSearchParams } from 'expo-router';
import { useDb } from '@/db/provider';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Feather } from '@expo/vector-icons';

import { ActionSheet, type SheetOption } from '@/components/ActionSheet';
import { Entry, entryMeta } from '@/components/Entry';
import { FormatBar, NoteEditor, type NoteEditorHandle, type NoteValue } from '@/components/NoteEditor';
import { Button, KindGlyph, Pill, RoundButton } from '@/components/ui';
import * as repo from '@/db/repo';
import type { Tag, Thought } from '@/db/types';
import { useBrain } from '@/lib/brain';
import { dataChanged } from '@/lib/bus';
import { addToCalendar } from '@/lib/calendar';
import { relink, removeThought, saveNote } from '@/lib/capture';
import { whyLinked } from '@/lib/linker';
import { openFile } from '@/lib/open';
import { type Assistant, chatWith, installedAssistants, planPrompt } from '@/lib/assistants';
import { addTodo, pickDateTime, reminderPresets, removeTodo, setDone, setImportant } from '@/lib/reminders';
import { clock, dueLabel, fileSize, hostOf, repeatLabel, when } from '@/lib/text';
import { font, kindLabel, type, useTheme } from '@/theme';

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
  const { id, menu: startMenu } = useLocalSearchParams<{ id: string; menu?: string }>();
  const db = useDb();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const brain = useBrain(db);

  const [thought, setThought] = useState<Thought | null | undefined>(undefined);
  const [body, setBody] = useState('');
  const [titleNow, setTitleNow] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const [neighbours, setNeighbours] = useState<repo.Neighbour[]>([]);
  const [tagDraft, setTagDraft] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkQuery, setLinkQuery] = useState('');
  const [candidates, setCandidates] = useState<Thought[]>([]);
  const [menu, setMenu] = useState<'more' | 'todo' | 'repeat' | null>(startMenu === 'todo' ? 'todo' : null);
  const [assistants, setAssistants] = useState<Assistant[]>([]);

  useEffect(() => {
    void installedAssistants().then(setAssistants);
  }, []);
  const [note, setNote] = useState<string | null>(null);
  const editor = useRef<NoteEditorHandle | null>(null);
  const saved = useRef<string | null>(null);
  const latest = useRef<NoteValue>({ title: '', text: '', html: null });
  const [inBody, setInBody] = useState(false);
  const [active, setActive] = useState({});

  useEffect(() => {
    let live = true;
    (async () => {
      const t = await repo.getThought(db, id);
      if (!live) return;
      setThought(t);
      if (!t) return;
      if (saved.current === null) {
        latest.current = { title: t.title ?? '', text: t.body, html: t.body_html };
        saved.current = JSON.stringify(latest.current);
        setBody(t.body);
        setTitleNow(t.title ?? '');
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
    if (saved.current === null) return;
    const next = editor.current ? await editor.current.value() : latest.current;
    const key = JSON.stringify(next);
    if (key === saved.current) return;
    saved.current = key;
    await saveNote(db, id, next);
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
          saved.current = null;
          await removeThought(db, thought);
          if (router.canGoBack()) router.back();
          else router.replace('/');
        },
      },
    ]);
  };

  const remind = async (at: number | null) => {
    const alerting = await addTodo(db, thought, at);
    setNote(alerting ? null : 'Saved, but notifications are off for Engram, so the phone will not alert you. Turn them on in system settings.');
  };

  const todoOptions: SheetOption[] = thought.done_at
    ? [
        { label: 'Mark as not done', icon: 'rotate-ccw', onPress: () => void setDone(db, thought, false) },
        { label: 'Remove from to-do', icon: 'x', onPress: () => void removeTodo(db, thought) },
      ]
    : [
        ...(thought.todo ? [{ label: 'Mark as done', icon: 'check' as const, onPress: () => void setDone(db, thought, true) }] : []),
        ...(thought.todo && !thought.remind_at ? [] : [{ label: thought.todo ? 'Keep on the list, no reminder' : 'Add to my to-do list', icon: 'list' as const, onPress: () => void remind(null) }]),
        ...reminderPresets().map((p) => ({ label: `Remind me: ${p.label.charAt(0).toLowerCase()}${p.label.slice(1)}`, icon: 'bell' as const, onPress: () => void remind(p.at) })),
        {
          label: 'Pick a date and time',
          icon: 'calendar' as const,
          onPress: () => {
            void pickDateTime(thought.remind_at ?? undefined).then((at) => {
              if (at) void remind(at);
            });
          },
        },
        ...(thought.remind_at
          ? [{ label: thought.repeat ? `Repeats: ${repeatLabel[thought.repeat].toLowerCase()}` : 'Repeat', icon: 'repeat' as const, onPress: () => setTimeout(() => setMenu('repeat'), 260) }]
          : []),
        ...(thought.todo
          ? [{ label: thought.priority ? 'Not important after all' : 'Mark as important', icon: 'star' as const, onPress: () => void setImportant(db, thought, !thought.priority) }]
          : []),
        ...(thought.todo ? [{ label: 'Remove from to-do', icon: 'x' as const, onPress: () => void removeTodo(db, thought) }] : []),
      ];

  const repeatOptions: SheetOption[] = [
    ...(['daily', 'weekly', 'monthly'] as const).map((r) => ({
      label: repeatLabel[r],
      icon: 'repeat' as const,
      onPress: () => void addTodo(db, thought, thought.remind_at, r),
    })),
    { label: 'Does not repeat', icon: 'x' as const, onPress: () => void addTodo(db, thought, thought.remind_at, null) },
  ];

  const moreOptions: SheetOption[] = [
    { label: 'Add to calendar', icon: 'calendar', onPress: () => void addToCalendar(thought).catch(() => setNote('The calendar could not be opened.')) },
    ...assistants.map((a) => ({
      label: `Think this through with ${a.name}`,
      icon: 'message-circle' as const,
      onPress: () => {
        const linked = neighbours.slice(0, 12);
        void chatWith(a, planPrompt(null, [thought, ...linked])).catch(() => setNote(`${a.name} could not be opened. The message is on your clipboard.`));
      },
    })),
    { label: 'Copy text', icon: 'copy', onPress: () => void Clipboard.setStringAsync([latest.current.title, latest.current.text].filter(Boolean).join('\n\n') || thought.url || thought.file_name || '') },
    { label: 'Delete', icon: 'trash-2', danger: true, onPress: confirmDelete },
  ];

  const todoLabel = thought.done_at ? 'Done' : thought.remind_at ? dueLabel(thought.remind_at) : thought.todo ? 'On your to-do list' : 'To do';
  const hasFile = (thought.kind === 'video' || thought.kind === 'file') && !!thought.media_path;

  const me = { id, text: `${titleNow} ${body}`, url: thought.url, tags: tags.map((t) => t.name) };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
        <RoundButton
          icon="chevron-left"
          label="Back"
          tone="plain"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
        <RoundButton icon="more-horizontal" label="More actions" onPress={() => setMenu('more')} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 40, gap: 16 }}>
        <View style={styles.meta}>
          <KindGlyph kind={thought.kind} />
          <Text style={[type.meta, { color: c.soft }]}>{entryMeta(thought)}</Text>
        </View>

        {thought.event_id && thought.event_at ? (
          <Text style={[type.small, { color: c.soft }]}>
            Notes for {thought.event_title ?? 'a calendar event'}, {when(thought.event_at)}
          </Text>
        ) : null}

        {thought.kind === 'image' && thought.media_path ? (
          <Image source={{ uri: thought.media_path }} style={[styles.image, { backgroundColor: c.surface }]} resizeMode="cover" accessibilityLabel="Saved image" />
        ) : null}

        <NoteEditor
          ref={editor}
          initialTitle={thought.title}
          initialText={thought.body}
          initialHtml={thought.body_html}
          minHeight={56}
          bodyPlaceholder={thought.kind === 'voice' ? 'No transcript. Add a note about this recording.' : thought.kind === 'text' ? 'Write here' : 'Add a note about this'}
          onChange={(v) => {
            latest.current = v;
            setBody(v.text);
            setTitleNow(v.title);
          }}
          onBlur={() => void commit()}
          onFocusBody={setInBody}
          onActive={setActive}
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

        {hasFile ? (
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Opens the file in another app"
            onPress={() => void openFile(thought).catch(() => setNote('No app on this phone can open that file.'))}
            style={({ pressed }) => [styles.file, { backgroundColor: c.surface, borderColor: c.line, opacity: pressed ? 0.7 : 1 }]}>
            <View style={[styles.fileIcon, { backgroundColor: c.accent }]}>
              <Feather name={thought.kind === 'video' ? 'play' : 'file-text'} size={20} color={c.onAccent} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.label, { color: c.ink }]} numberOfLines={2}>
                {thought.file_name ?? kindLabel[thought.kind]}
              </Text>
              <Text style={[type.meta, { color: c.soft }]}>
                {[kindLabel[thought.kind], fileSize(thought.file_size), 'Tap to open'].filter(Boolean).join(', ')}
              </Text>
            </View>
          </Pressable>
        ) : null}

        {note ? <Text style={[type.small, { color: c.soft }]}>{note}</Text> : null}

        <View style={styles.pills}>
          <Pill
            label={todoLabel}
            icon={thought.done_at ? 'check-circle' : 'bell'}
            selected={thought.todo === 1 && !thought.done_at}
            onPress={() => setMenu('todo')}
          />
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
      {inBody ? <FormatBar active={active} onFormat={(k) => editor.current?.format(k)} /> : null}
      <ActionSheet
        visible={menu !== null}
        title={menu === 'todo' ? 'To do' : menu === 'repeat' ? 'Repeat this reminder' : undefined}
        options={menu === 'todo' ? todoOptions : menu === 'repeat' ? repeatOptions : moreOptions}
        onClose={() => setMenu(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  missing: { flex: 1, alignItems: 'center', gap: 24, paddingHorizontal: 24 },
  bar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: 20 },
  link: { padding: 16, gap: 4, borderRadius: 20, borderWidth: 1 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 20, borderWidth: 1 },
  fileIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
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

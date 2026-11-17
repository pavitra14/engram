import { router, useLocalSearchParams } from 'expo-router';
import { useDb } from '@/db/provider';
import { useEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CAPTURE_BAR_SPACE, CaptureBar } from '@/components/CaptureBar';
import { Entry } from '@/components/Entry';
import { ActionSheet, type SheetOption } from '@/components/ActionSheet';
import { Header, Pill, RoundButton } from '@/components/ui';
import { progress } from '@/lib/checks';
import { mergeGroups, updateProject } from '@/lib/projectActions';
import { dueIn, progressLabel } from '@/lib/projects';
import { pickDateTime } from '@/lib/reminders';
import { type Assistant, chatWith, installedAssistants, outline, planPrompt } from '@/lib/assistants';
import { capture } from '@/lib/capture';
import type { Thought } from '@/db/types';
import { useBrain } from '@/lib/brain';
import { htmlToText, when } from '@/lib/text';
import { font, type, useTheme } from '@/theme';

/**
 * One group's thoughts. The id is a group id, or "loose" for thoughts that
 * link to nothing, or "largest" (used by the automated test).
 */
export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const brain = useBrain(db);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void installedAssistants().then(setAssistants);
  }, []);

  const loose = id === 'loose';
  const group = brain ? (id === 'largest' ? brain.groups[0] : brain.groupById.get(id)) : undefined;
  const ids = loose ? (brain?.loose ?? []) : (group?.members ?? []);
  const thoughts = ids.map((x) => brain?.byId.get(x)).filter((t): t is Thought => !!t);
  const missing = brain !== null && !loose && !group;
  const [sheet, setSheet] = useState<'more' | 'merge' | null>(null);
  const [now] = useState(() => Date.now());
  const [editing, setEditing] = useState<{ what: 'name' | 'goal'; text: string } | null>(null);
  const project = group?.project;
  // Progress is the check boxes in the group's notes: ticked, of all of them.
  const steps = progress(thoughts.map((t) => t.body_html));

  const saveEdit = () => {
    if (!editing || !group) return;
    const text = editing.text.trim();
    setEditing(null);
    void updateProject(db, group, editing.what === 'name' ? { name: text || null } : { goal: text || null });
  };

  const moreOptions: SheetOption[] = group
    ? [
        { label: 'Rename this group', icon: 'edit-2', onPress: () => setEditing({ what: 'name', text: project?.name ?? group.name }) },
        { label: project?.goal ? 'Change the goal' : 'Give it a goal', icon: 'flag', onPress: () => setEditing({ what: 'goal', text: project?.goal ?? '' }) },
        {
          label: project?.due_at ? 'Change the date' : 'Give it a date',
          icon: 'calendar',
          onPress: () => {
            void pickDateTime(project?.due_at ?? Date.now() + 7 * 86_400_000).then((at) => {
              if (at) void updateProject(db, group, { due_at: at });
            });
          },
        },
        ...(brain && brain.groups.length > 1 ? [{ label: 'Merge with another group', icon: 'git-merge' as const, onPress: () => setTimeout(() => setSheet('merge'), 260) }] : []),
        ...(project?.name ? [{ label: `Use the automatic name, ${group.autoName ?? ''}`.trim(), icon: 'rotate-ccw' as const, onPress: () => void updateProject(db, group, { name: null }) }] : []),
        ...(project?.goal || project?.due_at ? [{ label: 'Remove the goal and date', icon: 'x' as const, onPress: () => void updateProject(db, group, { goal: null, due_at: null }) }] : []),
      ]
    : [];
  const mergeOptions: SheetOption[] =
    group && brain
      ? brain.groups
          .filter((g) => g.id !== group.id)
          .slice(0, 24)
          .map((g) => ({
            label: `${g.name}, ${g.members.length} thoughts`,
            onPress: () => {
              void mergeGroups(db, brain, group, g).then(() => router.replace('/map'));
            },
          }))
      : [];

  const title = loose ? 'Not in a group' : (group?.name ?? '');
  const count = thoughts.length;
  const sub =
    brain === null
      ? undefined
      : loose
        ? `${count} ${count === 1 ? 'thought links' : 'thoughts link'} to nothing yet`
        : group
          ? `${count} thoughts, newest ${when(group.newest)}`
          : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={thoughts}
        keyExtractor={(t) => t.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + CAPTURE_BAR_SPACE + 40 }}
        ListHeaderComponent={
          <View style={{ gap: 18, paddingBottom: 6 }}>
            <Header title={missing ? 'This group has changed' : title} back="Map" sub={sub}>
              {group ? <RoundButton icon="more-horizontal" label="Rename, set a goal or merge this group" onPress={() => setSheet('more')} /> : null}
            </Header>
            {editing ? (
              <View style={styles.note}>
                <TextInput
                  autoFocus
                  value={editing.text}
                  onChangeText={(text) => setEditing({ ...editing, text })}
                  onSubmitEditing={saveEdit}
                  onBlur={saveEdit}
                  placeholder={editing.what === 'name' ? 'Name for this group' : 'What does done look like?'}
                  placeholderTextColor={c.faint}
                  accessibilityLabel={editing.what === 'name' ? 'Group name' : 'Goal'}
                  returnKeyType="done"
                  maxLength={editing.what === 'name' ? 40 : 140}
                  style={[styles.edit, { color: c.ink, borderColor: c.accent, backgroundColor: c.surface }]}
                  selectionColor={c.accent}
                />
              </View>
            ) : null}
            {group && (project?.goal || project?.due_at) ? (
              <View style={[styles.project, { backgroundColor: c.surface, borderColor: c.line }]}>
                {project.goal ? <Text style={{ fontFamily: font.serifMedium, fontSize: 19, lineHeight: 25, color: c.ink }}>{project.goal}</Text> : null}
                {project.due_at ? <Text style={[type.small, { color: project.due_at < now ? c.danger : c.soft }]}>{dueIn(project.due_at)}</Text> : null}
                <View style={[styles.track, { backgroundColor: c.rule }]}>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: c.accent, width: `${steps.total ? Math.round((steps.done / steps.total) * 100) : 0}%` }} />
                </View>
                <Text style={[type.small, { color: c.soft }]}>{progressLabel(steps.done, steps.total)}</Text>
                {steps.next ? <Text style={[type.small, { color: c.ink }]}>Next: {steps.next}</Text> : null}
              </View>
            ) : null}
            {missing ? (
              <Text style={[type.body, styles.note, { color: c.soft }]}>
                Groups follow your links, so this one merged or split. Go back to the map to find its thoughts.
              </Text>
            ) : null}
            {group && thoughts.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.near}>
                {assistants.map((a) => (
                  <Pill
                    key={a.id}
                    icon="message-circle"
                    label={`Chat with ${a.name}`}
                    selected
                    onPress={() => {
                      setNote(`Opening ${a.name} with these thoughts as a draft message. It is on your clipboard too.`);
                      void chatWith(a, planPrompt(group.name, thoughts)).catch(() => setNote(`${a.name} could not be opened. The message is on your clipboard.`));
                    }}
                  />
                ))}
                <Pill
                  icon="list"
                  label="Make one note of these"
                  onPress={async () => {
                    const html = `<html><ul>${outline(thoughts)}</ul><p>Next step: </p></html>`;
                    const made = await capture(db, { kind: 'text', title: `${group.name}: where this stands`, body: htmlToText(html), body_html: html });
                    router.push({ pathname: '/thought/[id]', params: { id: made.id } });
                  }}
                />
              </ScrollView>
            ) : null}
            {note ? <Text style={[type.small, styles.note, { color: c.soft }]}>{note}</Text> : null}
            {group && group.near.length > 0 && brain ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.near}>
                <Text style={[type.meta, { color: c.soft }]}>Near</Text>
                {group.near.map((n) => {
                  const other = brain.groupById.get(n);
                  return other ? (
                    <Pill
                      key={n}
                      tone={other.tone}
                      label={other.name}
                      onPress={() => router.replace({ pathname: '/group/[id]', params: { id: n } })}
                    />
                  ) : null;
                })}
              </ScrollView>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => {
          const n = brain?.degree.get(item.id) ?? 0;
          return (
            <Entry
              thought={item}
              size="small"
              sub={n === 0 ? undefined : `Linked to ${n} ${n === 1 ? 'thought' : 'thoughts'}`}
              divider={index < thoughts.length - 1}
              onPress={() => router.push({ pathname: '/thought/[id]', params: { id: item.id } })}
            />
          );
        }}
      />
      <CaptureBar />
      <ActionSheet
        visible={sheet !== null}
        title={sheet === 'merge' ? 'Merge into' : undefined}
        options={sheet === 'merge' ? mergeOptions : moreOptions}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  near: { alignItems: 'center', gap: 8, paddingHorizontal: 24 },
  note: { paddingHorizontal: 24 },
  edit: { height: 52, borderRadius: 26, borderWidth: 2, paddingHorizontal: 18, fontFamily: font.medium, fontSize: 16 },
  project: { marginHorizontal: 16, padding: 16, borderRadius: 20, borderWidth: 1, gap: 8 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
});

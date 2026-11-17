import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Entry } from '@/components/Entry';
import { Button, Header } from '@/components/ui';
import { useDb } from '@/db/provider';
import { useBrain } from '@/lib/brain';
import { monthRecap } from '@/lib/recall';
import { font, type, useTheme } from '@/theme';

function Card({ figure, label, sub }: { figure: string; label: string; sub?: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
      <Text style={{ fontFamily: font.serifMedium, fontSize: 34, lineHeight: 40, color: c.ink }} numberOfLines={2} adjustsFontSizeToFit>
        {figure}
      </Text>
      <Text style={[type.label, { color: c.ink }]}>{label}</Text>
      {sub ? <Text style={[type.small, { color: c.soft }]}>{sub}</Text> : null}
    </View>
  );
}

/** A month in a few cards: what was written, where, and one note that got no second look. */
export default function RecapScreen() {
  const db = useDb();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const brain = useBrain(db);
  const [now] = useState(() => Date.now());
  // Early in a month there is little to say about it, so the month before is shown first.
  const [offset, setOffset] = useState(() => (new Date().getDate() <= 5 ? -1 : 0));

  const recap = useMemo(
    () => monthRecap(brain?.thoughts ?? [], (id) => brain?.groupById.get(brain.groupOf.get(id) ?? '')?.name ?? null, now, offset),
    [brain, now, offset],
  );
  const forgotten = recap.forgotten ? brain?.byId.get(recap.forgotten) : undefined;
  const busiest = recap.busiest ? new Date(recap.busiest.day).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) : null;

  const words = [
    `My ${recap.label} in Engram`,
    `${recap.notes} ${recap.notes === 1 ? 'thought' : 'thoughts'} written on ${recap.days} ${recap.days === 1 ? 'day' : 'days'}`,
    recap.done ? `${recap.done} to-dos done` : null,
    recap.topGroup ? `Most on my mind: ${recap.topGroup.name}` : null,
    recap.longestStreak > 1 ? `${recap.longestStreak} days in a row at best` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40, gap: 16 }}>
        <Header title={recap.label} back="Your week" sub="The month in review" />
        <View style={styles.switch}>
          <Button title="Month before" onPress={() => setOffset(offset - 1)} />
          {offset < 0 ? <Button title="Month after" onPress={() => setOffset(offset + 1)} /> : null}
        </View>
        {brain === null ? null : recap.notes === 0 ? (
          <Text style={[type.body, styles.pad, { color: c.soft }]}>Nothing was written in {recap.label}.</Text>
        ) : (
          <View style={styles.cards}>
            <Card figure={String(recap.notes)} label={recap.notes === 1 ? 'thought written' : 'thoughts written'} sub={`On ${recap.days} ${recap.days === 1 ? 'day' : 'days'} of the month`} />
            {recap.topGroup ? <Card figure={recap.topGroup.name} label="Most on your mind" sub={`${recap.topGroup.count} thoughts joined this group`} /> : null}
            {busiest && recap.busiest ? <Card figure={String(recap.busiest.count)} label="thoughts on your busiest day" sub={busiest} /> : null}
            <Card figure={String(recap.longestStreak)} label={recap.longestStreak === 1 ? 'day with a note, at best' : 'days in a row, at best'} />
            {recap.done > 0 ? <Card figure={String(recap.done)} label={recap.done === 1 ? 'to-do done' : 'to-dos done'} /> : null}
          </View>
        )}
        {forgotten ? (
          <View>
            <Text style={[type.labelStrong, styles.pad, { color: c.ink }]}>One you have not looked at since</Text>
            <Entry thought={forgotten} size="small" divider={false} onPress={() => router.push({ pathname: '/thought/[id]', params: { id: forgotten.id } })} />
          </View>
        ) : null}
        {recap.notes > 0 ? (
          <View style={styles.pad}>
            <Button title="Share these numbers as text" icon="share" onPress={() => void Share.share({ message: words }).catch(() => {})} style={{ alignSelf: 'flex-start' }} />
            <Text style={[type.meta, { color: c.soft, paddingTop: 8 }]}>Only the numbers above are shared, never your notes.</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 24 },
  switch: { flexDirection: 'row', gap: 10, paddingHorizontal: 24 },
  cards: { gap: 12, paddingHorizontal: 16 },
  card: { padding: 20, borderRadius: 24, borderWidth: 1, gap: 4 },
});

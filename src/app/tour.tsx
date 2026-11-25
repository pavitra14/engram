import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { type ComponentRef, type ReactNode, useRef, useState } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFlag } from '@/cloud/flags';
import { Button } from '@/components/ui';
import { useDb } from '@/db/provider';
import * as repo from '@/db/repo';
import { MODEL_SIZE_NOTE } from '@/lib/semantic';
import { enableSmartLinking } from '@/lib/smart';
import { ASK_UPDATES_TITLE, askUpdatesBody, setUpdates, updateChannel } from '@/lib/updates';
import { setUsage } from '@/lib/usage';
import { ASK_BODY, ASK_TITLE } from '@/lib/usage.logic';
import { font, type, useTheme } from '@/theme';

/**
 * The first-run tour: five pages, each showing a small piece of the real
 * interface and saying what it is for, then three questions: whether to link notes
 * by meaning (a model download), whether to hear about new versions, and whether
 * to share anonymous usage counts.
 * Nothing is turned on unless the person says yes. Shown once; Settings can show it again.
 */
export default function TourScreen() {
  const db = useDb();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pager = useRef<ComponentRef<typeof ScrollView>>(null);
  const [page, setPage] = useState(0);
  const cloudOn = useFlag('cloud');
  const [channel] = useState(updateChannel);

  // Skipping leaves the usage question unanswered; Today asks it once instead.
  const finish = async (share?: boolean) => {
    if (share !== undefined) await setUsage(db, share);
    await repo.setMeta(db, 'tour_done', '1');
    router.replace('/');
  };

  const chip = (label: string, tone: number) => (
    <View style={[styles.chip, { backgroundColor: c.groupFill[tone], borderColor: c.groupLine[tone] }]}>
      <Text style={[type.smallStrong, { color: c.ink }]}>{label}</Text>
    </View>
  );
  const card = (children: ReactNode) => <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>{children}</View>;

  const pages: { title: string; body: string; art: ReactNode }[] = [
    {
      title: 'Catch it before it goes',
      body: 'Type a line and send it; that line becomes the note’s title. Tap the mic to say it instead. From any other app, use Share and pick Engram. Add the Engram widget to your home screen to start a note in one tap.',
      art: (
        <View style={styles.barRow}>
          <View style={[styles.round, { borderColor: c.line, backgroundColor: c.surface }]}>
            <Feather name="plus" size={20} color={c.ink} />
          </View>
          <View style={[styles.field, { borderColor: c.line, backgroundColor: c.surface }]}>
            <Text style={[type.body, { color: c.faint }]}>Write a thought</Text>
          </View>
          <View style={[styles.mic, { backgroundColor: c.accent }]}>
            <Feather name="mic" size={24} color={c.onAccent} />
          </View>
        </View>
      ),
    },
    {
      title: 'Every thought is a note',
      body: 'A title now, a body whenever you want one: headings, lists, check boxes. Photos, videos, files and links are notes too. Hold any note in a list for quick actions without opening it.',
      art: card(
        <>
          <Text style={{ fontFamily: font.serifMedium, fontSize: 22, color: c.ink }}>Hampi trip</Text>
          {['Book the night train', 'Ask Meera about the homestay'].map((line, i) => (
            <View key={line} style={styles.check}>
              <Feather name={i === 0 ? 'check-square' : 'square'} size={18} color={i === 0 ? c.accent : c.soft} />
              <Text style={{ fontFamily: font.serif, fontSize: 17, color: c.ink }}>{line}</Text>
            </View>
          ))}
        </>,
      ),
    },
    {
      title: 'It files itself',
      body: 'You never pick a folder. Notes that relate link to each other and gather into named groups. The map shows the groups as circles; a note with no company yet sits on its own until it finds some.',
      art: (
        <View style={styles.mapArt}>
          <View style={[styles.line, { backgroundColor: c.connector, width: 96, left: 84, top: 70, transform: [{ rotate: '18deg' }] }]} />
          <View style={[styles.bubble, { width: 116, height: 116, borderRadius: 58, left: 0, top: 0, backgroundColor: c.groupFill[0], borderColor: c.groupLine[0] }]}>
            <Text style={{ fontFamily: font.serifMedium, fontSize: 18, color: c.ink }}>Sourdough</Text>
            <Text style={[type.meta, { color: c.groupText }]}>6 thoughts</Text>
          </View>
          <View style={[styles.bubble, { width: 92, height: 92, borderRadius: 46, left: 150, top: 56, backgroundColor: c.groupFill[2], borderColor: c.groupLine[2] }]}>
            <Text style={{ fontFamily: font.serifMedium, fontSize: 16, color: c.ink }}>Hampi</Text>
            <Text style={[type.meta, { color: c.groupText }]}>3</Text>
          </View>
          <View style={[styles.bubble, { width: 56, height: 56, borderRadius: 28, left: 60, top: 130, backgroundColor: c.surface, borderColor: c.line }]}>
            <Text style={{ fontFamily: font.medium, fontSize: 10, color: c.soft }}>Call the bank</Text>
          </View>
        </View>
      ),
    },
    {
      title: 'It brings things back',
      body: 'Open a note and tap To do to put it on your list, with a reminder if you like. Today shows what is due. Each day Engram also shows one older note and asks whether it still matters. In a group, one tap gathers its notes into a plan.',
      art: card(
        <View style={styles.todo}>
          <View style={[styles.tick, { borderColor: c.soft }]} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: font.serif, fontSize: 18, color: c.ink }}>Renew the passport</Text>
            <View style={styles.due}>
              <Feather name="bell" size={13} color={c.soft} />
              <Text style={[type.meta, { color: c.soft }]}>Tomorrow, 9:00 am</Text>
            </View>
          </View>
          <Feather name="star" size={20} color={c.accent} />
        </View>,
      ),
    },
    {
      title: 'Yours, on this phone',
      body: cloudOn
        ? 'Everything is stored here. There is no account to make. Two things are optional and off until you turn them on in Settings: Engram Cloud, which keeps a copy and syncs your other devices, and a language model that links notes by what they mean.'
        : 'Everything is stored here. There is no account to make and your notes are never uploaded. In Settings you can turn on two extras that also run on this phone: a language model that links notes by what they mean, and translation of other languages into English.',
      art: (
        <View style={styles.chips}>
          {chip('No account needed', 3)}
          {chip('Works offline', 1)}
          {chip(cloudOn ? 'Sync is optional' : 'Notes never uploaded', 2)}
        </View>
      ),
    },
    {
      title: 'Link notes by meaning?',
      body: `Engram can link "car service due" with "garage booking" even though they share no words. A language model does this on this phone, in 50+ languages, and your notes never leave it. Turning it on downloads the model once (${MODEL_SIZE_NOTE}), so Wi-Fi is best. You can change this in Settings.`,
      art: card(
        <View style={{ gap: 10 }}>
          <Text style={{ fontFamily: font.serif, fontSize: 18, color: c.ink }}>Car service due</Text>
          <View style={styles.check}>
            <Feather name="link-2" size={16} color={c.accent} />
            <Text style={[type.meta, { color: c.soft }]}>Linked by meaning</Text>
          </View>
          <Text style={{ fontFamily: font.serif, fontSize: 18, color: c.ink }}>Garage booking on Saturday</Text>
        </View>,
      ),
    },
    {
      title: ASK_UPDATES_TITLE,
      body: askUpdatesBody(channel),
      art: card(
        <View style={{ gap: 10 }}>
          <Text style={[type.meta, { color: c.soft }]}>New version</Text>
          <Text style={{ fontFamily: font.serifMedium, fontSize: 20, color: c.ink }}>A new version of Engram is ready</Text>
          <View style={styles.check}>
            <Feather name={channel === 'play' ? 'download' : 'external-link'} size={16} color={c.accent} />
            <Text style={[type.meta, { color: c.soft }]}>{channel === 'play' ? 'Updates through Google Play' : 'Opens the release page'}</Text>
          </View>
        </View>,
      ),
    },
    {
      title: ASK_TITLE,
      body: ASK_BODY,
      art: card(
        <View style={{ gap: 10 }}>
          {[
            ['check', 'Counted: which features you use, once a day'],
            ['x', 'Never: your notes, words, files or searches'],
            ['x', 'Never: an id for you or this phone'],
          ].map(([icon, line]) => (
            <View key={line} style={styles.check}>
              <Feather name={icon as 'check' | 'x'} size={18} color={icon === 'check' ? c.accent : c.soft} />
              <Text style={[type.body, { color: c.ink, flex: 1 }]}>{line}</Text>
            </View>
          ))}
        </View>,
      ),
    },
  ];

  const last = page === pages.length - 1;
  const meaningPage = page === pages.length - 3;
  const updatesPage = page === pages.length - 2;
  const forward = () => {
    pager.current?.scrollTo({ x: (page + 1) * width, animated: true });
    setPage(page + 1);
  };
  // Answering a question moves on to the next one. Yes to meaning starts the download now.
  const chooseMeaning = (on: boolean) => {
    if (on) void enableSmartLinking(db);
    forward();
  };
  const chooseUpdates = (on: boolean) => {
    void setUpdates(db, on);
    forward();
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)));
  const next = () => (last ? void finish() : pager.current?.scrollTo({ x: (page + 1) * width, animated: true }));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}>
      <View style={styles.top}>
        <Text style={{ fontFamily: font.serifMedium, fontSize: 22, color: c.ink }}>engram.</Text>
        {last ? null : (
          <Pressable accessibilityRole="button" onPress={() => void finish()} hitSlop={8} style={styles.skip}>
            <Text style={[type.smallStrong, { color: c.soft }]}>Skip the tour</Text>
          </Pressable>
        )}
      </View>

      <ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} style={{ flex: 1 }}>
        {pages.map((p) => (
          <View key={p.title} style={[styles.page, { width }]}>
            <View style={styles.art}>{p.art}</View>
            <Text accessibilityRole="header" style={[styles.title, { color: c.ink }]}>
              {p.title}
            </Text>
            <Text style={[type.body, { color: c.soft }]}>{p.body}</Text>
          </View>
        ))}
      </ScrollView>

      {meaningPage ? (
        <View style={[styles.foot, styles.choice]}>
          <Button title="Not now" style={{ flex: 1 }} onPress={() => chooseMeaning(false)} />
          <Button title="Turn on" tone="solid" style={{ flex: 1 }} onPress={() => chooseMeaning(true)} />
        </View>
      ) : updatesPage ? (
        <View style={[styles.foot, styles.choice]}>
          <Button title="No thanks" style={{ flex: 1 }} onPress={() => chooseUpdates(false)} />
          <Button title="Tell me" tone="solid" style={{ flex: 1 }} onPress={() => chooseUpdates(true)} />
        </View>
      ) : last ? (
        // The question's own answers take the whole row, so neither is squeezed.
        <View style={[styles.foot, styles.choice]}>
          <Button title="No thanks" style={{ flex: 1 }} onPress={() => void finish(false)} />
          <Button title="Share counts" tone="solid" style={{ flex: 1 }} onPress={() => void finish(true)} />
        </View>
      ) : (
        <View style={styles.foot}>
          <View style={styles.dots} accessibilityLabel={`Page ${page + 1} of ${pages.length}`}>
            {pages.map((p, i) => (
              <View key={p.title} style={[styles.dot, { backgroundColor: i === page ? c.ink : c.line, width: i === page ? 20 : 8 }]} />
            ))}
          </View>
          <Button title="Next" tone="solid" onPress={next} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
  skip: { minHeight: 48, justifyContent: 'center' },
  page: { paddingHorizontal: 28, justifyContent: 'center', gap: 16 },
  art: { height: 210, justifyContent: 'center', marginBottom: 12 },
  title: { fontFamily: font.serifMedium, fontSize: 34, lineHeight: 40, letterSpacing: -0.6 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 12 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { height: 8, borderRadius: 4 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  round: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  field: { flex: 1, height: 56, borderRadius: 28, borderWidth: 1, justifyContent: 'center', paddingHorizontal: 20 },
  mic: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 24, padding: 20, gap: 12 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mapArt: { width: 250, height: 190, alignSelf: 'center' },
  bubble: { position: 'absolute', borderWidth: 1, alignItems: 'center', justifyContent: 'center', padding: 6 },
  line: { position: 'absolute', height: 1.5 },
  todo: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  tick: { width: 26, height: 26, borderRadius: 13, borderWidth: 2 },
  due: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  choice: { gap: 12, justifyContent: 'center' },
  chip: { height: 44, paddingHorizontal: 18, borderRadius: 22, borderWidth: 1, justifyContent: 'center' },
});

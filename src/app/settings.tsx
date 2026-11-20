import Constants from 'expo-constants';
import { router, useLocalSearchParams } from 'expo-router';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { useDb } from '@/db/provider';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFlag } from '@/cloud/flags';
import { runSummary, translateAll } from '@/lib/translate';
import { CloudSection } from '@/components/CloudSection';
import { ActionSheet, type SheetOption } from '@/components/ActionSheet';
import { Extra, Group, Groups, Row, Section, SettingsSearch } from '@/components/SettingsLayout';
import { Header, Notice, Pill } from '@/components/ui';
import * as repo from '@/db/repo';
import { autoBackupFolder, chooseBackupFolder, exportFullBackup, exportMarkdown, importBackup, importNotes, stopAutoBackup } from '@/lib/backup';
import { type Briefs, briefSettings, EVENINGS, MORNINGS, saveBriefSettings } from '@/lib/briefs';
import { canLock, confirmItIsYou, LOCK_DELAYS, type LockSetting, lockSetting, saveLockSetting } from '@/lib/lock';
import { allowed as notificationsAllowed } from '@/lib/reminders';
import { ASK_SIZE_NOTE, prepareAsk, removeAsk, restoreAsk, useAskState } from '@/lib/ask';
import { dataChanged, useDataVersion } from '@/lib/bus';
import { askForCalendar, calendarAllowed } from '@/lib/calendar';
import { rebuildAllLinks } from '@/lib/capture';
import { loadSamples } from '@/lib/samples';
import { MODEL_SIZE_NOTE, useSemanticState } from '@/lib/semantic';
import { disableSmartLinking, enableSmartLinking } from '@/lib/smart';
import { canTranscribeOnDevice, SPEECH_LANGS, speechLang } from '@/lib/useVoice';
import { ACCENT_NAMES, ACCENTS, type AppearanceSetting, type, useTheme } from '@/theme';
import { count as countUse, M, previewUsage, readUsageAnswer, setUsage, type UsageAnswer } from '@/lib/usage';
import { describe } from '@/lib/usage.logic';

function Segments<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const { c } = useTheme();
  return (
    <View style={[styles.segments, { backgroundColor: c.surface, borderColor: c.line }]} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, { backgroundColor: on ? c.ink : 'transparent' }]}>
            <Text style={[type.smallStrong, { color: on ? c.onInk : c.ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type HomeView = 'list' | 'split' | 'map';
const HOME_VIEWS: { value: HomeView; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'split', label: 'Map and list' },
  { value: 'map', label: 'Map' },
];

/** Whether Android has the offline speech pack for a language. Null when it cannot be told. */
async function packInstalled(locale: string): Promise<boolean | null> {
  try {
    const r = await ExpoSpeechRecognitionModule.getSupportedLocales({ androidRecognitionServicePackage: 'com.google.android.as' });
    const want = locale.toLowerCase();
    return r.installedLocales.some((l) => l.toLowerCase() === want);
  } catch {
    return null;
  }
}

const APPEARANCES: { value: AppearanceSetting; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'black', label: 'Black' },
];

export default function SettingsScreen() {
  const db = useDb();
  const { c, appearance, setAppearance, accent, setAccent } = useTheme();
  const insets = useSafeAreaInsets();
  const version = useDataVersion();
  const [lang, setLang] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const onDevice = canTranscribeOnDevice();
  const smart = useSemanticState();
  const params = useLocalSearchParams<{ smart?: string; home?: string; metrics?: string }>();
  const [usage, setUsageState] = useState<UsageAnswer>(null);
  const [calendar, setCalendar] = useState(false);
  const [choosingLang, setChoosingLang] = useState(false);
  const cloudOn = useFlag('cloud');
  const askOn = useFlag('ask');
  const askModel = useAskState();
  useEffect(() => {
    void restoreAsk(db);
  }, [db]);
  const [translate, setTranslate] = useState(false);
  const [dailyQ, setDailyQ] = useState(true);
  useEffect(() => {
    repo.getMeta(db, 'daily_question').then((v) => setDailyQ(v !== 'off'));
  }, [db]);
  useEffect(() => {
    repo.getMeta(db, 'translate').then((v) => setTranslate(v === 'on'));
  }, [db]);
  const [homeView, setHomeView] = useState<HomeView>('list');
  const [plainReminders, setPlainReminders] = useState(true);
  const [shake, setShake] = useState(false);
  const [tileOpens, setTileOpens] = useState<'voice' | 'note'>('voice');
  const [briefs, setBriefs] = useState<Briefs>({ morning: null, evening: null, sticky: false });
  const [lock, setLock] = useState<LockSetting>({ on: false, afterMs: 0 });
  const [backupTo, setBackupTo] = useState<{ folder: string | null; last: number }>({ folder: null, last: 0 });
  const [trashed, setTrashed] = useState(0);
  const [choice, setChoice] = useState<{ title: string; message?: string; options: SheetOption[] } | null>(null);

  // Groups that are open are remembered between visits. A new install opens the first one.
  // A test link (?home=, ?smart=, ?metrics=) opens the group it changes.
  const [query, setQuery] = useState('');
  const [opened, setOpened] = useState<string[]>(['look']);
  const linked = params.home ? 'look' : params.smart ? 'smart' : params.metrics ? 'privacy' : null;
  useEffect(() => {
    void repo.getMeta(db, 'settings_open').then((v) => {
      let saved: string[] = ['look'];
      try {
        const parsed = v ? JSON.parse(v) : null;
        if (Array.isArray(parsed)) saved = parsed.filter((x): x is string => typeof x === 'string');
      } catch {}
      setOpened(linked && !saved.includes(linked) ? [...saved, linked] : saved);
    });
  }, [db, linked]);
  const toggleGroup = (id: string) => {
    const next = opened.includes(id) ? opened.filter((g) => g !== id) : [...opened, id];
    setOpened(next);
    void repo.setMeta(db, 'settings_open', JSON.stringify(next));
  };
  useEffect(() => {
    let live = true;
    (async () => {
      const [pr, sh, tile, b, l, folder, last, trash] = await Promise.all([
        repo.getMeta(db, 'plain_reminders'),
        repo.getMeta(db, 'shake'),
        repo.getMeta(db, 'tile_opens'),
        briefSettings(db),
        lockSetting(db),
        autoBackupFolder(db),
        repo.getMeta(db, 'backup_last'),
        repo.listTrash(db),
      ]);
      if (!live) return;
      setPlainReminders(pr !== 'off');
      setShake(sh === 'on');
      setTileOpens(tile === 'note' ? 'note' : 'voice');
      setBriefs(b);
      setLock(l);
      setBackupTo({ folder, last: Number(last) || 0 });
      setTrashed(trash.length);
    })();
    return () => {
      live = false;
    };
  }, [db, version]);

  const [pack, setPack] = useState<'unknown' | 'missing' | 'downloading' | 'installed'>('unknown');
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);

  // engram://settings?home=split sets the home layout (used by the automated test).
  useEffect(() => {
    const asked = params.home === 'split' || params.home === 'map' || params.home === 'list' ? params.home : null;
    if (asked) {
      void repo.setMeta(db, 'home_view', asked).then(() => setHomeView(asked));
      return;
    }
    repo.getMeta(db, 'home_view').then((v) => setHomeView(v === 'split' || v === 'map' ? v : 'list'));
  }, [db, params.home]);

  const checkPack = useCallback(async (locale: string) => {
    const has = await packInstalled(locale);
    if (has) {
      if (polling.current) clearInterval(polling.current);
      polling.current = null;
      setPack('installed');
    }
    return has;
  }, []);

  useEffect(() => {
    if (!lang || !onDevice) return;
    let live = true;
    void packInstalled(lang).then((has) => {
      if (live) setPack((p) => (has ? 'installed' : p === 'downloading' ? p : 'missing'));
    });
    return () => {
      live = false;
    };
  }, [lang, onDevice]);

  useEffect(
    () => () => {
      if (polling.current) clearInterval(polling.current);
    },
    [],
  );

  // Android does not say how far a speech pack download has got, so Engram asks every few seconds whether it has arrived.
  const downloadPack = () =>
    run(async () => {
      if (!lang) return null;
      setPack('downloading');
      const r = await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale: lang });
      if (r.status === 'download_success' && (await checkPack(lang)) !== false) {
        setPack('installed');
        return 'Speech pack installed.';
      }
      if (polling.current) clearInterval(polling.current);
      let tries = 0;
      polling.current = setInterval(() => {
        tries += 1;
        void checkPack(lang);
        if (tries > 90 && polling.current) {
          clearInterval(polling.current);
          polling.current = null;
          setPack((p) => (p === 'downloading' ? 'missing' : p));
        }
      }, 4000);
      return r.status === 'opened_dialog' ? 'Finish the download in the Android window that opened.' : null;
    });

  // engram://settings?metrics=off answers no to usage counts (used by the automated test, so CI never sends any).
  useEffect(() => {
    if (params.metrics === 'off') void setUsage(db, false).then(() => setUsageState('no'));
    else void readUsageAnswer(db).then(setUsageState);
  }, [db, params.metrics, version]);

  const toggleUsage = () => {
    const yes = usage !== 'yes';
    setUsageState(yes ? 'yes' : 'no');
    void setUsage(db, yes);
  };

  const showUsage = async () => {
    const lines = describe(await previewUsage(db));
    setChoice({
      title: "What's sent",
      message: `${usage === 'yes' ? 'Today so far. Sent tomorrow, once, as totals:' : 'Nothing is sent while this is off. If it were on, today would look like this:'}\n\n${lines.join('\n')}\n\nNo notes, no words you wrote, no id, no time of day.`,
      options: [{ label: 'Done', icon: 'check', onPress: () => {} }],
    });
  };

  // engram://settings?smart=on switches meaning-based linking on (used by the automated test).
  useEffect(() => {
    if (params.smart === 'on') void enableSmartLinking(db);
  }, [db, params.smart]);

  useEffect(() => {
    (async () => setCalendar((await repo.getMeta(db, 'calendar')) === 'on' && (await calendarAllowed())))();
  }, [db]);

  useEffect(() => {
    speechLang(db).then(setLang);
    repo.countThoughts(db).then(setCount);
  }, [db, version]);

  const run = async (work: () => Promise<string | null>) => {
    try {
      const message = await work();
      if (message) setStatus(message);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    }
  };

  const changeBriefs = (next: Briefs) =>
    run(async () => {
      // The first one switched on is when Engram asks to send notifications.
      if ((next.sticky || next.morning != null || next.evening != null) && !(await notificationsAllowed())) {
        return 'Notifications are off for Engram. Turn them on in system settings first.';
      }
      setBriefs(next);
      await saveBriefSettings(db, next);
      return null;
    });
  const hour = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'am' : 'pm'}`;
  const chooseHour = (title: string, hours: number[], set: (h: number | null) => void) =>
    setChoice({
      title,
      options: [...hours.map((h) => ({ label: `At ${hour(h)}`, onPress: () => set(h) })), { label: 'Off', icon: 'x' as const, onPress: () => set(null) }],
    });

  const toggleLock = () =>
    run(async () => {
      if (!lock.on && !(await canLock())) return 'This phone has no screen lock. Set a PIN, pattern or fingerprint in system settings first.';
      // Turning it on or off both need you to prove it is you.
      if (!(await confirmItIsYou(lock.on ? 'Turn off app lock' : 'Turn on app lock'))) return 'App lock was not changed.';
      const next = { ...lock, on: !lock.on };
      setLock(next);
      await saveLockSetting(db, next);
      dataChanged();
      return null;
    });

  const langLabel = SPEECH_LANGS.find((l) => l.code === lang)?.label ?? 'English';

  const toggleCalendar = () =>
    run(async () => {
      if (calendar) {
        await repo.setMeta(db, 'calendar', 'off');
        setCalendar(false);
        return null;
      }
      if (!(await askForCalendar())) return 'Calendar access was not allowed. You can allow it in system settings.';
      await repo.setMeta(db, 'calendar', 'on');
      setCalendar(true);
      return null;
    });

  const smartStatus =
    smart.status === 'downloading'
      ? `Downloading the language model, ${Math.round(smart.progress * 100)}%`
      : smart.status === 'indexing'
        ? `Reading your thoughts, ${smart.done} of ${smart.total}`
        : smart.status === 'ready'
          ? 'On. Thoughts link by meaning.'
          : smart.status === 'error'
            ? `Could not start: ${smart.message ?? 'unknown problem'}`
            : `Off. Thoughts link by shared words. Turning it on downloads a language model once (${MODEL_SIZE_NOTE}).`;
  const smartBusy = smart.status === 'downloading' || smart.status === 'indexing';

  const confirmWipe = () => {
    Alert.alert('Delete everything?', `All ${count} thoughts, their links and tags, and everything in the trash, are deleted from this phone. This cannot be undone.`, [
      { text: 'Keep my thoughts', style: 'cancel' },
      {
        text: 'Delete everything',
        style: 'destructive',
        onPress: () =>
          run(async () => {
            await repo.wipeAll(db);
            dataChanged();
            return 'Everything was deleted.';
          }),
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40, gap: 26 }}>
        <Header title="Settings" back="Today" sub="Your notes stay on this phone" />
        <View style={{ paddingHorizontal: 24, gap: 26 }}>
          <SettingsSearch value={query} onChange={setQuery} />
          <Notice text={status} />
          <Groups query={query}>
            <Group id="look" title="Look and feel" sub="Theme, accent colour, home screen" open={opened.includes('look')} onToggle={toggleGroup} query={query}>
              <Section title="Appearance" terms="theme dark light black mode system night">
                <Extra>
                  <Segments options={APPEARANCES} value={appearance} onChange={setAppearance} />
                </Extra>
                <Extra><Text style={[type.meta, { color: c.soft }]}>Black uses true black to save power on AMOLED screens. System follows your phone.</Text></Extra>
              </Section>
              <Section title="Accent colour" terms="color button link">
                <Extra>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {ACCENT_NAMES.map((a) => (
                      <Pill key={a} label={ACCENTS[a].label} selected={accent === a} onPress={() => setAccent(a)} />
                    ))}
                  </ScrollView>
                </Extra>
                <Extra><Text style={[type.meta, { color: c.soft }]}>The colour of buttons and links. Widgets and the app icon stay cobalt.</Text></Extra>
              </Section>
              <Section title="Home screen" terms="layout map list split today view">
                <Extra>
                  <Segments
                    options={HOME_VIEWS}
                    value={homeView}
                    onChange={(v) => {
                      setHomeView(v);
                      void repo.setMeta(db, 'home_view', v);
                    }}
                  />
                </Extra>
                <Extra><Text style={[type.meta, { color: c.soft }]}>
                  {homeView === 'list'
                    ? 'Your thoughts as a list, newest first.'
                    : homeView === 'split'
                      ? 'The map of your groups on top, the list below.'
                      : 'The map of your groups fills the screen. The list is one tap away.'}
                </Text></Extra>
              </Section>
            </Group>
            <Group id="capture" title="Capture" sub="Reminders, voice notes, shortcuts, daily briefs" open={opened.includes('capture')} onToggle={toggleGroup} query={query}>
              <Section title="Catching thoughts">
                <View>
                  <Row
                    title="Reminders from plain words"
                    sub={plainReminders ? 'On. "Call the bank Friday 10am", typed or spoken, sets that reminder. A message lets you undo it.' : 'Off. Reminders are only set by hand.'}
                    action={plainReminders ? 'Turn off' : 'Turn on'}
                    onPress={() => {
                      setPlainReminders(!plainReminders);
                      void repo.setMeta(db, 'plain_reminders', plainReminders ? 'off' : 'on');
                    }}
                  />
                  <Row
                    title="Shake to record"
                    sub={shake ? 'On. Shake the phone while Engram is open to start a voice note.' : 'Off. Works only while Engram is open.'}
                    action={shake ? 'Turn off' : 'Turn on'}
                    onPress={() => {
                      setShake(!shake);
                      void repo.setMeta(db, 'shake', shake ? 'off' : 'on').then(() => dataChanged());
                    }}
                  />
                  <Row
                    title="Quick-note notification"
                    sub={briefs.sticky ? 'On. A quiet notification stays in the shade: tap it to write, or use Speak.' : 'Off.'}
                    action={briefs.sticky ? 'Turn off' : 'Turn on'}
                    onPress={() => void changeBriefs({ ...briefs, sticky: !briefs.sticky })}
                  />
                  <Row
                    title="Quick Settings tile"
                    sub={`Opens ${tileOpens === 'voice' ? 'a voice note' : 'a new note'}. To add it, swipe down twice from the top of the screen, tap the pencil, and drag "New thought" into your tiles.`}
                    action={tileOpens === 'voice' ? 'Use note' : 'Use voice'}
                    onPress={() => {
                      const next = tileOpens === 'voice' ? 'note' : 'voice';
                      setTileOpens(next);
                      void repo.setMeta(db, 'tile_opens', next);
                    }}
                  />
                </View>
                <Extra><Text style={[type.meta, { color: c.soft }]}>
                  Hold the Engram icon on your home screen for shortcuts to a voice note, a new note and your to-dos. On a Pixel, Quick Tap
                  (system settings, Gestures) can open Engram when you tap the back of the phone twice.
                </Text></Extra>
              </Section>
              <Section title="Voice notes">
                <View>
                  <Row title="Voice language" sub={langLabel} action="Change" onPress={() => setChoosingLang(true)} />
                  {onDevice ? (
                    pack === 'installed' ? (
                      <Extra><Text style={[type.meta, { color: c.soft, paddingTop: 4 }]}>The offline speech pack for {langLabel} is installed.</Text></Extra>
                    ) : (
                      <Row
                        title="Offline speech pack"
                        sub={
                          pack === 'downloading'
                            ? 'Downloading. Android does not report progress; this row goes away once the pack is installed.'
                            : 'Needed to turn speech into text on this phone'
                        }
                        action={pack === 'downloading' ? 'Working' : 'Download'}
                        onPress={() => (pack === 'downloading' ? undefined : void downloadPack())}
                      />
                    )
                  ) : (
                    <Extra><Text style={[type.meta, { color: c.soft, paddingTop: 4 }]}>
                      This phone cannot transcribe speech offline, so voice notes are saved as audio only.
                    </Text></Extra>
                  )}
                </View>
              </Section>
              <Section title="Today">
                <Row
                  title="A question a day"
                  sub={dailyQ ? 'On. Today shows one question you can answer as a note.' : 'Off.'}
                  action={dailyQ ? 'Turn off' : 'Turn on'}
                  onPress={() => {
                    setDailyQ(!dailyQ);
                    void repo.setMeta(db, 'daily_question', dailyQ ? 'off' : 'on');
                  }}
                />
              </Section>
              <Section title="Through the day">
                <View>
                  <Row
                    title="Morning brief"
                    sub={briefs.morning != null ? `At ${hour(briefs.morning)}: what is due today and the day's question.` : 'Off. A notification with what is due today.'}
                    action="Change"
                    onPress={() => chooseHour('Morning brief', MORNINGS, (h) => void changeBriefs({ ...briefs, morning: h }))}
                  />
                  <Row
                    title="Evening wrap-up"
                    sub={briefs.evening != null ? `At ${hour(briefs.evening)}: how much you saved today, and a nudge to pick out the to-dos.` : 'Off. A notification at the end of the day.'}
                    action="Change"
                    onPress={() => chooseHour('Evening wrap-up', EVENINGS, (h) => void changeBriefs({ ...briefs, evening: h }))}
                  />
                </View>
                <Extra><Text style={[type.meta, { color: c.soft }]}>
                  Both are written on this phone from your own list. They are as up to date as the last time you opened Engram.
                </Text></Extra>
              </Section>
            </Group>
            <Group id="smart" title="Smart features" sub="Linking by meaning, translation, calendar" open={opened.includes('smart')} onToggle={toggleGroup} query={query}>
              <Section title="Linking by meaning">
                <View>
                  <Row
                    title="Understand meaning"
                    sub={smartStatus}
                    action={smartBusy ? 'Working' : smart.status === 'off' || smart.status === 'error' ? 'Turn on' : 'Turn off'}
                    onPress={() => {
                      if (smartBusy) return;
                      if (smart.status === 'off' || smart.status === 'error') void enableSmartLinking(db);
                      else void disableSmartLinking(db);
                    }}
                  />
                </View>
                <Extra><Text style={[type.meta, { color: c.soft }]}>
                  The model runs on this phone and works in 50+ languages. Your thoughts are never sent anywhere; the only download is the model itself.
                </Text></Extra>
              </Section>
              <Section title="Translation">
                <Row
                  title="Translate into English"
                  sub={
                    translate
                      ? 'On. Notes in other languages get an English version under them.'
                      : 'Off. Notes stay only in the language you wrote them in.'
                  }
                  action={translate ? 'Turn off' : 'Turn on'}
                  onPress={() =>
                    run(async () => {
                      const next = !translate;
                      setTranslate(next);
                      await repo.setMeta(db, 'translate', next ? 'on' : 'off');
                      if (!next) {
                        await repo.dropTranslations(db);
                        dataChanged();
                        return 'English versions removed. Your notes are unchanged.';
                      }
                      return runSummary(await translateAll(db));
                    })
                  }
                />
                {translate ? (
                  <Row title="Translate notes not yet done" sub="Checks notes that were skipped or failed last time" action="Try again" onPress={() => run(async () => runSummary(await translateAll(db)))} />
                ) : null}
                <Extra><Text style={[type.meta, { color: c.soft }]}>
                  Translation happens on this phone. Your words are not sent anywhere; the first note in each language downloads a
                  language pack of about 30 MB from Google. The original is always kept.
                </Text></Extra>
              </Section>
              {askOn ? (
                <Section title="Ask your notes">
                  <Row
                    title="Language model"
                    sub={
                      askModel.status === 'ready'
                        ? 'On this phone. Open Search to ask a question.'
                        : askModel.status === 'downloading'
                          ? `Downloading: ${Math.round(askModel.progress * 100)}%. Keep Engram open.`
                          : askModel.status === 'error'
                            ? `The download did not finish. ${askModel.message ?? ''}`.trim()
                            : `Not downloaded. It is ${ASK_SIZE_NOTE}; use Wi-Fi.`
                    }
                    action={askModel.status === 'ready' ? 'Remove' : askModel.status === 'downloading' ? 'Wait' : 'Download'}
                    onPress={() => {
                      if (askModel.status === 'ready') void removeAsk(db);
                      else if (askModel.status !== 'downloading') void prepareAsk(db);
                    }}
                  />
                  <Extra><Text style={[type.meta, { color: c.soft }]}>
                    Questions are answered on this phone from your notes. Nothing you write or ask is sent anywhere; only the model itself is downloaded.
                  </Text></Extra>
                </Section>
              ) : null}
              <Section title="Calendar">
                <View>
                  <Row
                    title="Show today's events"
                    sub={calendar ? 'On. Tap an event on Today to take notes on it.' : 'Off. Engram does not read your calendar.'}
                    action={calendar ? 'Turn off' : 'Turn on'}
                    onPress={toggleCalendar}
                  />
                </View>
              </Section>
            </Group>
            <Group id="privacy" title="Privacy and security" sub="App lock, usage counts, Engram Cloud" open={opened.includes('privacy')} onToggle={toggleGroup} query={query}>
              <Section title="Privacy">
                <View>
                  <Row
                    title="App lock"
                    sub={lock.on ? 'On. Engram asks for your fingerprint, face or PIN when you open it.' : 'Off. Anyone holding the unlocked phone can open Engram.'}
                    action={lock.on ? 'Turn off' : 'Turn on'}
                    onPress={toggleLock}
                  />
                  {lock.on ? (
                    <Row
                      title="Lock"
                      sub={LOCK_DELAYS.find((d) => d.ms === lock.afterMs)?.label ?? 'Straight away'}
                      action="Change"
                      onPress={() =>
                        setChoice({
                          title: 'Lock Engram',
                          options: LOCK_DELAYS.map((d) => ({
                            label: `${d.label}${d.ms ? ' away' : ''}`,
                            onPress: () => {
                              const next = { ...lock, afterMs: d.ms };
                              setLock(next);
                              void saveLockSetting(db, next).then(() => dataChanged());
                            },
                          })),
                        })
                      }
                    />
                  ) : null}
                </View>
                <Extra><Text style={[type.meta, { color: c.soft }]}>
                  Sharing into Engram, widgets and new notes still work while it is locked. Reading anything needs the unlock.
                </Text></Extra>
                <View>
                  <Row
                    title="Share usage counts"
                    sub={
                      usage === 'yes'
                        ? 'On. Once a day, anonymous totals of which features you used. Never your notes, never an id.'
                        : 'Off. Nothing about how you use Engram is counted or sent.'
                    }
                    action={usage === 'yes' ? 'Turn off' : 'Turn on'}
                    onPress={toggleUsage}
                  />
                  <Row title="What's sent" sub="The exact counts for today, in plain words" action="Show" onPress={() => void showUsage()} />
                </View>
              </Section>
              {cloudOn ? (
                <Section title="Engram Cloud" terms="sync account sign in devices">
                  <CloudSection />
                </Section>
              ) : null}
            </Group>
            <Group id="data" title="Your data" sub="Back up, restore, export, trash" open={opened.includes('data')} onToggle={toggleGroup} query={query}>
              <Section title="Your thoughts">
                <View>
                  <Row
                    title="Back up"
                    sub="One zip with your thoughts, tags, links, photos, recordings and files"
                    action="Export"
                    onPress={() =>
                      run(async () => {
                        const r = await exportFullBackup(db);
                        countUse(M.backupExport);
                        return `Backup created with ${r.thoughts} thoughts and ${r.files} files.${r.leftOut ? ` ${r.leftOut} files could not be included.` : ''}`;
                      })
                    }
                  />
                  <Row
                    title="Restore"
                    sub="Add thoughts from a backup, with their files. Also how you move from an older Engram."
                    action="Import"
                    onPress={() =>
                      run(async () => {
                        const r = await importBackup(db);
                        countUse(M.backupRestore);
                        return r ? `Added ${r.added} thoughts and ${r.files} files. ${r.skipped} were already here.` : null;
                      })
                    }
                  />
                  <Row
                    title="Back up every week"
                    sub={
                      backupTo.folder
                        ? `On. ${backupTo.last ? `Last written ${new Date(backupTo.last).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}.` : 'Not written yet.'} Words, tags and links; files and recordings are not included.`
                        : 'Off. Choose a folder and Engram writes a backup file there once a week when you open it.'
                    }
                    action={backupTo.folder ? 'Stop' : 'Choose'}
                    onPress={() =>
                      run(async () => {
                        if (backupTo.folder) {
                          await stopAutoBackup(db);
                          setBackupTo({ folder: null, last: backupTo.last });
                          return 'Weekly backups stopped. Files already written stay where they are.';
                        }
                        if (!(await chooseBackupFolder(db))) return null;
                        setBackupTo({ folder: await autoBackupFolder(db), last: Date.now() });
                        return 'The first backup is in that folder. A new one is written each week.';
                      })
                    }
                  />
                  <Row title="Export as Markdown" sub="A zip with one .md file per note, links as [[Title]]. Opens in Obsidian and similar apps." action="Export" onPress={() => run(async () => `Exported ${await exportMarkdown(db)} notes.`)} />
                  <Row
                    title="Bring in notes"
                    sub="Markdown or text files, Google Keep's Takeout files, or a zip of them"
                    action="Import"
                    onPress={() =>
                      run(async () => {
                        const r = await importNotes(db, rebuildAllLinks);
                        if (!r) return null;
                        return `Added ${r.added} ${r.added === 1 ? 'note' : 'notes'}.${r.skipped ? ` ${r.skipped} ${r.skipped === 1 ? 'file was' : 'files were'} not notes and were left out.` : ''}`;
                      })
                    }
                  />
                  <Row title="Trash" sub={trashed === 0 ? 'Empty. Deleted thoughts wait here for 30 days.' : `${trashed} deleted ${trashed === 1 ? 'thought' : 'thoughts'}, kept for 30 days`} action="Open" onPress={() => router.push('/trash')} />
                  <Row title="Rebuild links" sub="Recalculate automatic links and groups" action="Rebuild" onPress={() => run(async () => `Found ${await rebuildAllLinks(db)} links.`)} />
                  {count === 0 ? (
                    <Row title="Sample thoughts" sub="See how Engram works with examples" action="Load" onPress={() => run(async () => ((await loadSamples(db)) ? 'Sample thoughts loaded.' : null))} />
                  ) : (
                    <Row title="Delete everything" sub={`${count} ${count === 1 ? 'thought' : 'thoughts'} on this phone`} action="Delete" danger onPress={confirmWipe} />
                  )}
                </View>
              </Section>
            </Group>
            <Group id="help" title="Help and about" sub="The tour, privacy policy, contact" open={opened.includes('help')} onToggle={toggleGroup} query={query}>
              <Section title="Help">
                <View>
                  <Row title="The tour" sub="Five short pages on what Engram does and how to use it" action="Show" onPress={() => router.push('/tour')} />
                  <Row title="The month in review" sub="A month of your notes in a few numbers" action="Open" onPress={() => router.push('/recap')} />
                </View>
              </Section>
              <Section title="About">
                <View>
                  <Row title="Privacy Policy" sub="What Engram stores and sends" action="Open" onPress={() => void Linking.openURL('https://engrm.app/privacy')} />
                  <Row title="Terms of Use" sub="The rules for using Engram" action="Open" onPress={() => void Linking.openURL('https://engrm.app/terms')} />
                  <Row title="Contact" sub="contact@engrm.app" action="Email" onPress={() => void Linking.openURL('mailto:contact@engrm.app')} />
                </View>
              </Section>
            </Group>
          </Groups>

          <Text style={[type.meta, { color: c.faint }]}>Engram {Constants.expoConfig?.version ?? ''}</Text>
        </View>
      </ScrollView>
      <ActionSheet visible={choice !== null} title={choice?.title} message={choice?.message} options={choice?.options ?? []} onClose={() => setChoice(null)} />
      <ActionSheet
        visible={choosingLang}
        title="Voice language"
        onClose={() => setChoosingLang(false)}
        options={SPEECH_LANGS.map((l) => ({
          label: l.label,
          icon: l.code === lang ? ('check' as const) : undefined,
          onPress: () => {
            setLang(l.code);
            void repo.setMeta(db, 'speech_lang', l.code);
          },
        }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingVertical: 10, borderTopWidth: 1 },
  action: { height: 48, minWidth: 92, paddingHorizontal: 18, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  segments: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 28, borderWidth: 1 },
  segment: { flex: 1, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});

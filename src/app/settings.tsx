import Constants from 'expo-constants';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { useSQLiteContext } from 'expo-sqlite';
import { type ReactNode, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Header, Notice } from '@/components/ui';
import * as repo from '@/db/repo';
import { exportBackup, importBackup } from '@/lib/backup';
import { dataChanged, useDataVersion } from '@/lib/bus';
import { rebuildAllLinks } from '@/lib/capture';
import { loadSamples } from '@/lib/samples';
import { canTranscribeOnDevice, SPEECH_LANGS, speechLang } from '@/lib/useVoice';
import { type AppearanceSetting, type, useTheme } from '@/theme';

function Row({ title, sub, action, onPress, danger }: { title: string; sub: string; action: string; onPress: () => void; danger?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[styles.row, { borderTopColor: c.rule }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.bodyStrong, { color: c.ink }]}>{title}</Text>
        <Text style={[type.meta, { color: c.soft }]}>{sub}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${action}: ${title}`}
        onPress={onPress}
        style={({ pressed }) => [styles.action, { backgroundColor: c.surface, borderColor: c.line, opacity: pressed ? 0.6 : 1 }]}>
        <Text style={[type.smallStrong, { color: danger ? c.danger : c.ink }]}>{action}</Text>
      </Pressable>
    </View>
  );
}

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

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <Text style={[type.labelStrong, { color: c.ink }]}>{title}</Text>
      {children}
    </View>
  );
}

const APPEARANCES: { value: AppearanceSetting; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'black', label: 'Black' },
];

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const { c, appearance, setAppearance } = useTheme();
  const insets = useSafeAreaInsets();
  const version = useDataVersion();
  const [lang, setLang] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const onDevice = canTranscribeOnDevice();

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

  const langLabel = SPEECH_LANGS.find((l) => l.code === lang)?.label ?? 'English';

  const chooseLang = () => {
    Alert.alert('Voice language', 'Voice notes are transcribed in this language.', [
      ...SPEECH_LANGS.map((l) => ({
        text: l.label,
        onPress: () => {
          setLang(l.code);
          void repo.setMeta(db, 'speech_lang', l.code);
        },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const confirmWipe = () => {
    Alert.alert('Delete everything?', `All ${count} thoughts, their links and tags are deleted from this phone. This cannot be undone.`, [
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
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40, gap: 26 }}>
        <Header title="Settings" back="Today" sub="Everything stays on this phone" />
        <View style={{ paddingHorizontal: 24, gap: 26 }}>
          <Notice text={status} />

          <Section title="Appearance">
            <Segments options={APPEARANCES} value={appearance} onChange={setAppearance} />
            <Text style={[type.meta, { color: c.soft }]}>Black uses true black to save power on AMOLED screens. System follows your phone.</Text>
          </Section>

          <Section title="Voice notes">
            <View>
              <Row title="Voice language" sub={langLabel} action="Change" onPress={chooseLang} />
              {onDevice ? (
                <Row
                  title="Offline speech pack"
                  sub="Needed to transcribe on this phone"
                  action="Download"
                  onPress={() =>
                    run(async () => {
                      if (!lang) return null;
                      const r = await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale: lang });
                      return r.status === 'download_success' ? 'Speech pack installed.' : 'Android is handling the download. Try a voice note once it finishes.';
                    })
                  }
                />
              ) : (
                <Text style={[type.meta, { color: c.soft, paddingTop: 4 }]}>
                  This phone cannot transcribe speech offline, so voice notes are saved as audio only.
                </Text>
              )}
            </View>
          </Section>

          <Section title="Your thoughts">
            <View>
              <Row title="Back up" sub="One file with thoughts, tags and links" action="Export" onPress={() => run(async () => `Backup created with ${await exportBackup(db)} thoughts.`)} />
              <Row
                title="Restore"
                sub="Add thoughts from a backup file"
                action="Import"
                onPress={() =>
                  run(async () => {
                    const r = await importBackup(db);
                    return r ? `Added ${r.added} thoughts. ${r.skipped} were already here.` : null;
                  })
                }
              />
              <Row title="Rebuild links" sub="Recalculate automatic links and groups" action="Rebuild" onPress={() => run(async () => `Found ${await rebuildAllLinks(db)} links.`)} />
              {count === 0 ? (
                <Row title="Sample thoughts" sub="See how Engram works with examples" action="Load" onPress={() => run(async () => ((await loadSamples(db)) ? 'Sample thoughts loaded.' : null))} />
              ) : (
                <Row title="Delete everything" sub={`${count} ${count === 1 ? 'thought' : 'thoughts'} on this phone`} action="Delete" danger onPress={confirmWipe} />
              )}
            </View>
          </Section>

          <Text style={[type.meta, { color: c.faint }]}>Engram {Constants.expoConfig?.version ?? ''}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingVertical: 10, borderTopWidth: 1 },
  action: { height: 48, minWidth: 92, paddingHorizontal: 18, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  segments: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 28, borderWidth: 1 },
  segment: { flex: 1, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});

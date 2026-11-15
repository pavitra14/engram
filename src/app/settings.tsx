import Constants from 'expo-constants';
import { router } from 'expo-router';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { useSQLiteContext } from 'expo-sqlite';
import { type ReactNode, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, IconButton } from '@/components/ui';
import * as repo from '@/db/repo';
import { exportBackup, importBackup } from '@/lib/backup';
import { dataChanged, useDataVersion } from '@/lib/bus';
import { rebuildAllLinks } from '@/lib/capture';
import { loadSamples } from '@/lib/samples';
import { canTranscribeOnDevice, SPEECH_LANGS, speechLang } from '@/lib/useVoice';
import { colors, radius, space, type } from '@/theme';

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[type.title, { color: colors.text }]}>{title}</Text>
      {note ? <Text style={[type.small, { color: colors.textSoft }]}>{note}</Text> : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export default function SettingsScreen() {
  const db = useSQLiteContext();
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

  const chooseLang = async (code: string) => {
    setLang(code);
    await repo.setMeta(db, 'speech_lang', code);
  };

  const downloadSpeechPack = () =>
    run(async () => {
      if (!lang) return null;
      const result = await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale: lang });
      return result.status === 'download_success'
        ? 'Speech pack installed.'
        : 'Android is handling the speech pack download. Try a voice note once it finishes.';
    });

  const confirmWipe = () => {
    Alert.alert(
      'Delete everything?',
      `All ${count} thoughts, their connections and tags are deleted from this phone. This cannot be undone.`,
      [
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
      ],
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.head}>
        <IconButton icon="arrow-left" label="Back to the graph" onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: insets.bottom + space.xl, gap: space.xl }}>
        <Text style={[type.display, { color: colors.text }]}>Settings</Text>

        {status ? (
          <View style={styles.status} accessibilityLiveRegion="polite">
            <Text style={[type.small, { color: colors.text }]}>{status}</Text>
          </View>
        ) : null}

        <Section
          title="Voice notes"
          note={
            onDevice
              ? 'Voice notes are transcribed on this phone. Audio never leaves it.'
              : 'This phone cannot transcribe speech offline (it needs Android 13 or newer with on-device speech). Voice notes are saved as audio only.'
          }>
          <View style={styles.chips}>
            {SPEECH_LANGS.map((l) => (
              <Chip key={l.code} label={l.label} selected={lang === l.code} onPress={() => void chooseLang(l.code)} />
            ))}
          </View>
          {onDevice ? <Button title="Download speech pack for this language" icon="download" onPress={downloadSpeechPack} /> : null}
        </Section>

        <Section
          title="Connections"
          note="Engram links thoughts that share words, tags or a website. Rebuilding recalculates every automatic link; links you made by hand are kept.">
          <Button
            title="Rebuild connections"
            icon="refresh-cw"
            onPress={() => run(async () => `Found ${await rebuildAllLinks(db)} connections.`)}
          />
        </Section>

        <Section
          title="Backup"
          note="A backup is one file with your thoughts, tags and connections. Recordings and images stay on this phone and are not included.">
          <Button
            title="Export a backup"
            icon="upload"
            onPress={() => run(async () => `Backup created with ${await exportBackup(db)} thoughts.`)}
          />
          <Button
            title="Import a backup"
            icon="download"
            onPress={() =>
              run(async () => {
                const r = await importBackup(db);
                return r ? `Added ${r.added} thoughts. ${r.skipped} were already here.` : null;
              })
            }
          />
        </Section>

        <Section title="Your data" note={`${count} ${count === 1 ? 'thought' : 'thoughts'} stored on this phone. Nothing is uploaded anywhere.`}>
          {count === 0 ? (
            <Button
              title="Load sample thoughts"
              onPress={() => run(async () => ((await loadSamples(db)) ? 'Sample thoughts loaded.' : null))}
            />
          ) : (
            <Button title="Delete everything" tone="danger" icon="trash-2" onPress={confirmWipe} />
          )}
        </Section>

        <Text style={[type.small, { color: colors.textFaint }]}>Engram {Constants.expoConfig?.version ?? ''}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  head: { flexDirection: 'row', paddingHorizontal: space.sm },
  section: { gap: space.sm },
  sectionBody: { gap: space.sm, marginTop: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  status: {
    padding: space.md,
    borderRadius: radius.card,
    backgroundColor: colors.inkLifted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
  },
});

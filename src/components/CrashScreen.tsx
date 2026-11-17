import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { openDatabase } from '@/db/powersync';
import { exportBackup } from '@/lib/backup';
import { type, useTheme } from '@/theme';
import { count, M } from '@/lib/usage';

/**
 * Shown in place of a screen that failed while drawing. It may be drawn outside
 * the app's usual providers, so it uses nothing but the theme (which falls back
 * to the light palette) and opens the database for itself if a backup is asked for.
 */
export function CrashScreen({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  useEffect(() => count(M.crashScreen), []);
  const { c } = useTheme();
  const [note, setNote] = useState<string | null>(null);
  const details = [
    `Engram ${Constants.expoConfig?.version ?? '?'} on Android ${Platform.Version}`,
    `${error.name}: ${error.message}`,
    (error.stack ?? '').split('\n').slice(0, 12).join('\n'),
  ].join('\n');

  const button = (title: string, onPress: () => void, solid = false) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: solid ? c.accent : 'transparent', borderColor: solid ? c.accent : c.line, opacity: pressed ? 0.7 : 1 }]}>
      <Text style={[type.labelStrong, { color: solid ? c.onAccent : c.ink }]}>{title}</Text>
    </Pressable>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={styles.page}>
      <Text style={[type.title, { color: c.ink }]}>Something went wrong on this screen</Text>
      <Text style={[type.body, { color: c.soft }]}>
        Your thoughts are still saved on this phone. Try the screen again. If it keeps happening, copy the details and send them to
        whoever gave you Engram: nothing is reported automatically.
      </Text>
      <View style={styles.buttons}>
        {button('Try again', () => void retry(), true)}
        {button('Copy details', () => void Clipboard.setStringAsync(details).then(() => setNote('Copied. The details contain no notes.')))}
        {button('Export a backup', () => {
          void (async () => {
            try {
              const n = await exportBackup(await openDatabase());
              setNote(`Backup made with ${n} thoughts (words, tags and links).`);
            } catch (e) {
              setNote(`A backup could not be made from here. ${e instanceof Error ? e.message : ''}`.trim());
            }
          })();
        })}
      </View>
      {note ? (
        <Text style={[type.small, { color: c.ink }]} accessibilityLiveRegion="polite">
          {note}
        </Text>
      ) : null}
      <Text selectable style={[type.meta, { color: c.soft }]}>
        {details}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 24, paddingTop: 96, paddingBottom: 48, gap: 16 },
  buttons: { gap: 10 },
  button: { minHeight: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
});

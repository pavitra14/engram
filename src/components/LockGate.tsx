import { usePathname } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { useDb } from '@/db/provider';
import { useDataVersion } from '@/lib/bus';
import { confirmItIsYou, lockSetting } from '@/lib/lock';
import { type, useTheme } from '@/theme';

import { Button } from './ui';

/** Screens that only take something in. They work while locked, so sharing and widgets stay quick. */
const OPEN_WHILE_LOCKED = ['/handle-share', '/compose', '/voice', '/tile'];

/**
 * Covers the app until Android confirms it is you, when app lock is on and
 * Engram has been away longer than the chosen time. A cover rather than a
 * separate screen, so whatever was open is still there afterwards.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const db = useDb();
  const { c } = useTheme();
  const path = usePathname();
  const version = useDataVersion();
  const [setting, setSetting] = useState<{ on: boolean; afterMs: number } | null>(null);
  const [locked, setLocked] = useState(false);
  const leftAt = useRef<number | null>(null);
  const started = useRef(false);

  useEffect(() => {
    let live = true;
    void lockSetting(db).then((s) => {
      if (!live) return;
      setSetting(s);
      // Opening the app counts as coming back after any length of time.
      if (!started.current) {
        started.current = true;
        if (s.on) setLocked(true);
      }
      if (!s.on) setLocked(false);
    });
    return () => {
      live = false;
    };
  }, [db, version]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') leftAt.current = Date.now();
      if (state === 'active' && leftAt.current !== null) {
        const away = Date.now() - leftAt.current;
        leftAt.current = null;
        if (setting?.on && away >= setting.afterMs) setLocked(true);
      }
    });
    return () => sub.remove();
  }, [setting]);

  const unlock = useCallback(
    () =>
      confirmItIsYou('Unlock Engram').then((ok) => {
        if (ok) setLocked(false);
      }),
    [],
  );

  const covered = locked && !OPEN_WHILE_LOCKED.includes(path);

  // Ask as soon as the cover appears; the button is there if the prompt is dismissed.
  const asked = useRef(false);
  useEffect(() => {
    if (!covered) {
      asked.current = false;
      return;
    }
    if (asked.current) return;
    asked.current = true;
    void unlock();
  }, [covered, unlock]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {covered ? (
        <View style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: c.bg }]} accessibilityViewIsModal>
          <Text style={[type.title, { color: c.ink }]}>Engram is locked</Text>
          <Text style={[type.body, { color: c.soft, textAlign: 'center' }]}>Use your fingerprint, face or the phone&rsquo;s PIN to open it.</Text>
          <Button title="Unlock" tone="solid" onPress={() => void unlock()} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
});

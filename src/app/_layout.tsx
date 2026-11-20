import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { Newsreader_400Regular, Newsreader_500Medium, useFonts } from '@expo-google-fonts/newsreader';
import * as Notifications from 'expo-notifications';
import { type ErrorBoundaryProps, router, Stack, usePathname } from 'expo-router';
import { getSharedPayloads } from 'expo-sharing';
import * as SplashScreen from 'expo-splash-screen';
import { DbProvider, useDb } from '@/db/provider';
import { StatusBar } from 'expo-status-bar';
import { Accelerometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import * as repo from '@/db/repo';
import { ACTION_DONE, ACTION_LATER, actionFrom, setDone, snooze, thoughtIdFrom } from '@/lib/reminders';
import { startSmartLinking } from '@/lib/smart';
import { CrashScreen } from '@/components/CrashScreen';
import { LockGate } from '@/components/LockGate';
import { ThoughtMenuProvider } from '@/components/ThoughtMenu';
import { ToastHost } from '@/components/Toast';
import { backupIfDue } from '@/lib/backup';
import { refreshBriefs, SPEAK } from '@/lib/briefs';
import { emptyOldTrash, relink } from '@/lib/capture';
import { endFocus, FOCUS_DONE, FOCUS_MORE, settleFocus, startFocus } from '@/lib/focus';
import { readOldPictures } from '@/lib/ocr';
import { ThemeProvider, useTheme } from '@/theme';
import { dataChanged, useDataVersion } from '@/lib/bus';
import { refreshWidgets } from '@/widgets/snapshot';
import { startCloud } from '@/cloud/cloud';
import { appOpened, sendUsage, startUsage } from '@/lib/usage';

void SplashScreen.preventAutoHideAsync();

function Screens() {
  const { c, dark } = useTheme();
  const db = useDb();
  const lastResponse = Notifications.useLastNotificationResponse();

  // Keep the home-screen widgets in step with the to-do list and the theme.
  const version = useDataVersion();
  useEffect(() => {
    void refreshWidgets(db);
  }, [db, version, dark]);

  // The morning brief and evening wrap-up are written from today's data, so they are rewritten when it changes.
  useEffect(() => {
    const t = setTimeout(() => void refreshBriefs(db), 2500);
    return () => clearTimeout(t);
  }, [db, version]);

  // Housekeeping on opening the app, and on coming back to it: old trash, a finished focus session, the weekly backup, unread pictures.
  useEffect(() => {
    const tidy = () => {
      void emptyOldTrash(db).catch(() => {});
      void settleFocus(db).catch(() => {});
      void backupIfDue(db);
    };
    tidy();
    void readOldPictures(db, (id) => relink(db, id).then(() => dataChanged()));
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tidy();
    });
    return () => sub.remove();
  }, [db]);

  // A share that opened Engram from cold must not be lost. Expo Router gives Android only
  // 150 ms to report the address the app was opened with; a slow start misses it and opens
  // on Today, while the share waits unread in the share library. So look for a waiting share
  // once the screens are up, and whenever the app comes back, and open the share sheet for it.
  // The share screen clears what it saved, so nothing is saved twice.
  const pathname = usePathname();
  const onShare = useRef(false);
  useEffect(() => {
    onShare.current = pathname === '/handle-share';
  }, [pathname]);
  useEffect(() => {
    let wait: ReturnType<typeof setTimeout> | undefined;
    const look = () => {
      clearTimeout(wait);
      wait = setTimeout(() => {
        if (onShare.current) return;
        try {
          if (getSharedPayloads().length > 0) router.push('/handle-share');
        } catch {
          // No share library on this platform.
        }
      }, 600);
    };
    look();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') look();
    });
    return () => {
      clearTimeout(wait);
      sub.remove();
    };
  }, []);

  // Shake to start a voice note, if switched on in Settings. Only while Engram is open:
  // listening in the background would need a permanent notification and would drain the battery.
  const [shake, setShake] = useState(false);
  useEffect(() => {
    void repo.getMeta(db, 'shake').then((v) => setShake(v === 'on'));
  }, [db, version]);
  useEffect(() => {
    if (!shake) return;
    let last = 0;
    let hits = 0;
    Accelerometer.setUpdateInterval(120);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      // Resting, the phone reads about 1 g. A shake swings well past that several times in a row.
      const g = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();
      if (g < 2.2 || now < last) return;
      hits = now - last < 600 ? hits + 1 : 1;
      last = now;
      if (hits >= 3) {
        hits = 0;
        // Ignore the rest of the same shake.
        last = now + 3000;
        router.push('/voice');
      }
    });
    return () => sub.remove();
  }, [shake]);

  // Engram Cloud does nothing unless someone has signed in on this phone. The flags it loads
  // also decide whether usage counts may be sent; they only ever are if the person said yes.
  useEffect(() => {
    void startUsage(db)
      .then(() => startCloud(db))
      .then(() => sendUsage(db))
      .catch(() => {});
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      appOpened();
      void sendUsage(db).catch(() => {});
    });
    return () => sub.remove();
  }, [db]);

  // Load the language model in the background if meaning-based linking is on.
  useEffect(() => {
    void startSmartLinking(db);
  }, [db]);

  // Tapping a reminder opens its thought. Its two buttons finish it or move it an hour on.
  useEffect(() => {
    const data = lastResponse?.notification.request.content.data as { open?: unknown; focus?: unknown } | undefined;
    const pressed = lastResponse?.actionIdentifier;
    // The quick-note notification, the briefs and a project's date say where they lead.
    if (pressed === SPEAK) {
      const t = setTimeout(() => router.push('/voice'), 50);
      return () => clearTimeout(t);
    }
    if (typeof data?.open === 'string' && data.open.startsWith('/')) {
      const to = data.open;
      const t = setTimeout(() => router.push(to as never), 50);
      return () => clearTimeout(t);
    }
    const id = thoughtIdFrom(lastResponse);
    if (!id) return;
    // The focus timer ran out: finish the to-do, go on for five minutes, or just open it.
    if (data?.focus) {
      void (async () => {
        await endFocus(db);
        const t = await repo.getThought(db, id);
        if (!t) return;
        if (pressed === FOCUS_DONE) await setDone(db, t, true);
        else if (pressed === FOCUS_MORE) await startFocus(db, t, 5);
        else router.push('/todo');
      })();
      return;
    }
    const action = actionFrom(lastResponse);
    if (action) {
      void repo.getThought(db, id).then((t) => {
        if (!t) return;
        if (action === ACTION_DONE) void setDone(db, t, true);
        if (action === ACTION_LATER) void snooze(db, t, 3_600_000);
      });
      return;
    }
    const t = setTimeout(() => router.push({ pathname: '/thought/[id]', params: { id } }), 50);
    return () => clearTimeout(t);
  }, [db, lastResponse]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {/*
        Each screen arrives the way that matches what it is. Going deeper into your
        thoughts (a thought, a group) pushes in from the side and swipes back.
        Places you glance at and leave (the map, search, to-dos, settings) fade
        through quickly. Things you start and finish (a note, a recording, a share)
        rise from the bottom like a sheet. Durations are short on purpose.
      */}
      <LockGate>
      <ThoughtMenuProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'ios_from_right', animationDuration: 220 }}>
        <Stack.Screen name="index" options={{ animation: 'fade', animationDuration: 140 }} />
        <Stack.Screen name="thought/[id]" options={{ animation: 'ios_from_right', animationDuration: 220 }} />
        <Stack.Screen name="group/[id]" options={{ animation: 'ios_from_right', animationDuration: 220 }} />
        <Stack.Screen name="map" options={{ animation: 'fade', animationDuration: 160 }} />
        <Stack.Screen name="todo" options={{ animation: 'fade_from_bottom', animationDuration: 180 }} />
        <Stack.Screen name="settings" options={{ animation: 'fade_from_bottom', animationDuration: 180 }} />
        <Stack.Screen name="search" options={{ animation: 'fade', animationDuration: 120 }} />
        <Stack.Screen name="compose" options={{ animation: 'slide_from_bottom', animationDuration: 240, gestureDirection: 'vertical' }} />
        <Stack.Screen name="voice" options={{ animation: 'slide_from_bottom', animationDuration: 240, gestureEnabled: false }} />
        <Stack.Screen name="handle-share" options={{ animation: 'slide_from_bottom', animationDuration: 200 }} />
        <Stack.Screen name="samples" options={{ animation: 'none' }} />
        <Stack.Screen name="latest" options={{ animation: 'none' }} />
        <Stack.Screen name="review" options={{ animation: 'fade_from_bottom', animationDuration: 180 }} />
        <Stack.Screen name="tour" options={{ animation: 'fade', animationDuration: 160, gestureEnabled: false }} />
        <Stack.Screen name="ask" options={{ animation: 'fade_from_bottom', animationDuration: 180 }} />
        <Stack.Screen name="recap" options={{ animation: 'fade_from_bottom', animationDuration: 180 }} />
        <Stack.Screen name="trash" options={{ animation: 'ios_from_right', animationDuration: 220 }} />
        <Stack.Screen name="tile" options={{ animation: 'none' }} />
        <Stack.Screen name="surprise" options={{ animation: 'none' }} />
      </Stack>
      </ThoughtMenuProvider>
      <ToastHost />
      </LockGate>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Newsreader_400Regular,
    Newsreader_500Medium,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <DbProvider>
      <ThemeProvider>
        <Screens />
      </ThemeProvider>
    </DbProvider>
  );
}

/**
 * What is shown if a screen fails while drawing. Usage counts (if the person said yes)
 * only record that this screen appeared, never the error, so the details here are the
 * only way a fault gets described: the person copies them and sends them.
 * A backup can be taken from here too, in case the fault stops the app being used.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <CrashScreen error={error} retry={retry} />;
}

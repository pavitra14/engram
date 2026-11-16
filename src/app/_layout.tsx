import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { Newsreader_400Regular, Newsreader_500Medium, useFonts } from '@expo-google-fonts/newsreader';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { DbProvider, useDb } from '@/db/provider';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import * as repo from '@/db/repo';
import { ACTION_DONE, ACTION_LATER, actionFrom, setDone, snooze, thoughtIdFrom } from '@/lib/reminders';
import { startSmartLinking } from '@/lib/smart';
import { ThoughtMenuProvider } from '@/components/ThoughtMenu';
import { ThemeProvider, useTheme } from '@/theme';
import { useDataVersion } from '@/lib/bus';
import { refreshWidgets } from '@/widgets/snapshot';
import { startCloud } from '@/cloud/cloud';

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

  // Engram Cloud does nothing unless someone has signed in on this phone.
  useEffect(() => {
    void startCloud(db);
  }, [db]);

  // Load the language model in the background if meaning-based linking is on.
  useEffect(() => {
    void startSmartLinking(db);
  }, [db]);

  // Tapping a reminder opens its thought. Its two buttons finish it or move it an hour on.
  useEffect(() => {
    const id = thoughtIdFrom(lastResponse);
    if (!id) return;
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
      </Stack>
      </ThoughtMenuProvider>
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

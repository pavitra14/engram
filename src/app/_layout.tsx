import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { Newsreader_400Regular, Newsreader_500Medium, useFonts } from '@expo-google-fonts/newsreader';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { migrate } from '@/db/migrate';
import { thoughtIdFrom } from '@/lib/reminders';
import { startSmartLinking } from '@/lib/smart';
import { ThemeProvider, useTheme } from '@/theme';

void SplashScreen.preventAutoHideAsync();

function Screens() {
  const { c, dark } = useTheme();
  const db = useSQLiteContext();
  const lastResponse = Notifications.useLastNotificationResponse();

  // Load the language model in the background if meaning-based linking is on.
  useEffect(() => {
    void startSmartLinking(db);
  }, [db]);

  // Tapping a reminder opens its thought.
  useEffect(() => {
    const id = thoughtIdFrom(lastResponse);
    if (!id) return;
    const t = setTimeout(() => router.push({ pathname: '/thought/[id]', params: { id } }), 50);
    return () => clearTimeout(t);
  }, [lastResponse]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'slide_from_right' }}>
        <Stack.Screen name="voice" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="compose" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="search" options={{ animation: 'fade' }} />
        <Stack.Screen name="handle-share" options={{ animation: 'fade' }} />
      </Stack>
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
    <SQLiteProvider databaseName="engram.db" onInit={migrate}>
      <ThemeProvider>
        <Screens />
      </ThemeProvider>
    </SQLiteProvider>
  );
}

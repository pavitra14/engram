/** Sends anything arriving from the Android share sheet to the capture screen. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (new URL(path).hostname === 'expo-sharing') return '/handle-share';
    return path;
  } catch {
    return path.includes('expo-sharing') ? '/handle-share' : path;
  }
}

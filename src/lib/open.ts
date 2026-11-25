import { getContentUriAsync } from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { Thought } from '@/db/types';

/** Opens a saved picture, video or document in whichever app on the phone handles that kind of file. */
export async function openFile(thought: Thought): Promise<void> {
  if (!thought.media_path) return;
  const type = thought.mime_type ?? (thought.kind === 'video' ? 'video/*' : thought.kind === 'image' ? 'image/*' : '*/*');
  if (Platform.OS === 'android') {
    try {
      const data = await getContentUriAsync(thought.media_path);
      // 1 = FLAG_GRANT_READ_URI_PERMISSION, so the other app may read this one file.
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data, flags: 1, type });
      return;
    } catch {
      // No app claims this type; fall through to the share sheet.
    }
  }
  await Sharing.shareAsync(thought.media_path, { mimeType: thought.mime_type ?? undefined });
}

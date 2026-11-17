import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { useDb } from '@/db/provider';
import * as repo from '@/db/repo';
import { useTheme } from '@/theme';

/** engram://tile: where the Quick Settings tile lands. It goes on to a voice note or a new note, whichever was chosen in Settings. */
export default function TileScreen() {
  const db = useDb();
  const { c } = useTheme();
  useEffect(() => {
    void repo.getMeta(db, 'tile_opens').then((v) => router.replace(v === 'note' ? '/compose' : '/voice'));
  }, [db]);
  return <View style={{ flex: 1, backgroundColor: c.bg }} />;
}

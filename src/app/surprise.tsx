import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { useDb } from '@/db/provider';
import * as repo from '@/db/repo';
import { surprise } from '@/lib/recall';
import { useTheme } from '@/theme';

/** engram://surprise opens an older note chosen at random. Used by the home-screen widget. */
export default function SurpriseScreen() {
  const db = useDb();
  const { c } = useTheme();
  useEffect(() => {
    void repo.listThoughts(db, { limit: 5000 }).then((rows) => {
      const pick = surprise(rows, Math.random());
      if (pick) router.replace({ pathname: '/thought/[id]', params: { id: pick.id } });
      else router.replace('/');
    });
  }, [db]);
  return <View style={{ flex: 1, backgroundColor: c.bg }} />;
}

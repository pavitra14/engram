import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { useDb } from '@/db/provider';
import * as repo from '@/db/repo';

/** engram://latest opens the newest thought. `?menu=todo` also opens its to-do menu (used by the automated test). */
export default function LatestScreen() {
  const db = useDb();
  const { menu } = useLocalSearchParams<{ menu?: string }>();
  useEffect(() => {
    void repo.listThoughts(db, { limit: 1 }).then(([t]) => {
      if (t) router.replace({ pathname: '/thought/[id]', params: menu ? { id: t.id, menu } : { id: t.id } });
      else router.replace('/');
    });
  }, [db, menu]);
  return null;
}

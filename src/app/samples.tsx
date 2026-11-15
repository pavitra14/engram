import { Redirect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';

import { loadSamples } from '@/lib/samples';

/** engram://samples loads the demo thoughts into an empty brain. Used by the automated smoke test. */
export default function SamplesRoute() {
  const db = useSQLiteContext();
  const [done, setDone] = useState(false);
  useEffect(() => {
    loadSamples(db).finally(() => setDone(true));
  }, [db]);
  return done ? <Redirect href="/" /> : null;
}

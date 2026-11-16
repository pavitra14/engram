import { Redirect } from 'expo-router';
import { useDb } from '@/db/provider';
import { useEffect, useState } from 'react';

import { loadSamples } from '@/lib/samples';

/** engram://samples loads the demo thoughts into an empty brain. Used by the automated smoke test. */
export default function SamplesRoute() {
  const db = useDb();
  const [done, setDone] = useState(false);
  useEffect(() => {
    loadSamples(db).finally(() => setDone(true));
  }, [db]);
  return done ? <Redirect href="/" /> : null;
}

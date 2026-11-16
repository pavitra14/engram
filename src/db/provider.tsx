import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import type { Db } from './db';
import { openDatabase } from './powersync';

const Ctx = createContext<Db | null>(null);

/** Opens the database once and hands it to every screen. Shows what went wrong if it cannot open. */
export function DbProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Db | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    openDatabase()
      .then((d) => alive && setDb(d))
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        console.log('engram: database failed to open', message);
        if (alive) setFailure(message);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (failure) {
    // No theme here: the theme itself is read from the database.
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 32, backgroundColor: '#F3F2EE' }}>
        <Text style={{ fontSize: 22, color: '#16181D', marginBottom: 12 }}>Engram could not open your thoughts</Text>
        <Text style={{ fontSize: 15, lineHeight: 22, color: '#4A4E57' }}>
          Nothing has been deleted. Close the app and open it again. If this keeps happening, send this message to the developer:
        </Text>
        <Text selectable style={{ fontSize: 13, lineHeight: 19, color: '#4A4E57', marginTop: 16 }}>
          {failure}
        </Text>
      </View>
    );
  }
  if (!db) return null;
  return <Ctx.Provider value={db}>{children}</Ctx.Provider>;
}

export function useDb(): Db {
  const db = useContext(Ctx);
  if (!db) throw new Error('useDb must be used inside DbProvider');
  return db;
}

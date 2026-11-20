/**
 * Engram Cloud on the phone: who is signed in, and when to sync.
 *
 * Off by default. Until someone signs in here, Engram records nothing for
 * sending and makes no cloud request of any kind.
 */
import { randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { Db } from '@/db/db';
import * as repo from '@/db/repo';
import { dataChanged, subscribeData } from '@/lib/bus';
import { rebuildAllLinks } from '@/lib/capture';
import { reconcileReminders } from '@/lib/reminders';

import * as api from './api';
import { flagOn, loadFlags, onFlagsChange } from './flags';
import { type Remote, type RemoteRow, resetCursor, syncOnce } from './sync';

export type CloudState = {
  /** False when this build has no cloud address; the Settings section then says so. */
  available: boolean;
  email: string | null;
  status: 'off' | 'idle' | 'syncing' | 'error';
  message: string | null;
  lastSynced: number | null;
  waiting: number;
};

let state: CloudState = { available: api.cloudConfigured, email: null, status: 'off', message: null, lastSynced: null, waiting: 0 };
const listeners = new Set<() => void>();
function set(patch: Partial<CloudState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
/** True while someone is signed in on this phone. */
export function signedIn(): boolean {
  return state.email !== null;
}

export function useCloud(): CloudState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

// The refresh token is the only secret kept. It lives in the phone's keystore, not the database.
const KEY = 'engram.cloud.session';
let session: api.Session | null = null;

async function saveSession(s: api.Session | null): Promise<void> {
  session = s;
  if (s) await SecureStore.setItemAsync(KEY, JSON.stringify({ refresh_token: s.refresh_token, user: s.user }));
  else await SecureStore.deleteItemAsync(KEY).catch(() => {});
}

async function token(): Promise<string> {
  if (!session) throw new api.CloudError('Not signed in.', 401);
  if (session.expires_at - Date.now() < 60_000) await saveSession(await api.refresh(session.refresh_token));
  return session!.access_token;
}

const remote: Remote = {
  apply: async (batchId, ops) => api.rpc('apply_sync_batch', { p_batch_id: batchId, p_ops: ops }, await token()),
  pull: async (after) => api.rpc('pull_changes', { p_after: after, p_limit: 500 }, await token()),
  thought: async (id) => {
    const rows = await api.select<RemoteRow[]>(`thoughts?id=eq.${encodeURIComponent(id)}&select=*`, await token());
    return rows[0] ? { ...rows[0], t: 'thoughts' } : null;
  },
};

let running: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let quiet = false;

/** Syncs now. If a sync is already running, waits for that one. */
export function syncNow(db: Db): Promise<void> {
  if (!session || !flagOn('cloud')) return Promise.resolve();
  running ??= (async () => {
    set({ status: 'syncing', message: null });
    try {
      const done = await syncOnce(db, remote, randomUUID);
      if (done.received > 0 || done.copies > 0) {
        // What arrived may link to what is here, and may carry reminders this phone should ring for.
        await rebuildAllLinks(db);
        await reconcileReminders(db, done.touched);
        quiet = true;
        dataChanged();
        quiet = false;
      }
      set({
        status: 'idle',
        lastSynced: Date.now(),
        waiting: await repo.outboxCount(db),
        message: done.copies > 0 ? `${done.copies} ${done.copies === 1 ? 'note was' : 'notes were'} changed in two places. Both versions were kept; look for "(from this phone)".` : null,
      });
    } catch (e) {
      const err = e instanceof api.CloudError ? e : new api.CloudError('Syncing stopped unexpectedly. It will try again.', 0);
      if (err.status === 401 || /refresh_token|invalid_grant|session_not_found|bad_jwt/.test(err.code ?? '')) {
        // The session is no longer valid. Stop sending, keep everything on the phone.
        await saveSession(null);
        repo.setTracking(false);
        set({ status: 'off', email: null, message: 'You were signed out of Engram Cloud. Sign in again to keep syncing.' });
      } else {
        set({ status: 'error', message: err.message, waiting: await repo.outboxCount(db).catch(() => 0) });
      }
    } finally {
      running = null;
    }
  })();
  return running;
}

function syncSoon(db: Db, ms = 4000) {
  if (!session) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncNow(db), ms);
}

let started = false;
/** Called once at launch. Restores a signed-in session if there is one, and syncs after changes and on return to the app. */
export async function startCloud(db: Db): Promise<void> {
  if (started || !api.cloudConfigured) return;
  started = true;
  // These are wired whatever the flag says; they do nothing until there is a session
  // (syncSoon returns at once without one), so a flag turned on later needs no restart to take effect.
  subscribeData(() => {
    if (!quiet) syncSoon(db);
  });
  AppState.addEventListener('change', (s) => {
    if (s === 'active') syncSoon(db, 1000);
  });
  // Engram Cloud is behind a switch on the server. While it is off, this phone neither
  // restores a session nor records changes for sending.
  await loadFlags(db);
  await restoreSession(db);
  onFlagsChange(() => void restoreSession(db));
}

/** Picks up the account this phone was signed in to, if any, and starts recording changes for it. */
let restoring = false;
async function restoreSession(db: Db): Promise<void> {
  if (session || restoring || !flagOn('cloud')) return;
  restoring = true;
  try {
    const saved = await SecureStore.getItemAsync(KEY);
    if (saved) {
      const { refresh_token, user } = JSON.parse(saved) as { refresh_token: string; user: api.Session['user'] };
      session = { access_token: '', refresh_token, expires_at: 0, user };
      repo.setTracking(true);
      set({ email: user.email, status: 'idle', waiting: await repo.outboxCount(db) });
      syncSoon(db, 1500);
    }
  } catch {
    // No usable session: stay local.
  } finally {
    restoring = false;
  }
}

/** After signing in: remember whose copy this is, queue everything on the phone, and sync. */
async function begin(db: Db, s: api.Session): Promise<void> {
  await saveSession(s);
  await repo.setMeta(db, 'sync_owner', s.user.id);
  await repo.resetSync(db);
  await resetCursor(db);
  repo.setTracking(true);
  await repo.markEverything(db);
  set({ email: s.user.email, status: 'idle', message: null, waiting: await repo.outboxCount(db) });
  await syncNow(db);
}

/** The account this phone's thoughts were last synced with, if any. */
export function lastOwner(db: Db): Promise<string | null> {
  return repo.getMeta(db, 'sync_owner');
}

/**
 * Signs in. If this phone was synced with a different account before, the
 * caller must have asked the person first and pass `mixOk`.
 */
export async function signIn(db: Db, email: string, password: string, mixOk = false): Promise<'ok' | 'other-account'> {
  const s = await api.signIn(email.trim(), password);
  const before = await lastOwner(db);
  if (before && before !== s.user.id && !mixOk && (await repo.countThoughts(db)) > 0) {
    await api.signOut(s.access_token);
    return 'other-account';
  }
  await begin(db, s);
  return 'ok';
}

/** Creates an account. Returns 'confirm' when the person must tap the link in their email before signing in. */
export async function signUp(db: Db, email: string, password: string): Promise<'ok' | 'confirm'> {
  const s = await api.signUp(email.trim(), password);
  if (!s) return 'confirm';
  await begin(db, s);
  return 'ok';
}

/** Stops syncing on this phone. Thoughts stay here and in the cloud. */
export async function signOut(db: Db): Promise<void> {
  if (timer) clearTimeout(timer);
  const t = session?.access_token;
  repo.setTracking(false);
  await saveSession(null);
  await repo.resetSync(db);
  await resetCursor(db);
  if (t) await api.signOut(t);
  set({ email: null, status: 'off', message: null, waiting: 0, lastSynced: null });
}

/** Deletes the account and its cloud copy. This phone keeps everything. */
export async function deleteAccount(db: Db): Promise<void> {
  await api.deleteAccount(await token());
  await repo.setMeta(db, 'sync_owner', '');
  await signOut(db);
}

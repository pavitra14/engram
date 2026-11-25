/**
 * "Tell me about new versions", only if the person said yes (in the tour, the
 * one-time question on Today, or Settings). "Check now" in Settings works either way.
 *
 * A Play install asks the Play Store app (modules/engram-updates), and an update
 * goes through Play's own screen. Any other install reads GitHub's public list of
 * releases: one request, carrying nothing of the person's and no id, at most once
 * a day, only when the app is opened. Nothing is downloaded or installed by
 * Engram; the release page opens in the browser. docs/PRIVACY.md, "New versions".
 */
import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo';
import { Linking } from 'react-native';
import { useEffect, useState } from 'react';

import type { Db } from '@/db/db';
import * as repo from '@/db/repo';

import { type Channel, channelFor, checkDue, type Found, newerRelease, type Release } from './updates.logic';

export const RELEASES_URL = 'https://api.github.com/repos/pavitra14/engram/releases?per_page=10';
export const RELEASES_PAGE = 'https://github.com/pavitra14/engram/releases';

type Native = {
  installer: () => string | null;
  playUpdate: () => Promise<{ available: boolean; versionCode: number }>;
  startPlayUpdate: () => Promise<boolean>;
};

/** Null when the native module is missing (an old build), so nothing here can stop the app. */
function native(): Native | null {
  try {
    return requireOptionalNativeModule<Native>('EngramUpdates');
  } catch {
    return null;
  }
}

/** Where this copy of Engram came from, which decides how it hears about updates. */
export function updateChannel(): Channel {
  try {
    return channelFor(native()?.installer() ?? null);
  } catch {
    return 'github';
  }
}

export const installedVersion = (): string => Constants.expoConfig?.version ?? '0.0.0';

export const ASK_UPDATES_TITLE = 'Hear about new versions?';

export function askUpdatesBody(channel: Channel = updateChannel()): string {
  return channel === 'play'
    ? 'Once a day, Engram can ask Google Play whether a newer version is out and offer to update. Play does the checking; your notes are not involved. You can change this in Settings.'
    : 'Once a day, Engram can look at its releases page on GitHub and tell you when a newer version is out. The check sends nothing of yours and no id; GitHub sees this phone’s internet address, as any website does. You can change this in Settings.';
}

/** A newer version this phone was told about. */
export type Available = { channel: 'play'; key: string } | ({ channel: 'github'; key: string } & Found);

type Stored = { for: string; found: Available };

export type UpdatesAnswer = 'yes' | 'no' | null;

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

export async function readUpdatesAnswer(db: Db): Promise<UpdatesAnswer> {
  const v = await repo.getMeta(db, 'updates');
  return v === 'yes' || v === 'no' ? v : null;
}

/** Records the choice. "No" forgets any version already found, so the notice goes. */
export async function setUpdates(db: Db, yes: boolean): Promise<void> {
  await repo.setMeta(db, 'updates', yes ? 'yes' : 'no');
  if (!yes) await repo.setMeta(db, 'update_found', '');
  changed();
  if (yes) void checkForUpdate(db).catch(() => {});
}

/** The newer version to tell the person about, unless they dismissed it or have since updated. */
export async function readAvailable(db: Db): Promise<Available | null> {
  const raw = await repo.getMeta(db, 'update_found').catch(() => null);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Stored;
    if (s.for !== installedVersion()) return null;
    if ((await repo.getMeta(db, 'update_dismissed')) === s.found.key) return null;
    return s.found;
  } catch {
    return null;
  }
}

export async function lastChecked(db: Db): Promise<number | null> {
  const v = Number(await repo.getMeta(db, 'update_checked').catch(() => null));
  return Number.isFinite(v) && v > 0 ? v : null;
}

export type CheckResult = { status: 'newer'; found: Available } | { status: 'current' } | { status: 'failed'; message: string } | { status: 'skipped' };

let running: Promise<CheckResult> | null = null;

/**
 * Looks for a newer version. Without `force` it does nothing unless the person said
 * yes and a day has passed since the last check; `force` is "Check now".
 */
export function checkForUpdate(db: Db, { force = false }: { force?: boolean } = {}): Promise<CheckResult> {
  // "Check now" during the launch check waits for it, then asks again itself.
  if (running && force) return running.then(() => checkForUpdate(db, { force }));
  if (running) return running;
  running = (async (): Promise<CheckResult> => {
    if (!force) {
      if ((await readUpdatesAnswer(db)) !== 'yes') return { status: 'skipped' };
      if (!checkDue(await lastChecked(db), Date.now())) return { status: 'skipped' };
    }
    await repo.setMeta(db, 'update_checked', String(Date.now()));
    try {
      const found = await look();
      await repo.setMeta(db, 'update_found', found ? JSON.stringify({ for: installedVersion(), found } satisfies Stored) : '');
      // "Check now" shows a version the person dismissed earlier again: they asked.
      if (found && force) await repo.setMeta(db, 'update_dismissed', '');
      changed();
      return found ? { status: 'newer', found } : { status: 'current' };
    } catch {
      return {
        status: 'failed',
        message: updateChannel() === 'play' ? 'Google Play could not be reached. Try again later.' : 'GitHub could not be reached. Check the internet connection and try again.',
      };
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

async function look(): Promise<Available | null> {
  const mod = native();
  if (updateChannel() === 'play' && mod) {
    const r = await mod.playUpdate();
    return r.available ? { channel: 'play', key: `play-${r.versionCode}` } : null;
  }
  const res = await fetch(RELEASES_URL, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const list = (await res.json()) as Release[];
  const found = newerRelease(Array.isArray(list) ? list : [], installedVersion());
  return found ? { channel: 'github', key: `github-${found.version}`, ...found } : null;
}

/** "Not now": hides this version until a newer one comes out. */
export async function dismissUpdate(db: Db, found: Available): Promise<void> {
  await repo.setMeta(db, 'update_dismissed', found.key);
  changed();
}

/** Play's update screen for a Play install; the release page in the browser otherwise. Resolves false if nothing opened. */
export async function startUpdate(found: Available): Promise<boolean> {
  if (found.channel === 'play') {
    const mod = native();
    return mod ? mod.startPlayUpdate() : false;
  }
  await Linking.openURL(found.url || RELEASES_PAGE);
  return true;
}

/** The version to tell the person about, kept current as checks and choices happen. */
export function useAvailableUpdate(db: Db): Available | null {
  const [found, setFound] = useState<Available | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      void readAvailable(db).then((f) => {
        if (live) setFound(f);
      });
    load();
    listeners.add(load);
    return () => {
      live = false;
      listeners.delete(load);
    };
  }, [db]);
  return found;
}

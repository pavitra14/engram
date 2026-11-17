/**
 * App lock: fingerprint, face or the phone's own PIN to open Engram after it has
 * been away for a chosen time. The check is Android's; Engram never sees the
 * fingerprint or the PIN. Widgets and the share sheet still save without it;
 * reading anything asks first.
 */
import * as LocalAuthentication from 'expo-local-authentication';

import type { Db } from '@/db/db';
import * as repo from '@/db/repo';

export type LockSetting = { on: boolean; afterMs: number };
export const LOCK_DELAYS: { label: string; ms: number }[] = [
  { label: 'Straight away', ms: 0 },
  { label: 'After 1 minute', ms: 60_000 },
  { label: 'After 5 minutes', ms: 300_000 },
];

export async function lockSetting(db: Db): Promise<LockSetting> {
  try {
    const v = JSON.parse((await repo.getMeta(db, 'lock')) ?? 'null');
    if (v && typeof v.on === 'boolean') return { on: v.on, afterMs: Number(v.afterMs) || 0 };
  } catch {
    // Fall through to off.
  }
  return { on: false, afterMs: 0 };
}

export function saveLockSetting(db: Db, s: LockSetting): Promise<void> {
  return repo.setMeta(db, 'lock', JSON.stringify(s));
}

/** Whether the phone has a screen lock at all. Without one there is nothing to check against. */
export async function canLock(): Promise<boolean> {
  try {
    return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

/** Asks Android to check it is you. True when it was. */
export async function confirmItIsYou(reason: string): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: reason, cancelLabel: 'Cancel', disableDeviceFallback: false });
    return r.success;
  } catch {
    return false;
  }
}

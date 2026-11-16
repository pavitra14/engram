import { useSyncExternalStore } from 'react';

/**
 * A tiny change signal. Anything that writes to the database calls
 * `dataChanged()`; screens that read call `useDataVersion()` and reload
 * when the number moves.
 */
let version = 0;
let lastCreatedId: string | null = null;
const listeners = new Set<() => void>();

export function dataChanged(createdId?: string): void {
  version += 1;
  if (createdId) lastCreatedId = createdId;
  listeners.forEach((l) => l());
}

/** Returns the id of the newest thought once, so the graph can animate it in. */
export function takeLastCreated(): string | null {
  const id = lastCreatedId;
  lastCreatedId = null;
  return id;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** For code outside React that needs to know when something was written. Returns a function that stops listening. */
export const subscribeData = subscribe;

export function useDataVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  );
}

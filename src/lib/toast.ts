import { useSyncExternalStore } from 'react';

/**
 * A short message at the bottom of the screen, with at most one action (Undo,
 * Open). Anything can show one, including code outside React.
 */
export type Toast = { id: number; text: string; action?: string; onAction?: () => void };

let current: Toast | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let next = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function hideToast(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  current = null;
  emit();
}

export function showToast(text: string, action?: string, onAction?: () => void): void {
  if (timer) clearTimeout(timer);
  current = { id: next++, text, action, onAction };
  // Long enough to read and reach the button; an action gets a little longer.
  timer = setTimeout(hideToast, action ? 6000 : 3500);
  emit();
}

export function useToast(): Toast | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => current,
    () => current,
  );
}

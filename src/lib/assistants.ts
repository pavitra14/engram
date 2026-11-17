/**
 * Handing a set of thoughts to an AI app the person already has, to turn them
 * into a plan. Engram itself sends nothing anywhere: the button opens the other
 * app with a draft message, and the person decides whether to send it.
 */
import * as Clipboard from 'expo-clipboard';
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';

import type { Thought } from '@/db/types';

import { titleOf } from './text';
import { count, M } from '@/lib/usage';

export type Assistant = { id: 'claude' | 'chatgpt'; name: string; pkg: string; url: (prompt: string) => string };

const ALL: Assistant[] = [
  { id: 'claude', name: 'Claude', pkg: 'com.anthropic.claude', url: (p) => `https://claude.ai/new?q=${encodeURIComponent(p)}` },
  { id: 'chatgpt', name: 'ChatGPT', pkg: 'com.openai.chatgpt', url: (p) => `https://chatgpt.com/?q=${encodeURIComponent(p)}` },
];

let found: Promise<Assistant[]> | null = null;

/** The AI apps installed on this phone. Checked once per launch. */
export function installedAssistants(): Promise<Assistant[]> {
  if (Platform.OS !== 'android') return Promise.resolve([]);
  found ??= Promise.all(
    ALL.map(async (a) => {
      try {
        return (await IntentLauncher.getApplicationIconAsync(a.pkg)) ? a : null;
      } catch {
        return null;
      }
    }),
  ).then((list) => list.filter((a): a is Assistant => a !== null));
  return found;
}

const MAX = 6000;

/** A message asking for next steps, built from the thoughts' own words. */
export function planPrompt(topic: string | null, thoughts: Thought[]): string {
  const lines: string[] = [];
  let used = 0;
  for (const t of thoughts) {
    const words = [t.title, t.body, t.url].filter(Boolean).join(' - ').replace(/\s+/g, ' ').trim() || titleOf(t);
    const line = `- ${words.slice(0, 500)}`;
    if (used + line.length > MAX) break;
    lines.push(line);
    used += line.length;
  }
  const about = topic ? ` about "${topic}"` : '';
  return [
    `These are my notes${about}, saved over time in my notes app:`,
    '',
    ...lines,
    '',
    'Help me turn them into an outcome. First tell me what I seem to be trying to do. Then give me the three most useful next actions, each small enough to start today, and point out anything I have missed or that contradicts itself.',
  ].join('\n');
}

/**
 * Opens the assistant with the message drafted. The message is also put on the
 * clipboard, in case the app opens without it.
 */
export async function chatWith(a: Assistant, prompt: string): Promise<void> {
  count(M.assistant);
  await Clipboard.setStringAsync(prompt).catch(() => {});
  await Linking.openURL(a.url(prompt));
}

/** The same thoughts as one outline, for a new note. */
export function outline(thoughts: Thought[]): string {
  return thoughts.map((t) => `<li>${esc(titleOf(t))}</li>`).join('');
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

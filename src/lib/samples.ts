import type { Db } from '@/db/db';

import * as repo from '@/db/repo';
import type { NewThought } from '@/db/types';

import { rebuildAllLinks } from './capture';

const H = 3600_000;

const SAMPLES: (Omit<NewThought, 'created_at'> & { ago: number })[] = [
  { kind: 'text', body: 'Graph view idea: new thoughts should drift toward the cluster they belong to', ago: 2 },
  { kind: 'text', body: 'Clusters in the graph could get a soft label once they pass ten thoughts', ago: 5 },
  { kind: 'voice', body: 'Reminder to self, the graph needs a way to find a lost thought quickly, maybe search dims everything else', duration_ms: 9000, ago: 9 },
  { kind: 'link', body: 'Force directed layout explained with small examples', url: 'https://graphs.example/force-directed-layout', ago: 30 },
  { kind: 'text', body: 'Layout should be stable: the same thought stays in the same place between sessions', ago: 31 },

  { kind: 'text', body: 'Sourdough: feed the starter at night, bake in the morning', ago: 20 },
  { kind: 'text', body: 'Sourdough crumb was too dense, try a longer proof and wetter dough', ago: 44 },
  { kind: 'link', body: 'Sourdough hydration chart for beginners', url: 'https://baking.example/sourdough-hydration', ago: 46 },
  { kind: 'voice', body: 'Buy bread flour and rye for the starter this weekend', duration_ms: 5000, ago: 50 },
  { kind: 'text', body: 'Dinner idea: dal with the sourdough flatbread experiment', ago: 70 },

  { kind: 'text', body: 'Trip to Hampi in January, check train from Bengaluru', ago: 26 },
  { kind: 'text', body: 'Hampi: rent a scooter, sunrise at Matanga hill', ago: 27 },
  { kind: 'link', body: 'Hampi three day itinerary', url: 'https://travel.example/hampi-three-days', ago: 52 },
  { kind: 'text', body: 'Pack list for the January trip: power bank, hat, offline maps', ago: 75 },
  { kind: 'voice', body: 'Ask Meera if she wants to join the Hampi trip and split the stay', duration_ms: 7000, ago: 80 },

  { kind: 'text', body: 'Book note, Thinking in Systems: stocks, flows and feedback loops everywhere', ago: 96 },
  { kind: 'text', body: 'Feedback loops explain why habits compound, small flows change big stocks', ago: 98 },
  { kind: 'text', body: 'Habit: ten minutes of reading before the phone in the morning', ago: 120 },
  { kind: 'link', body: 'Essay on compounding habits and systems', url: 'https://essays.example/compounding-habits', ago: 125 },
  { kind: 'text', body: 'Reading list: The Beginning of Infinity, Thinking in Systems, How to Take Smart Notes', ago: 140 },
  { kind: 'text', body: 'Smart notes: write one idea per note and link it to what you already know', ago: 141 },

  { kind: 'text', body: 'Running: easy pace three days a week, long run on Sunday morning', ago: 60 },
  { kind: 'voice', body: 'Knee felt fine after the long run, keep the easy pace and add strides', duration_ms: 8000, ago: 62 },
  { kind: 'text', body: 'Sleep before 11 on nights before the long run', ago: 150 },
  { kind: 'text', body: 'Morning routine: water, reading, short run, then phone', ago: 160 },

  { kind: 'text', body: 'Side project: a second brain that links notes on the phone without a server', ago: 12 },
  { kind: 'text', body: 'Voice notes should be transcribed on the phone, nothing leaves the device', ago: 14 },
  { kind: 'text', body: 'Share sheet is the fastest way to save a link from any app', ago: 15 },
  { kind: 'link', body: 'Local first software: you own your data', url: 'https://software.example/local-first', ago: 110 },
  { kind: 'text', body: 'Notes app idea: link suggestions should explain why two notes are related', ago: 112 },

  // These two share no words; only meaning-based linking joins them.
  { kind: 'text', body: 'The car is due for an oil change and new brake pads', ago: 130 },
  { kind: 'text', body: 'Book the vehicle in at the garage for maintenance', ago: 131 },
];

/** Loads a small demo brain. Does nothing if the brain already has thoughts. */
export async function loadSamples(db: Db): Promise<boolean> {
  if ((await repo.countThoughts(db)) > 0) return false;
  const now = Date.now();
  for (const { ago, ...t } of SAMPLES) {
    await repo.insertThought(db, { ...t, source: 'sample', created_at: now - ago * H });
  }
  await rebuildAllLinks(db);
  return true;
}

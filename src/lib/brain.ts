import type { Db } from '@/db/db';
import { useEffect, useState } from 'react';

import * as repo from '@/db/repo';
import type { Link, Thought } from '@/db/types';

import { useDataVersion } from './bus';
import { computeGroups, type Group, type Grouping } from './groups';

/** Everything the screens need, loaded once per data change and shared between them. */
export type Brain = Grouping & {
  thoughts: Thought[];
  links: Link[];
  byId: Map<string, Thought>;
  groupById: Map<string, Group>;
  degree: Map<string, number>;
};

let cache: { version: number; brain: Promise<Brain> } | null = null;

async function build(db: Db): Promise<Brain> {
  const [thoughts, links] = await Promise.all([repo.listThoughts(db, { limit: 5000 }), repo.listLinks(db)]);
  const grouping = computeGroups(
    thoughts.map((t) => ({ id: t.id, text: `${t.title ?? ''} ${t.body}`, created_at: t.created_at })),
    links.map((l) => ({ a: l.a_id, b: l.b_id, weight: l.kind === 'manual' ? 1 : l.weight })),
  );
  const degree = new Map<string, number>();
  for (const l of links) {
    degree.set(l.a_id, (degree.get(l.a_id) ?? 0) + 1);
    degree.set(l.b_id, (degree.get(l.b_id) ?? 0) + 1);
  }
  return {
    ...grouping,
    thoughts,
    links,
    byId: new Map(thoughts.map((t) => [t.id, t])),
    groupById: new Map(grouping.groups.map((g) => [g.id, g])),
    degree,
  };
}

export function loadBrain(db: Db, version: number): Promise<Brain> {
  if (!cache || cache.version !== version) cache = { version, brain: build(db) };
  return cache.brain;
}

/** Null while the first load is in flight. */
export function useBrain(db: Db): Brain | null {
  const version = useDataVersion();
  const [brain, setBrain] = useState<Brain | null>(null);
  useEffect(() => {
    let live = true;
    loadBrain(db, version).then((b) => {
      if (live) setBrain(b);
    });
    return () => {
      live = false;
    };
  }, [db, version]);
  return brain;
}

/** "In Sourdough, linked to 3 thoughts" */
export function placement(brain: Brain, thought: Thought): string {
  const group = brain.groupById.get(brain.groupOf.get(thought.id) ?? '');
  const n = brain.degree.get(thought.id) ?? 0;
  if (n === 0) return 'No links yet';
  const links = `linked to ${n} ${n === 1 ? 'thought' : 'thoughts'}`;
  return group ? `In ${group.name}, ${links}` : links.charAt(0).toUpperCase() + links.slice(1);
}

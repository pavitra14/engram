import type { Db } from '@/db/db';
import { useEffect, useState } from 'react';

import * as repo from '@/db/repo';
import type { Link, Project, Thought } from '@/db/types';

import { useDataVersion } from './bus';
import { computeGroups, type Group, type Grouping } from './groups';
import { matchProjects } from './projects';

/** Everything the screens need, loaded once per data change and shared between them. */
export type Brain = Grouping & {
  thoughts: Thought[];
  links: Link[];
  projects: Project[];
  byId: Map<string, Thought>;
  groupById: Map<string, Group>;
  degree: Map<string, number>;
};

let cache: { version: number; brain: Promise<Brain> } | null = null;

/** Groups, names and counts for a set of thoughts and the links among them. Links to anything else are ignored. */
export function assemble(thoughts: Thought[], allLinks: Link[], projects: Project[]): Brain {
  const byId = new Map(thoughts.map((t) => [t.id, t]));
  // A thought in the trash keeps its links for if it comes back; until then they count for nothing.
  const links = allLinks.filter((l) => byId.has(l.a_id) && byId.has(l.b_id));
  const grouping = computeGroups(
    thoughts.map((t) => ({ id: t.id, text: `${t.title ?? ''} ${t.body}`, created_at: t.created_at })),
    links.map((l) => ({ a: l.a_id, b: l.b_id, weight: l.kind === 'manual' ? 1 : l.weight })),
  );
  // A name the person chose wins over the one worked out from shared words.
  const carried = matchProjects(grouping.groups, projects);
  for (const g of grouping.groups) {
    const p = carried.get(g.id);
    if (!p) continue;
    g.project = p;
    g.autoName = g.name;
    if (p.name?.trim()) g.name = p.name.trim();
  }
  const degree = new Map<string, number>();
  for (const l of links) {
    degree.set(l.a_id, (degree.get(l.a_id) ?? 0) + 1);
    degree.set(l.b_id, (degree.get(l.b_id) ?? 0) + 1);
  }
  return { ...grouping, thoughts, links, projects, byId, groupById: new Map(grouping.groups.map((g) => [g.id, g])), degree };
}

async function build(db: Db): Promise<Brain> {
  const [thoughts, links, projects] = await Promise.all([repo.listThoughts(db, { limit: 5000 }), repo.listLinks(db), repo.listProjects(db)]);
  return assemble(thoughts, links, projects);
}

/** The brain as it was at a moment in the past: only what had been written by then. Used to play the map growing. */
export function brainAt(brain: Brain, when: number): Brain {
  return assemble(brain.thoughts.filter((t) => t.created_at <= when), brain.links, brain.projects);
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

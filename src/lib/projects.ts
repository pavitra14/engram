/**
 * Names, goals and dates the person gives a group.
 *
 * Groups are worked out from links and their ids change, so what the person said
 * is stored against the group's members at the time and follows them: it belongs
 * to whichever group now holds most of those thoughts. Plain logic, no React Native.
 */
import type { Project } from '@/db/types';

import type { Group } from './groups';

/** Which stored project, if any, each group carries. A group carries at most one; so does a project. */
export function matchProjects(groups: Group[], projects: Project[]): Map<string, Project> {
  const groupOf = new Map<string, string>();
  for (const g of groups) for (const m of g.members) groupOf.set(m, g.id);
  const claims: { group: string; project: Project; overlap: number }[] = [];
  for (const p of projects) {
    if (p.members.length === 0) continue;
    const counts = new Map<string, number>();
    for (const m of p.members) {
      const g = groupOf.get(m);
      if (g) counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    let best: { group: string; overlap: number } | null = null;
    for (const [group, overlap] of counts) if (!best || overlap > best.overlap) best = { group, overlap };
    // "Most of them are still together": more than half of the members it was given for.
    if (best && best.overlap * 2 > p.members.length) claims.push({ ...best, project: p });
  }
  const out = new Map<string, Project>();
  const used = new Set<string>();
  for (const c of claims.sort((a, b) => b.overlap - a.overlap)) {
    if (out.has(c.group) || used.has(c.project.id)) continue;
    out.set(c.group, c.project);
    used.add(c.project.id);
  }
  return out;
}

/** Stored projects whose thoughts have scattered or been deleted, so no group carries them. */
export function orphaned(groups: Group[], projects: Project[]): Project[] {
  const kept = new Set([...matchProjects(groups, projects).values()].map((p) => p.id));
  return projects.filter((p) => !kept.has(p.id));
}

/** "3 of 8 done" and how far through, for a project with check boxes. */
export function progressLabel(done: number, total: number): string {
  if (total === 0) return 'No check boxes in these notes yet';
  return done === total ? `All ${total} steps done` : `${done} of ${total} steps done`;
}

/** "Due in 5 days", "Due tomorrow", "Due today", "3 days past its date". */
export function dueIn(dueAt: number, now: number = Date.now()): string {
  const start = (ts: number) => {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.round((start(dueAt) - start(now)) / 86_400_000);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days > 1) return `Due in ${days} days`;
  return days === -1 ? 'A day past its date' : `${-days} days past its date`;
}

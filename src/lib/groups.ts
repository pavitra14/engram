/**
 * Groups: thoughts that link to each other are gathered into named groups.
 *
 * Pure TypeScript, no model. Communities come from label propagation over the
 * link graph (each thought repeatedly takes the label most common among its
 * neighbours, weighted by link strength). A group is named after the
 * distinctive word most of its members share.
 */
import { surfaceTokens } from './linker';

export type GroupThought = { id: string; text: string; created_at: number };
export type GroupLink = { a: string; b: string; weight: number };

export type Group = {
  /** Stable while the membership's smallest id stays the same. */
  id: string;
  name: string;
  /** Member ids, newest first. */
  members: string[];
  /** Index into the theme's group colours. */
  tone: number;
  /** Other groups this one has links into, strongest first. */
  near: string[];
  newest: number;
};

export type Grouping = {
  groups: Group[];
  /** Thought id to group id. Thoughts with no group are absent. */
  groupOf: Map<string, string>;
  /** Thoughts that link to nothing. */
  loose: string[];
};

const ROUNDS = 12;
/** Words too generic to name a group, even when its members share them. */
const BLAND = new Set(
  'thought link long short easy hard good bad big small old less more best better start end use app view page side part kind sort set put take look feel'.split(' '),
);
const TONES = 8;

function propagate(ids: string[], links: GroupLink[]): Map<string, string> {
  const neighbours = new Map<string, { id: string; w: number }[]>();
  for (const l of links) {
    if (!neighbours.has(l.a)) neighbours.set(l.a, []);
    if (!neighbours.has(l.b)) neighbours.set(l.b, []);
    neighbours.get(l.a)!.push({ id: l.b, w: l.weight });
    neighbours.get(l.b)!.push({ id: l.a, w: l.weight });
  }
  const label = new Map(ids.map((id) => [id, id]));
  const order = [...ids].sort();
  for (let round = 0; round < ROUNDS; round++) {
    let changed = false;
    for (const id of order) {
      const ns = neighbours.get(id);
      if (!ns || ns.length === 0) continue;
      const score = new Map<string, number>();
      for (const n of ns) {
        const l = label.get(n.id);
        if (l) score.set(l, (score.get(l) ?? 0) + n.w);
      }
      let best = label.get(id)!;
      let bestScore = -1;
      for (const [l, s] of score) {
        // Ties go to the smaller label so the result does not depend on iteration luck.
        if (s > bestScore + 1e-9 || (Math.abs(s - bestScore) <= 1e-9 && l < best)) {
          best = l;
          bestScore = s;
        }
      }
      if (best !== label.get(id)) {
        label.set(id, best);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return label;
}

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function nameGroups(buckets: string[][], textOf: Map<string, string>, total: number): string[] {
  const tokens = new Map<string, Map<string, string>>(); // thought id -> stem -> surface
  const df = new Map<string, number>();
  for (const [id, text] of textOf) {
    const map = new Map<string, string>();
    for (const t of surfaceTokens(text)) if (!map.has(t.stem)) map.set(t.stem, t.surface);
    tokens.set(id, map);
    for (const stem of map.keys()) df.set(stem, (df.get(stem) ?? 0) + 1);
  }
  const used = new Set<string>();
  return buckets.map((members) => {
    const inGroup = new Map<string, number>();
    const surface = new Map<string, Map<string, number>>();
    for (const id of members) {
      for (const [stem, word] of tokens.get(id) ?? []) {
        inGroup.set(stem, (inGroup.get(stem) ?? 0) + 1);
        if (!surface.has(stem)) surface.set(stem, new Map());
        const forms = surface.get(stem)!;
        forms.set(word, (forms.get(word) ?? 0) + 1);
      }
    }
    const ranked = [...inGroup]
      .filter(([stem, n]) => n >= 2 && stem.length >= 3 && !/^\d+$/.test(stem) && !BLAND.has(stem))
      .map(([stem, n]) => {
        const coverage = n / members.length;
        const rarity = Math.log((total + 1) / (df.get(stem) ?? 1)) + 0.3;
        // Words used mostly inside this group describe it best.
        const focus = n / (df.get(stem) ?? n);
        return { stem, score: coverage * rarity * (0.5 + focus) };
      })
      .sort((x, y) => y.score - x.score || (x.stem < y.stem ? -1 : 1));
    const pick = ranked.find((r) => !used.has(r.stem));
    if (!pick) return `${members.length} linked thoughts`;
    used.add(pick.stem);
    const forms = [...(surface.get(pick.stem) ?? [])].sort((x, y) => y[1] - x[1] || x[0].length - y[0].length);
    return titleCase(forms[0]?.[0] ?? pick.stem);
  });
}

export function computeGroups(thoughts: GroupThought[], links: GroupLink[]): Grouping {
  const known = new Set(thoughts.map((t) => t.id));
  const usable = links.filter((l) => known.has(l.a) && known.has(l.b) && l.a !== l.b);
  const label = propagate([...known], usable);

  const byLabel = new Map<string, string[]>();
  for (const t of thoughts) {
    const l = label.get(t.id)!;
    if (!byLabel.has(l)) byLabel.set(l, []);
    byLabel.get(l)!.push(t.id);
  }

  const created = new Map(thoughts.map((t) => [t.id, t.created_at]));
  const buckets = [...byLabel.values()]
    .filter((m) => m.length >= 2)
    .map((m) => m.sort((x, y) => (created.get(y) ?? 0) - (created.get(x) ?? 0)))
    // Biggest first; ties by smallest id so colours stay put between runs.
    .sort((x, y) => y.length - x.length || ([...x].sort()[0] < [...y].sort()[0] ? -1 : 1));

  const textOf = new Map(thoughts.map((t) => [t.id, t.text]));
  const names = nameGroups(buckets, textOf, thoughts.length);

  const groupOf = new Map<string, string>();
  const groups: Group[] = buckets.map((members, i) => {
    const id = [...members].sort()[0];
    for (const m of members) groupOf.set(m, id);
    return { id, name: names[i], members, tone: i % TONES, near: [], newest: created.get(members[0]) ?? 0 };
  });

  const cross = new Map<string, Map<string, number>>();
  for (const l of usable) {
    const ga = groupOf.get(l.a);
    const gb = groupOf.get(l.b);
    if (!ga || !gb || ga === gb) continue;
    for (const [x, y] of [
      [ga, gb],
      [gb, ga],
    ]) {
      if (!cross.has(x)) cross.set(x, new Map());
      cross.get(x)!.set(y, (cross.get(x)!.get(y) ?? 0) + l.weight);
    }
  }
  for (const g of groups) {
    g.near = [...(cross.get(g.id) ?? [])].sort((x, y) => y[1] - x[1]).map(([id]) => id);
  }

  const loose = thoughts.filter((t) => !groupOf.has(t.id)).map((t) => t.id);
  return { groups, groupOf, loose };
}

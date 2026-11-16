import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Brain } from '@/lib/brain';
import { titleOf } from '@/lib/text';
import { font, type, useTheme } from '@/theme';

import { Pill } from './ui';

type Bubble = SimulationNodeDatum & { id: string; r: number; single?: boolean };

/** How many ungrouped thoughts are drawn as their own circles before the rest are summarised. */
export const MAX_SINGLES = 18;
const SINGLE_R = 34;

const radiusFor = (count: number) => Math.max(46, Math.min(86, 30 + Math.sqrt(count) * 18));

/** Places one circle per group so related groups sit near each other. Deterministic. */
function layout(brain: Brain, width: number) {
  if (width <= 0) return { nodes: [] as Bubble[], lines: [], height: 0 };
  const nodes: Bubble[] = brain.groups.map((g, i) => ({
    id: g.id,
    r: radiusFor(g.members.length),
    x: width / 2 + Math.cos(i * 2.4) * 70,
    y: i * 96,
  }));
  // Thoughts with no group stand alone: a small circle each, joined to nothing.
  const base = nodes.length * 96;
  brain.loose.slice(0, MAX_SINGLES).forEach((id, i) => {
    nodes.push({ id, r: SINGLE_R, single: true, x: width / 2 + Math.cos(i * 2.4 + 1) * (width / 3), y: base + i * 40 });
  });
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const pairs: { source: number; target: number }[] = [];
  const seen = new Set<string>();
  for (const g of brain.groups) {
    for (const other of g.near.slice(0, 2)) {
      const key = g.id < other ? `${g.id}|${other}` : `${other}|${g.id}`;
      if (seen.has(key) || !index.has(other)) continue;
      seen.add(key);
      pairs.push({ source: index.get(g.id)!, target: index.get(other)! });
    }
  }
  const sim = forceSimulation(nodes)
    .force(
      'link',
      forceLink<Bubble, { source: number | Bubble; target: number | Bubble }>(pairs.map((p) => ({ ...p })))
        .distance((l) => (l.source as Bubble).r + (l.target as Bubble).r + 22)
        .strength(0.12),
    )
    .force('charge', forceManyBody<Bubble>().strength(-90))
    .force('x', forceX<Bubble>(width / 2).strength(0.06))
    .force('y', forceY<Bubble>(0).strength(0.05))
    .force('collide', forceCollide<Bubble>((n) => n.r + 7).strength(1).iterations(6))
    .stop();
  const clamp = () => {
    for (const n of nodes) n.x = Math.max(n.r + 16, Math.min(width - n.r - 16, n.x ?? 0));
  };
  for (let i = 0; i < 400; i++) {
    sim.tick();
    clamp();
  }
  // Finish with collisions only, so nothing is left overlapping after the last clamp.
  sim.force('link', null).force('charge', null).force('x', null).force('y', null).alpha(0.3);
  for (let i = 0; i < 80; i++) {
    sim.tick();
    clamp();
  }

  const top = Math.min(...nodes.map((n) => (n.y ?? 0) - n.r), 0);
  for (const n of nodes) n.y = (n.y ?? 0) - top;
  const height = nodes.length ? Math.max(...nodes.map((n) => (n.y ?? 0) + n.r)) : 0;
  const lines = pairs.map((p) => {
    const a = nodes[p.source];
    const b = nodes[p.target];
    const dx = (b.x ?? 0) - (a.x ?? 0);
    const dy = (b.y ?? 0) - (a.y ?? 0);
    const length = Math.sqrt(dx * dx + dy * dy);
    return {
      key: `${a.id}|${b.id}`,
      left: ((a.x ?? 0) + (b.x ?? 0)) / 2 - length / 2,
      top: ((a.y ?? 0) + (b.y ?? 0)) / 2,
      length,
      angle: Math.atan2(dy, dx),
    };
  });
  return { nodes, lines, height };
}


/**
 * The map itself: every group as a named circle sized by how many thoughts it holds,
 * and every ungrouped thought as a small circle on its own.
 */
export function GroupMap({ brain, width }: { brain: Brain; width: number }) {
  const { c } = useTheme();
  const placed = useMemo(() => layout(brain, width), [brain, width]);
  const more = brain.loose.length - MAX_SINGLES;
  if (placed.nodes.length === 0) return null;
  return (
    <View>
      <View style={{ height: placed.height, width }}>
        {placed.lines.map((l) => (
          <View
            key={l.key}
            style={{
              position: 'absolute',
              left: l.left,
              top: l.top,
              width: l.length,
              height: 1.5,
              backgroundColor: c.connector,
              transform: [{ rotate: `${l.angle}rad` }],
            }}
          />
        ))}
        {placed.nodes.map((n) => {
          const d = n.r * 2;
          const at = { left: (n.x ?? 0) - n.r, top: (n.y ?? 0) - n.r, width: d, height: d, borderRadius: n.r };
          if (n.single) {
            const t = brain.byId.get(n.id);
            if (!t) return null;
            const label = titleOf(t);
            return (
              <Pressable
                key={n.id}
                accessibilityRole="button"
                accessibilityLabel={`${label}, not in a group`}
                onPress={() => router.push({ pathname: '/thought/[id]', params: { id: n.id } })}
                style={({ pressed }) => [
                  styles.bubble,
                  at,
                  { padding: 6, backgroundColor: c.surface, borderColor: c.line, transform: [{ scale: pressed ? 0.94 : 1 }] },
                ]}>
                <Text style={{ fontFamily: font.medium, fontSize: 10.5, lineHeight: 13, color: c.soft, textAlign: 'center' }} numberOfLines={3}>
                  {label}
                </Text>
              </Pressable>
            );
          }
          const g = brain.groupById.get(n.id);
          if (!g) return null;
          const count = g.members.length;
          return (
            <Pressable
              key={n.id}
              accessibilityRole="button"
              accessibilityLabel={`${g.name}, ${count} thoughts`}
              onPress={() => router.push({ pathname: '/group/[id]', params: { id: g.id } })}
              style={({ pressed }) => [
                styles.bubble,
                at,
                { backgroundColor: c.groupFill[g.tone], borderColor: c.groupLine[g.tone], transform: [{ scale: pressed ? 0.96 : 1 }] },
              ]}>
              <Text
                style={{ fontFamily: font.serifMedium, fontSize: n.r > 70 ? 21 : n.r > 56 ? 18 : 16, color: c.ink, textAlign: 'center' }}
                numberOfLines={2}
                adjustsFontSizeToFit>
                {g.name}
              </Text>
              <Text style={[type.meta, { color: c.groupText }]}>{n.r > 56 ? `${count} thoughts` : count}</Text>
            </Pressable>
          );
        })}
      </View>
      {more > 0 ? (
        <View style={styles.more}>
          <Pill icon="circle" label={`${more} more on their own`} onPress={() => router.push({ pathname: '/group/[id]', params: { id: 'loose' } })} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { position: 'absolute', borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2, padding: 10 },
  more: { alignItems: 'center', marginTop: 20 },
});

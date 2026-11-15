import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CAPTURE_BAR_SPACE, CaptureBar } from '@/components/CaptureBar';
import { Header, Pill, RoundButton } from '@/components/ui';
import { type Brain, placement, useBrain } from '@/lib/brain';
import { titleOf } from '@/lib/text';
import { font, type, useTheme } from '@/theme';

type Bubble = SimulationNodeDatum & { id: string; r: number };

const radiusFor = (count: number) => Math.max(46, Math.min(86, 30 + Math.sqrt(count) * 18));

/** Places one circle per group so related groups sit near each other. Deterministic. */
function layout(brain: Brain, width: number) {
  const nodes: Bubble[] = brain.groups.map((g, i) => ({
    id: g.id,
    r: radiusFor(g.members.length),
    x: width / 2 + Math.cos(i * 2.4) * 70,
    y: i * 96,
  }));
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

/** The map: every group as a named circle, sized by how many thoughts it holds. */
export default function MapScreen() {
  const db = useSQLiteContext();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const brain = useBrain(db);

  const placed = useMemo(() => (brain ? layout(brain, width) : null), [brain, width]);
  const latest = brain?.thoughts[0];
  const total = brain?.thoughts.length ?? 0;
  const groupCount = brain?.groups.length ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + CAPTURE_BAR_SPACE + 40 }}>
        <Header
          title="Map"
          back="Today"
          sub={`${total} ${total === 1 ? 'thought' : 'thoughts'} in ${groupCount} ${groupCount === 1 ? 'group' : 'groups'}`}>
          <RoundButton icon="search" label="Search your thoughts" onPress={() => router.push('/search')} />
        </Header>

        {brain && placed && groupCount > 0 ? (
          <View style={{ height: placed.height, marginTop: 28 }}>
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
              const g = brain.groupById.get(n.id)!;
              const d = n.r * 2;
              const count = g.members.length;
              return (
                <Pressable
                  key={n.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${g.name}, ${count} thoughts`}
                  onPress={() => router.push({ pathname: '/group/[id]', params: { id: g.id } })}
                  style={({ pressed }) => [
                    styles.bubble,
                    {
                      left: (n.x ?? 0) - n.r,
                      top: (n.y ?? 0) - n.r,
                      width: d,
                      height: d,
                      borderRadius: n.r,
                      backgroundColor: c.groupFill[g.tone],
                      borderColor: c.groupLine[g.tone],
                      transform: [{ scale: pressed ? 0.96 : 1 }],
                    },
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
        ) : null}

        {brain && groupCount === 0 ? (
          <Text style={[type.body, styles.note, { color: c.soft }]}>
            No groups yet. A group forms when two or more of your thoughts link to each other.
          </Text>
        ) : null}

        {brain && brain.loose.length > 0 ? (
          <View style={styles.loose}>
            <Pill
              icon="circle"
              label={`${brain.loose.length} not in a group yet`}
              onPress={() => router.push({ pathname: '/group/[id]', params: { id: 'loose' } })}
            />
          </View>
        ) : null}

        {brain && latest ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/thought/[id]', params: { id: latest.id } })}
            style={({ pressed }) => [styles.latest, { backgroundColor: c.surface, borderColor: c.line, opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[type.label, { color: c.ink }]} numberOfLines={2}>
              {titleOf(latest)}
            </Text>
            <Text style={[type.meta, { color: c.soft }]}>Your latest thought. {placement(brain, latest)}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <CaptureBar />
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { position: 'absolute', borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2, padding: 10 },
  note: { paddingHorizontal: 24, paddingTop: 24 },
  loose: { alignItems: 'center', marginTop: 24 },
  latest: { marginHorizontal: 16, marginTop: 24, padding: 16, borderRadius: 20, borderWidth: 1, gap: 4 },
});

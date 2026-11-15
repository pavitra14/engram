import { BlurMask, Canvas, Circle, Group, Path, RadialGradient, Rect, Skia, useClock, vec } from '@shopify/react-native-skia';
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import {
  GestureDetector,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import { Easing, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { ThoughtKind } from '@/db/types';
import { colors, kindColor, KINDS } from '@/theme';

export type GraphNode = { id: string; kind: ThoughtKind; degree: number };
export type GraphLink = { a: string; b: string; weight: number };
export type Point = { id: string; x: number; y: number };

export type BrainCanvasHandle = { fit: () => void; focus: (id: string) => void };

type Props = {
  nodes: GraphNode[];
  links: GraphLink[];
  /** Saved positions from the last session. */
  layout: Map<string, { x: number; y: number }>;
  selectedId: string | null;
  /** Ids to keep lit while everything else dims (search results). Null means no filter. */
  litIds: Set<string> | null;
  /** Id of a thought that was just captured, to animate in. */
  bornId: string | null;
  /** Space at the bottom covered by the capture dock. */
  bottomInset: number;
  onSelect: (id: string | null) => void;
  onSettled: (points: Point[]) => void;
};

type SimNode = SimulationNodeDatum & { id: string; r: number; kind: number };
type SimLink = SimulationLinkDatum<SimNode> & { weight: number };

type Meta = { n: number; src: number[]; dst: number[]; r: number[]; kind: number[] };

const EMPTY_META: Meta = { n: 0, src: [], dst: [], r: [], kind: [] };
const MIN_SCALE = 0.3;
const MAX_SCALE = 3;

const radiusFor = (degree: number) => 5 + Math.min(7, Math.sqrt(degree) * 2.2);

/** Deterministic pseudo-random in [0, 1) from a string, so first layouts are repeatable. */
function hash01(s: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

function nearest(px: number, py: number, pos: number[], meta: Meta, slop: number): number {
  'worklet';
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < meta.n; i++) {
    const dx = pos[i * 2] - px;
    const dy = pos[i * 2 + 1] - py;
    const d = Math.sqrt(dx * dx + dy * dy) - meta.r[i];
    if (d < slop && d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

function useNodePath(pos: SharedValue<number[]>, meta: SharedValue<Meta>, lit: SharedValue<number[]>, kind: number, wantLit: number) {
  return useDerivedValue(() => {
    const b = Skia.PathBuilder.Make();
    const p = pos.value;
    const m = meta.value;
    const l = lit.value;
    const n = Math.min(m.n, p.length / 2);
    for (let i = 0; i < n; i++) {
      if (m.kind[i] === kind && (l[i] ?? 1) === wantLit) b.addCircle(p[i * 2], p[i * 2 + 1], m.r[i]);
    }
    return b.detach();
  });
}

function useEdgePath(
  pos: SharedValue<number[]>,
  meta: SharedValue<Meta>,
  lit: SharedValue<number[]>,
  sel: SharedValue<number>,
  filtered: SharedValue<number>,
  wantLit: boolean,
) {
  return useDerivedValue(() => {
    const b = Skia.PathBuilder.Make();
    const p = pos.value;
    const m = meta.value;
    const l = lit.value;
    const s = sel.value;
    const active = filtered.value === 1;
    for (let i = 0; i < m.src.length; i++) {
      const a = m.src[i];
      const c = m.dst[i];
      if (a * 2 + 1 >= p.length || c * 2 + 1 >= p.length) continue;
      const isLit = !active ? true : s >= 0 ? a === s || c === s : (l[a] ?? 1) === 1 && (l[c] ?? 1) === 1;
      if (isLit === wantLit) b.moveTo(p[a * 2], p[a * 2 + 1]).lineTo(p[c * 2], p[c * 2 + 1]);
    }
    return b.detach();
  });
}

export const BrainCanvas = forwardRef<BrainCanvasHandle, Props>(function BrainCanvas(
  { nodes, links, layout, selectedId, litIds, bornId, bottomInset, onSelect, onSettled },
  ref,
) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  const pos = useSharedValue<number[]>([]);
  const meta = useSharedValue<Meta>(EMPTY_META);
  const lit = useSharedValue<number[]>([]);
  const filtered = useSharedValue(0);
  const dim = useSharedValue(1);
  const sel = useSharedValue(-1);
  const born = useSharedValue(-1);
  const birth = useSharedValue(1);

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  const dragIdx = useSharedValue(-1);

  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const simNodes = useRef<SimNode[]>([]);
  const raf = useRef<number | null>(null);
  const dragging = useRef(false);
  const placedCamera = useRef(false);
  const settledCb = useRef(onSettled);
  const selectCb = useRef(onSelect);
  useEffect(() => {
    settledCb.current = onSettled;
    selectCb.current = onSelect;
  });

  const publish = useCallback(() => {
    const ns = simNodes.current;
    const out = new Array<number>(ns.length * 2);
    for (let i = 0; i < ns.length; i++) {
      out[i * 2] = ns[i].x ?? 0;
      out[i * 2 + 1] = ns[i].y ?? 0;
    }
    pos.set(out);
  }, [pos]);

  const run = useCallback(() => {
    if (raf.current != null) return;
    const step = () => {
      const sim = simRef.current;
      if (!sim) {
        raf.current = null;
        return;
      }
      sim.tick();
      publish();
      if (sim.alpha() < 0.02 && !dragging.current) {
        raf.current = null;
        settledCb.current(simNodes.current.map((n) => ({ id: n.id, x: n.x ?? 0, y: n.y ?? 0 })));
        return;
      }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [publish]);

  // Rebuild the simulation whenever the graph changes, keeping positions we already know.
  useEffect(() => {
    const prev = new Map(simNodes.current.map((n) => [n.id, n]));
    const index = new Map(nodes.map((n, i) => [n.id, i]));
    const adjacency = new Map<string, string[]>();
    for (const l of links) {
      adjacency.set(l.a, [...(adjacency.get(l.a) ?? []), l.b]);
      adjacency.set(l.b, [...(adjacency.get(l.b) ?? []), l.a]);
    }

    let unknown = 0;
    const next: SimNode[] = nodes.map((n) => {
      const known = prev.get(n.id) ?? layout.get(n.id);
      const base: SimNode = { id: n.id, r: radiusFor(n.degree), kind: KINDS.indexOf(n.kind) };
      if (known && known.x != null && known.y != null) return { ...base, x: known.x, y: known.y };
      unknown += 1;
      // Start a new thought beside the thoughts it is linked to.
      const anchors = (adjacency.get(n.id) ?? [])
        .map((id) => prev.get(id) ?? layout.get(id))
        .filter((p): p is { x: number; y: number } => !!p && p.x != null && p.y != null);
      const jx = (hash01(n.id, 1) - 0.5) * 60;
      const jy = (hash01(n.id, 2) - 0.5) * 60;
      if (anchors.length > 0) {
        const cx = anchors.reduce((s, p) => s + p.x, 0) / anchors.length;
        const cy = anchors.reduce((s, p) => s + p.y, 0) / anchors.length;
        return { ...base, x: cx + jx, y: cy + jy };
      }
      const angle = hash01(n.id, 3) * Math.PI * 2;
      const dist = 40 + hash01(n.id, 4) * 220;
      return { ...base, x: Math.cos(angle) * dist, y: Math.sin(angle) * dist };
    });

    const simLinks: SimLink[] = [];
    const src: number[] = [];
    const dst: number[] = [];
    for (const l of links) {
      const a = index.get(l.a);
      const b = index.get(l.b);
      if (a == null || b == null) continue;
      simLinks.push({ source: a, target: b, weight: l.weight });
      src.push(a);
      dst.push(b);
    }

    simRef.current?.stop();
    const sim = forceSimulation<SimNode, SimLink>(next)
      .force(
        'link',
        forceLink<SimNode, SimLink>(simLinks)
          .distance((l) => 78 - 30 * Math.min(1, l.weight))
          .strength((l) => 0.25 + 0.5 * Math.min(1, l.weight)),
      )
      .force('charge', forceManyBody<SimNode>().strength(-150).distanceMax(420))
      .force('x', forceX<SimNode>(0).strength(0.035))
      .force('y', forceY<SimNode>(0).strength(0.035))
      .force('collide', forceCollide<SimNode>((n) => n.r + 6))
      .alphaDecay(0.035)
      .stop();

    const firstLayout = unknown === next.length && next.length > 0;
    if (firstLayout) {
      sim.alpha(1);
      for (let i = 0; i < 220; i++) sim.tick();
      sim.alpha(0.05);
    } else {
      sim.alpha(unknown > 0 ? 0.45 : 0.08);
    }

    simRef.current = sim;
    simNodes.current = next;
    meta.set({ n: next.length, src, dst, r: next.map((n) => n.r), kind: next.map((n) => n.kind) });
    publish();
    run();
    // `layout` is only read for nodes we have never placed, so it is not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, links]);

  useEffect(
    () => () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
      simRef.current?.stop();
    },
    [],
  );

  // Selection and search both work by choosing which nodes stay lit.
  useEffect(() => {
    const selIndex = selectedId ? nodes.findIndex((n) => n.id === selectedId) : -1;
    let mask: number[] | null = null;
    if (selIndex >= 0) {
      const keep = new Set<string>([selectedId as string]);
      for (const l of links) {
        if (l.a === selectedId) keep.add(l.b);
        if (l.b === selectedId) keep.add(l.a);
      }
      mask = nodes.map((n) => (keep.has(n.id) ? 1 : 0));
    } else if (litIds) {
      mask = nodes.map((n) => (litIds.has(n.id) ? 1 : 0));
    }
    sel.set(selIndex);
    lit.set(mask ?? []);
    filtered.set(mask ? 1 : 0);
    dim.set(withTiming(mask ? 0.22 : 1, { duration: 260 }));
  }, [selectedId, litIds, nodes, links, sel, lit, filtered, dim]);

  // The "firing" ring when a new thought lands.
  useEffect(() => {
    if (!bornId) return;
    const i = nodes.findIndex((n) => n.id === bornId);
    if (i < 0) return;
    born.set(i);
    birth.set(0);
    birth.set(withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) }));
  }, [bornId, nodes, born, birth]);

  const viewH = Math.max(1, size.h - bottomInset);

  const fit = useCallback(() => {
    const ns = simNodes.current;
    if (size.w === 0) return;
    if (ns.length === 0) {
      tx.set(withTiming(size.w / 2));
      ty.set(withTiming(viewH / 2));
      scale.set(withTiming(1));
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of ns) {
      minX = Math.min(minX, n.x ?? 0);
      maxX = Math.max(maxX, n.x ?? 0);
      minY = Math.min(minY, n.y ?? 0);
      maxY = Math.max(maxY, n.y ?? 0);
    }
    const s = Math.max(MIN_SCALE, Math.min(1.5, size.w / (maxX - minX + 90), (viewH - 110) / (maxY - minY + 90)));
    const cfg = { duration: 420, easing: Easing.out(Easing.cubic) };
    scale.set(withTiming(s, cfg));
    tx.set(withTiming(size.w / 2 - ((minX + maxX) / 2) * s, cfg));
    ty.set(withTiming(60 + (viewH - 60) / 2 - ((minY + maxY) / 2) * s, cfg));
  }, [size.w, viewH, tx, ty, scale]);

  const focus = useCallback(
    (id: string) => {
      const n = simNodes.current.find((x) => x.id === id);
      if (!n || size.w === 0) return;
      const s = Math.max(scale.value, 1.1);
      const cfg = { duration: 420, easing: Easing.out(Easing.cubic) };
      scale.set(withTiming(s, cfg));
      tx.set(withTiming(size.w / 2 - (n.x ?? 0) * s, cfg));
      ty.set(withTiming(viewH * 0.42 - (n.y ?? 0) * s, cfg));
    },
    [size.w, viewH, tx, ty, scale],
  );

  useImperativeHandle(ref, () => ({ fit, focus }), [fit, focus]);

  // Frame the graph the first time we know both the size and the nodes.
  useEffect(() => {
    if (placedCamera.current || size.w === 0) return;
    placedCamera.current = true;
    tx.set(size.w / 2);
    ty.set(viewH / 2);
    if (nodes.length > 0) fit();
  }, [size.w, viewH, nodes.length, fit, tx, ty]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  };

  // ---- gestures (callbacks run on the UI thread) ----

  const selectIndex = useCallback((i: number) => {
    selectCb.current(i >= 0 ? (simNodes.current[i]?.id ?? null) : null);
  }, []);

  const dragStart = useCallback(() => {
    dragging.current = true;
    simRef.current?.alphaTarget(0.25);
    run();
  }, [run]);

  const dragMove = useCallback((i: number, x: number, y: number) => {
    const n = simNodes.current[i];
    if (!n) return;
    n.fx = x;
    n.fy = y;
  }, []);

  const dragEnd = useCallback((i: number) => {
    const n = simNodes.current[i];
    if (n) {
      n.fx = null;
      n.fy = null;
    }
    dragging.current = false;
    simRef.current?.alphaTarget(0);
  }, []);

  const pan = usePanGesture({
    maxPointers: 1,
    minDistance: 6,
    onBegin: (e) => {
      'worklet';
      const wx = (e.x - tx.value) / scale.value;
      const wy = (e.y - ty.value) / scale.value;
      dragIdx.set(nearest(wx, wy, pos.value, meta.value, 14 / scale.value));
    },
    onActivate: () => {
      'worklet';
      if (dragIdx.value >= 0) scheduleOnRN(dragStart);
    },
    onUpdate: (e) => {
      'worklet';
      if (dragIdx.value >= 0) {
        scheduleOnRN(dragMove, dragIdx.value, (e.x - tx.value) / scale.value, (e.y - ty.value) / scale.value);
      } else {
        tx.set(tx.value + e.changeX);
        ty.set(ty.value + e.changeY);
      }
    },
    onFinalize: () => {
      'worklet';
      if (dragIdx.value >= 0) scheduleOnRN(dragEnd, dragIdx.value);
      dragIdx.set(-1);
    },
  });

  const pinch = usePinchGesture({
    onBegin: () => {
      'worklet';
      startScale.set(scale.value);
      startTx.set(tx.value);
      startTy.set(ty.value);
    },
    onUpdate: (e) => {
      'worklet';
      const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, startScale.value * e.scale));
      const wx = (e.focalX - startTx.value) / startScale.value;
      const wy = (e.focalY - startTy.value) / startScale.value;
      scale.set(s);
      tx.set(e.focalX - wx * s);
      ty.set(e.focalY - wy * s);
    },
  });

  const tap = useTapGesture({
    maxDistance: 10,
    onActivate: (e) => {
      'worklet';
      const wx = (e.x - tx.value) / scale.value;
      const wy = (e.y - ty.value) / scale.value;
      scheduleOnRN(selectIndex, nearest(wx, wy, pos.value, meta.value, 16 / scale.value));
    },
  });

  const gesture = useSimultaneousGestures(pan, pinch, tap);

  // ---- drawing ----

  const transform = useDerivedValue(() => [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }]);

  const edgesLit = useEdgePath(pos, meta, lit, sel, filtered, true);
  const edgesDim = useEdgePath(pos, meta, lit, sel, filtered, false);
  const lit0 = useNodePath(pos, meta, lit, 0, 1);
  const lit1 = useNodePath(pos, meta, lit, 1, 1);
  const lit2 = useNodePath(pos, meta, lit, 2, 1);
  const lit3 = useNodePath(pos, meta, lit, 3, 1);
  const dim0 = useNodePath(pos, meta, lit, 0, 0);
  const dim1 = useNodePath(pos, meta, lit, 1, 0);
  const dim2 = useNodePath(pos, meta, lit, 2, 0);
  const dim3 = useNodePath(pos, meta, lit, 3, 0);
  const litPaths = [lit0, lit1, lit2, lit3];
  const dimPaths = [dim0, dim1, dim2, dim3];

  const clock = useClock();
  const pulses = useDerivedValue(() => {
    const b = Skia.PathBuilder.Make();
    const p = pos.value;
    const m = meta.value;
    if (m.src.length > 700) return b.detach();
    const t = clock.value / 3200;
    for (let i = 0; i < m.src.length; i += 2) {
      const a = m.src[i] * 2;
      const c = m.dst[i] * 2;
      if (a + 1 >= p.length || c + 1 >= p.length) continue;
      const raw = t + i * 0.381;
      const f = raw - Math.floor(raw);
      b.addCircle(p[a] + (p[c] - p[a]) * f, p[a + 1] + (p[c + 1] - p[a + 1]) * f, 1.3);
    }
    return b.detach();
  });

  const selX = useDerivedValue(() => (sel.value >= 0 ? (pos.value[sel.value * 2] ?? 0) : 0));
  const selY = useDerivedValue(() => (sel.value >= 0 ? (pos.value[sel.value * 2 + 1] ?? 0) : 0));
  const selR = useDerivedValue(() => (sel.value >= 0 ? (meta.value.r[sel.value] ?? 0) + 6 : 0));
  const selOpacity = useDerivedValue(() => (sel.value >= 0 ? 1 : 0));

  const bornX = useDerivedValue(() => (born.value >= 0 ? (pos.value[born.value * 2] ?? 0) : 0));
  const bornY = useDerivedValue(() => (born.value >= 0 ? (pos.value[born.value * 2 + 1] ?? 0) : 0));
  const bornR = useDerivedValue(() => 8 + birth.value * 70);
  const bornOpacity = useDerivedValue(() => (born.value >= 0 ? (1 - birth.value) * 0.9 : 0));

  return (
    <GestureDetector gesture={gesture}>
      <View style={StyleSheet.absoluteFill} onLayout={onLayout} collapsable={false}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Rect x={0} y={0} width={size.w} height={size.h}>
            <RadialGradient
              c={vec(size.w / 2, size.h * 0.4)}
              r={Math.max(size.w, size.h) * 0.75 || 1}
              colors={[colors.halo, colors.ink]}
            />
          </Rect>
          <Group transform={transform}>
            <Path path={edgesDim} style="stroke" strokeWidth={1} color="rgba(154,168,255,0.07)" />
            <Path path={edgesLit} style="stroke" strokeWidth={1.1} color="rgba(170,182,255,0.3)" />
            <Path path={pulses} color="rgba(233,236,255,0.75)" opacity={dim} />
            {KINDS.map((k, i) => (
              <Path key={`d${k}`} path={dimPaths[i]} color={kindColor[k]} opacity={0.2} />
            ))}
            {KINDS.map((k, i) => (
              <Path key={`g${k}`} path={litPaths[i]} color={kindColor[k]} opacity={0.8}>
                <BlurMask blur={13} style="normal" />
              </Path>
            ))}
            {KINDS.map((k, i) => (
              <Path key={`l${k}`} path={litPaths[i]} color={kindColor[k]} />
            ))}
            <Circle cx={selX} cy={selY} r={selR} style="stroke" strokeWidth={1.5} color={colors.text} opacity={selOpacity} />
            <Circle cx={bornX} cy={bornY} r={bornR} style="stroke" strokeWidth={1.5} color={colors.text} opacity={bornOpacity} />
          </Group>
        </Canvas>
      </View>
    </GestureDetector>
  );
});

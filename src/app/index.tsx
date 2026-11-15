import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CaptureDock } from '@/components/CaptureDock';
import { thoughtMeta } from '@/components/ThoughtRow';
import { Button, IconButton, KindBadge } from '@/components/ui';
import * as repo from '@/db/repo';
import type { Link, Thought } from '@/db/types';
import { BrainCanvas, type BrainCanvasHandle, type GraphLink, type GraphNode, type Point } from '@/graph/BrainCanvas';
import { takeLastCreated, useDataVersion } from '@/lib/bus';
import { loadSamples } from '@/lib/samples';
import { titleOf } from '@/lib/text';
import { colors, font, radius, space, type } from '@/theme';

/** The graph shows the newest thoughts; older ones stay reachable in the list and search. */
const GRAPH_LIMIT = 400;

export default function BrainScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const version = useDataVersion();
  const canvas = useRef<BrainCanvasHandle>(null);

  const [thoughts, setThoughts] = useState<Thought[] | null>(null);
  const [links, setLinks] = useState<Link[]>([]);
  const [total, setTotal] = useState(0);
  const [layout, setLayout] = useState<Map<string, { x: number; y: number }> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bornId, setBornId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [litIds, setLitIds] = useState<Set<string> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dockHeight, setDockHeight] = useState(90);

  useEffect(() => {
    let live = true;
    repo.loadLayout(db).then((rows) => {
      if (live) setLayout(new Map(rows.map((r) => [r.thought_id, { x: r.x, y: r.y }])));
    });
    return () => {
      live = false;
    };
  }, [db]);

  useEffect(() => {
    let live = true;
    (async () => {
      const [t, l, n] = await Promise.all([
        repo.listThoughts(db, { limit: GRAPH_LIMIT }),
        repo.listLinks(db),
        repo.countThoughts(db),
      ]);
      if (!live) return;
      setThoughts(t);
      setLinks(l);
      setTotal(n);
      const created = takeLastCreated();
      if (created && t.some((x) => x.id === created)) {
        setBornId(created);
        setTimeout(() => canvas.current?.focus(created), 380);
      }
    })();
    return () => {
      live = false;
    };
  }, [db, version]);

  const { nodes, graphLinks, byId } = useMemo(() => {
    const list = thoughts ?? [];
    const ids = new Set(list.map((t) => t.id));
    const degree = new Map<string, number>();
    const gl: GraphLink[] = [];
    for (const l of links) {
      if (!ids.has(l.a_id) || !ids.has(l.b_id)) continue;
      gl.push({ a: l.a_id, b: l.b_id, weight: l.kind === 'manual' ? 1 : l.weight });
      degree.set(l.a_id, (degree.get(l.a_id) ?? 0) + 1);
      degree.set(l.b_id, (degree.get(l.b_id) ?? 0) + 1);
    }
    const ns: GraphNode[] = list.map((t) => ({ id: t.id, kind: t.kind, degree: degree.get(t.id) ?? 0 }));
    return { nodes: ns, graphLinks: gl, byId: new Map(list.map((t) => [t.id, t])) };
  }, [thoughts, links]);

  // Search dims everything that does not match.
  useEffect(() => {
    const q = query.trim();
    if (!searching || !q) return;
    let live = true;
    const timer = setTimeout(async () => {
      const hits = await repo.searchThoughts(db, q, { limit: 400 });
      if (live) setLitIds(new Set(hits.map((h) => h.id)));
    }, 140);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [db, query, searching, version]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4200);
    return () => clearTimeout(t);
  }, [notice]);

  const onSettled = useCallback(
    (points: Point[]) => {
      repo.saveLayout(db, points).catch(() => {});
    },
    [db],
  );

  const selected = selectedId ? byId.get(selectedId) : undefined;
  const selectedDegree = selected ? graphLinks.filter((l) => l.a === selected.id || l.b === selected.id).length : 0;
  const ready = thoughts !== null && layout !== null;
  const empty = ready && thoughts.length === 0;
  const activeLit = searching && query.trim() ? litIds : null;
  const matchCount = activeLit ? nodes.filter((n) => activeLit.has(n.id)).length : 0;

  return (
    <View style={styles.screen}>
      {ready && (
        <BrainCanvas
          ref={canvas}
          nodes={nodes}
          links={graphLinks}
          layout={layout}
          selectedId={selected ? selected.id : null}
          litIds={activeLit}
          bornId={bornId}
          bottomInset={dockHeight + insets.bottom}
          onSelect={setSelectedId}
          onSettled={onSettled}
        />
      )}

      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        {searching ? (
          <View style={styles.searchBar}>
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder="Search your thoughts"
              placeholderTextColor={colors.textFaint}
              style={styles.searchInput}
              returnKeyType="search"
              selectionColor={colors.text}
            />
            {activeLit ? (
              <Text style={[type.small, { color: colors.textSoft }]}>{matchCount} found</Text>
            ) : null}
            <IconButton
              icon="x"
              label="Close search"
              size={40}
              onPress={() => {
                setSearching(false);
                setQuery('');
              }}
            />
          </View>
        ) : (
          <View style={styles.topRow} pointerEvents="box-none">
            <View pointerEvents="none">
              <Text style={styles.wordmark}>engram</Text>
              {ready && !empty ? (
                <Text style={[type.small, { color: colors.textFaint }]}>
                  {total} {total === 1 ? 'thought' : 'thoughts'}
                  {total > GRAPH_LIMIT ? `, newest ${GRAPH_LIMIT} shown` : ''}
                </Text>
              ) : null}
            </View>
            <View style={styles.topActions}>
              <IconButton
                icon="search"
                label="Search"
                onPress={() => {
                  setSelectedId(null);
                  setSearching(true);
                }}
              />
              <IconButton icon="list" label="All thoughts" onPress={() => router.push('/stream')} />
              <IconButton icon="sliders" label="Settings" onPress={() => router.push('/settings')} />
            </View>
          </View>
        )}
      </View>

      {empty && (
        <View style={styles.empty} pointerEvents="box-none">
          <Text style={[type.display, { color: colors.text, textAlign: 'center' }]}>Nothing here yet</Text>
          <Text style={[type.body, styles.emptyBody]}>
            Type or speak a thought below, or share something to Engram from any app. Related thoughts link themselves.
          </Text>
          <Button
            title="Load sample thoughts"
            onPress={() => {
              loadSamples(db).catch((e) => setNotice(String(e?.message ?? e)));
            }}
          />
        </View>
      )}

      <KeyboardAvoidingView behavior="padding" style={styles.bottom} pointerEvents="box-none">
        <View style={{ paddingBottom: insets.bottom + 10, paddingHorizontal: space.md, gap: space.sm }} pointerEvents="box-none">
          {notice ? (
            <View style={styles.notice} accessibilityLiveRegion="polite">
              <Text style={[type.small, { color: colors.text }]}>{notice}</Text>
            </View>
          ) : null}

          {!selected && ready && !empty ? (
            <View style={styles.fitRow} pointerEvents="box-none">
              <IconButton icon="maximize" label="Show the whole graph" tone="raised" size={40} onPress={() => canvas.current?.fit()} />
            </View>
          ) : null}

          {selected ? (
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Opens this thought"
              onPress={() => router.push({ pathname: '/thought/[id]', params: { id: selected.id } })}
              style={({ pressed }) => [styles.peek, pressed && { opacity: 0.85 }]}>
              <View style={styles.peekHead}>
                <KindBadge kind={selected.kind} />
                <Text style={[type.small, { color: colors.textFaint }]}>{thoughtMeta(selected)}</Text>
              </View>
              <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={3}>
                {titleOf(selected)}
              </Text>
              <Text style={[type.small, { color: colors.textSoft }]}>
                {selectedDegree === 0
                  ? 'No connections yet'
                  : `${selectedDegree} ${selectedDegree === 1 ? 'connection' : 'connections'}`}
                {'   Tap to open'}
              </Text>
            </Pressable>
          ) : null}

          <View onLayout={(e) => setDockHeight(e.nativeEvent.layout.height + 20)}>
            <CaptureDock onNotice={setNotice} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: space.md },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingLeft: 6 },
  topActions: { flexDirection: 'row', gap: 2 },
  wordmark: { fontFamily: font.semibold, fontSize: 22, lineHeight: 30, letterSpacing: -0.8, color: colors.text },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.md + 2,
    paddingRight: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(18, 23, 51, 0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
  },
  searchInput: { flex: 1, height: 48, color: colors.text, fontFamily: font.regular, fontSize: 15.5 },
  empty: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    paddingBottom: 120,
    gap: space.md,
  },
  emptyBody: { color: colors.textSoft, textAlign: 'center', marginBottom: space.sm },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  fitRow: { alignItems: 'flex-end' },
  notice: {
    paddingHorizontal: space.md,
    paddingVertical: 12,
    borderRadius: radius.card,
    backgroundColor: colors.inkLifted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
  },
  peek: {
    padding: space.md,
    gap: 8,
    borderRadius: radius.card,
    backgroundColor: 'rgba(18, 23, 51, 0.96)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
  },
  peekHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});

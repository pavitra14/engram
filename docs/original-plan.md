> **Historical document.** This is the plan written before any code, kept for context. The app as built differs in several places: see [`SPEC.md`](SPEC.md) for what exists and [`DECISIONS.md`](DECISIONS.md) for why each change was made. Do not implement from this file.

# SecondBrain — v1 spec (draft)

_Drafted 15 Nov 2026. Library versions checked on this date; re-check before scaffolding._

## 1. What it is

A fully local phone app for capturing thoughts from anywhere on the device and seeing them as a living, interactive network. No account, no server, nothing leaves the phone.

Two promises:

1. **Capture in under 3 seconds** from any surface: share sheet, voice, quick text.
2. **Thoughts organise themselves**: each new thought is linked to related ones automatically and appears in a "neural" graph you can explore.

Separate from SoulMate: no server, no conversation capture, no gesture trigger.

## 2. Scope

**In v1**
- Share sheet target (text, links, images)
- One-tap voice note with on-device transcription
- Quick text capture
- Inbox list + full-text search
- Automatic linking by meaning (on-device embeddings)
- Interactive graph view ("the brain")
- Manual tags and manual links
- Export/import backup file

**Not in v1**
- Sync, accounts, cloud anything
- On-device LLM summaries or chat-with-notes
- iOS (Android first; keep code portable)
- Collaboration

## 3. Capture surfaces

| Surface | How | Milestone |
|---|---|---|
| Share sheet | Android intent filter via `expo-sharing` receive support | M1 |
| In-app quick text | Always-focused input on launch | M1 |
| Voice note | Big record button; hold or tap-to-toggle | M2 |
| App icon long-press shortcuts | "New voice note", "New thought" | M5 |
| Quick Settings tile | Small native Kotlin module | M5 |
| Home-screen widget | Native widget, opens straight into recording | Later |

Rule for every surface: save first, process later. The raw item is written to the database immediately; transcription, embedding and linking run afterwards in a queue, so capture never waits.

## 4. Data model (SQLite)

```
thoughts
  id            TEXT PK (uuid)
  kind          TEXT   -- text | voice | link | image
  body          TEXT   -- typed text, transcript, or shared text
  title         TEXT   -- optional, derived from first line / page title
  source_app    TEXT   -- package that shared it, if any
  url           TEXT
  media_path    TEXT   -- audio or image file in app storage
  status        TEXT   -- raw | processed | failed
  created_at    INTEGER
  updated_at    INTEGER

thoughts_fts    -- FTS5 virtual table over title + body

embeddings      -- sqlite-vec virtual table
  thought_id, vector FLOAT[384]

links
  from_id, to_id
  kind          TEXT   -- semantic | manual | tag
  weight        REAL   -- cosine similarity for semantic links
  PRIMARY KEY (from_id, to_id, kind)

tags            (id, name, color)
thought_tags    (thought_id, tag_id)

graph_layout    (thought_id, x, y)   -- persisted node positions

jobs            (id, thought_id, type, state, attempts)  -- transcribe | embed | link
```

Media lives as plain files under the app's document directory; the database stores paths only.

## 5. Processing pipeline

```
capture → insert thought (status=raw) → enqueue jobs
   voice?  → transcribe → write body
   always  → embed body → store vector
           → nearest-neighbour query → write top-k semantic links above threshold
           → status=processed → graph animates the new node in
```

- Starting values to tune with real notes: top 5 neighbours, similarity ≥ 0.45.
- Jobs are resumable: if the app is killed, the queue picks up on next launch.
- Long transcripts are chunked for embedding; the thought's vector is the mean of its chunks.

## 6. The graph ("neural network" view)

This is the home screen and the product's identity.

- **Nodes** are thoughts. Size reflects number of connections; colour reflects kind or tag.
- **Edges** are links. Brightness reflects weight; manual links are drawn solid, semantic links are soft.
- **Layout** is a force simulation (`d3-force`), so related thoughts pull into clusters on their own.
- **Rendering** is on a GPU canvas (React Native Skia) with gestures via Gesture Handler + Reanimated: pinch-zoom, pan, drag a node, tap to open, long-press to link.
- **Look**: dark background, glowing nodes, faint pulses travelling along edges, a "firing" animation when a new thought connects to its neighbours.
- **Search in graph**: typing dims everything except matches and their neighbours.
- **Scale plan**: render at most ~300–500 nodes at once. Beyond that, show clusters as single "super-nodes" that expand on zoom. Positions are persisted so the brain looks the same each time you open it.

Build a static prototype of this screen with fake data early (M0) — it carries the most design risk.

## 7. Tech stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | Expo SDK 58 (React Native 0.88), dev build | Expo Go will not work; native modules needed |
| Navigation | Expo Router | |
| Share target | `expo-sharing` receive support | Fallback: `expo-share-intent` |
| Database | `expo-sqlite` with FTS + `sqlite-vec` | Fallback: `op-sqlite` (same extensions) |
| Speech-to-text | `react-native-executorch` (Whisper) | Fallback: `whisper.rn` |
| Embeddings | `react-native-executorch`, all-MiniLM-L6-v2 (384-dim) | English-only; see open questions |
| Recording | `expo-audio` | 16 kHz mono WAV for Whisper |
| Graph | `@shopify/react-native-skia` + `d3-force` | |
| Gestures/animation | Gesture Handler + Reanimated | |
| State | Zustand + SQLite as source of truth | |
| Language | TypeScript | |

One ML runtime (ExecuTorch) for both speech and embeddings keeps app size and native complexity down. Models are downloaded once on first run, then everything works offline.

## 8. Screens

1. **Brain** (home): the graph, a search bar, and a floating capture button (tap = text, hold = voice).
2. **Inbox**: reverse-chronological list; filter by kind, tag, unprocessed.
3. **Thought detail**: body, audio player, source link, tags, related thoughts, "link to…".
4. **Share capture sheet**: minimal overlay shown when sharing in; optional note + tag, auto-dismiss.
5. **Settings**: model download/status, language, export/import, storage used.

## 9. Milestones

- **M0 — Skeleton**: Expo project, dev build on device, database + migrations, graph prototype with fake data.
- **M1 — Capture**: share target, quick text, inbox, full-text search.
- **M2 — Voice**: record, transcribe in background, playback.
- **M3 — Auto-linking**: embeddings, vector search, semantic links, "related thoughts".
- **M4 — Brain**: real graph on real data, gestures, animations, search-in-graph.
- **M5 — Polish**: shortcuts, Quick Settings tile, backup, onboarding, performance pass.

## 10. Risks

- **Graph performance** on mid-range Android past a few hundred nodes. Mitigation: clustering, capped visible nodes, simulation off the UI thread.
- **Model size and first-run download** (roughly 75 MB+ for a small Whisper model and ~90 MB for MiniLM). Mitigation: lazy download, clear progress, app usable for text capture before models arrive.
- **Transcription quality** for Indian English, Hindi and mixed speech with small models. Mitigation: test early with real recordings; allow model choice.
- **Share-sheet edge cases** (apps that share odd MIME types, multiple items).
- **Background limits**: Android may kill long jobs. Mitigation: resumable queue; foreground service only if needed.

## 11. Open questions

1. Languages: English only, or Hindi/Hinglish too? This decides the Whisper variant and the embedding model (MiniLM is English-only).
2. Is iOS a goal after v1? Affects how much Android-only native code is acceptable.
3. Personal tool or something to publish on the Play Store?
4. Should images be understood (OCR / image embeddings) or just stored?
5. Encryption at rest (SQLCipher) in v1?
6. App name: SecondBrain as working title?

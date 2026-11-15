# Engram — product and technical spec

_As built in v1.0.0, November 2026. The original plan is summarised in section 9 with what changed and why._

## 1. What it is

A fully local Android app for capturing thoughts from anywhere on the phone and seeing them as a living, interactive network. No account, no server, nothing leaves the phone.

Two promises:

1. **Capture in seconds** from any surface: share sheet, voice, quick text.
2. **Thoughts organise themselves**: each new thought is linked to related ones and appears in a graph you can explore.

## 2. Scope of v1

**In**

- Share sheet target for text, links, images and audio
- Voice notes with live on-device transcription (Android 13+), audio-only elsewhere
- Quick text capture from the dock on the home screen
- List of all thoughts with full-text search and kind filters
- Automatic linking by shared words, tags and website
- Interactive graph as the home screen
- Tags and manual links
- Backup export and import (one JSON file)

**Out**

- Sync, accounts, cloud anything
- On-device LLM features
- iOS (the code is portable; the share extension and speech path need work)

## 3. Capture surfaces

| Surface | How it works |
|---|---|
| Dock | Text field on the home screen. Send saves at once. A bare URL becomes a link thought. |
| Voice | Mic button in the dock. Live transcript and level meter while you talk; tick to save, cross to discard. |
| Share sheet | Android `ACTION_SEND` for `text/*`, `image/*`, `audio/*` and `ACTION_SEND_MULTIPLE` for images. Engram saves, confirms for about a second, then closes so you land back in the app you came from. |

Rule for every surface: **save first, link after**. The thought is inserted, then linked, then the graph is told to animate it in.

## 4. Data model

SQLite via `expo-sqlite`, database file `engram.db`. Schema lives in `src/db/schema.ts` as an append-only list of migrations keyed by `PRAGMA user_version`.

```
thoughts        pk INTEGER PK, id TEXT UNIQUE (uuid), kind (text|voice|link|image),
                body, title, url, source, media_path, duration_ms, created_at, updated_at
thoughts_fts    FTS5 over (title, body), external content, kept in step by triggers
links           a_id, b_id (a_id < b_id, undirected), kind (auto|manual), weight
tags            id, name (unique, case-insensitive)
thought_tags    thought_id, tag_id
graph_layout    thought_id, x, y          -- node positions survive restarts
meta            key, value                -- settings, e.g. speech language
```

- Deleting a thought cascades to its links, tags and layout row; its media file is removed.
- Audio and images are plain files under the app's document directory (`media/`); rows store the path.
- A manual link is never overwritten by an automatic one.

## 5. Linking

`src/lib/linker.ts`, pure TypeScript.

1. Tokenise: lowercase, split on non-letters, drop stop words, light stemming.
2. Weigh each term by TF-IDF across all thoughts.
3. Score a pair by cosine similarity, plus 0.08 for each distinctive word they share (a word found in at most 20% of thoughts, minimum 3), capped at 0.24.
4. Add 0.2 for the same website and 0.2 for a shared tag.
5. Keep the top 4 neighbours scoring at least 0.12.

A thought is relinked when it is created, edited or retagged. "Rebuild connections" in Settings recomputes every automatic link.

**Limit:** this compares wording, not meaning. The scorer sits behind a small interface (`related`, `relateAll`) so an embedding model can replace it without touching callers.

## 6. The graph

`src/graph/BrainCanvas.tsx`.

- **Nodes** are thoughts. Colour is the kind; size grows with the number of connections.
- **Edges** are links. Stronger links pull nodes closer.
- **Layout** is a `d3-force` simulation (link, charge, centring, collision) on the JS thread. Positions are published to the UI thread each tick and saved when the layout settles. A new thought starts beside the thoughts it links to.
- **Drawing** is React Native Skia. Nodes of one kind are a single path, so the whole graph is about a dozen draw calls regardless of size.
- **Touch** runs on the UI thread: one-finger pan, pinch zoom about the fingers, drag a node, tap to select.
- **Selection** lights the thought and its neighbours and dims the rest; a card shows the thought and opens it.
- **Search** uses the same dimming for matches.
- **Motion**: small pulses travel along edges; a ring expands from a new thought when it lands.
- **Scale**: the newest 400 thoughts are drawn. Older ones are in the list and search.

## 7. Voice

`src/lib/useVoice.ts`.

- If the phone runs Android 13+ and reports on-device recognition, Engram uses the system recogniser with `requiresOnDeviceRecognition: true`, continuous mode, punctuation, and audio persistence. The transcript becomes the thought's text and the WAV is kept for playback.
- If recognition fails before any words arrive (usually a missing offline speech pack), recording continues as audio only and the user is told why.
- On other phones, `expo-audio` records an M4A with no transcript.
- Audio is never sent off the device. Settings offers the language choice and a button that asks Android to download the offline speech pack.

## 8. Screens

1. **Graph** (home): canvas, wordmark and count, search, links to list and settings, fit-to-screen, selection card, capture dock.
2. **List**: search field, kind filters, rows with title, snippet, source and age.
3. **Thought**: kind and date, image or audio player, link card, editable text (saved on leaving), tags, connections with strength, connect by search, delete.
4. **Share capture**: saving, saved, or a plain reason it could not be saved.
5. **Settings**: voice language and speech pack, rebuild connections, backup, sample thoughts or delete everything.

## 9. Planned versus built

| Area | Plan | Built in v1 | Why |
|---|---|---|---|
| Linking | On-device embeddings (all-MiniLM via ExecuTorch) with `sqlite-vec` | TF-IDF word overlap with boosts | No model download, instant, and verifiable without a device. Embeddings are the next step. |
| Transcription | Whisper via ExecuTorch | Android's on-device speech recogniser | One small dependency, live transcript, Hindi and Indian English packs provided by the system. Trade-off: needs Android 13+ and an installed speech pack. |
| Processing | Job queue table, resumable | Inline save-then-link | Linking takes milliseconds, so a queue added nothing yet. It returns with embeddings. |
| Graph scale | Cluster super-nodes | Newest 400 thoughts | Simpler; revisit when real graphs get large. |
| Capture surfaces | Shortcuts, Quick Settings tile, widget | Dock and share sheet | Tile and widget need native modules; deferred. |
| Backup | Thoughts and media | Thoughts, links, tags | Media export needs an archive format; deferred. |
| Links schema | Directed, three kinds | Undirected, `auto` or `manual` | Relatedness is symmetric; tag overlap feeds the score instead of being its own link kind. |

## 10. Quality gates

- `npm run typecheck`, `npm run lint`
- `npm run check`: applies every migration to an in-memory database, exercises search and cascade deletes, and tests the linker on fixtures
- CI builds release APKs, installs the x86_64 one on an Android 14 emulator, opens every screen, shares text in, and fails on a crash. Screenshots land on the `smoke-shots` branch.

Not covered by automation: real-device gestures, microphone recording and speech recognition.

## 11. Next

The prioritised backlog, with done-when criteria, is in [`STATUS.md`](STATUS.md#backlog).

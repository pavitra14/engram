# Engram — product and technical spec

_Sections 1 to 10 describe v1.0.0. **Section 12 describes what v2 changes**; where they disagree, section 12 wins. The original plan is summarised in section 9._

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

## 12. Version 2: the redesign

v2 keeps v1's database, capture pipeline, linker, voice path and backup. It replaces the interface and adds grouping, a notepad and a clipboard prompt. Design: [`DESIGN.md`](DESIGN.md). Reasons: [`DECISIONS.md`](DECISIONS.md) D14 to D19.

### Screens

| Route | Screen | Notes |
|---|---|---|
| `/` | Today | Stream of all thoughts, newest first, sectioned by day. Group pills. Capture bar with the clipboard prompt. |
| `/map` | Map | One circle per group, sized by count; lines join related groups. Ungrouped thoughts and the latest thought below. |
| `/group/[id]` | Group | Members newest first, nearby groups. `loose` lists ungrouped thoughts. |
| `/thought/[id]` | Thought | Edit in place (saved on blur and on leaving), audio, link card, group, tags, linked thoughts with a reason each, link another, copy, delete. |
| `/search` | Search | FTS5 prefix search, kind filters with counts, matching groups first, matches highlighted. |
| `/voice` | Voice | Starts recording on open. Live transcript, level meter, save or discard. |
| `/compose` | Note editor | Full page. Saves one text thought. Asks before discarding. |
| `/settings` | Settings | Appearance (System, Light, Black), voice language, speech pack, export, import, rebuild links, delete everything. |
| `/handle-share` | Share sheet | Saves, shows where the item was placed, closes after about 2.6 s unless "Add a note" is tapped. |

The v1 graph canvas and list screen are gone.

### Groups

`src/lib/groups.ts`, pure TypeScript, recomputed on every data change by `src/lib/brain.ts`.

1. Every thought starts with its own label. For up to 12 rounds, in id order, each thought takes the label with the greatest total link weight among its neighbours; ties go to the smaller label. This is deterministic and independent of input order.
2. Labels with two or more thoughts become groups. The rest are "not in a group".
3. A group's name is the word that scores highest on coverage (share of members using it) × rarity across all thoughts × focus (how much of its use is inside this group), shown in its most common written form. Generic words are excluded, and no two groups share a name.
4. A group's id is its smallest member id. Colours are assigned in size order.
5. "Near" groups are those it shares links with, strongest first.

### Link reasons

`whyLinked` gives each linked thought a plain reason: the same website, a shared tag, the one or two longest shared words, or "Linked by you".

### Clipboard

The capture bar asks the system whether the clipboard has text, on launch, on returning to the foreground and when the clipboard changes. If so it shows "Save what you copied". Tapping it reads the clipboard and saves the text as a thought with source `clipboard`; a URL becomes a link thought. The clipboard is never read without that tap.

### Themes

`ThemeProvider` in `src/theme.tsx` resolves the appearance setting (stored in `meta.appearance`) against the system colour scheme and exposes a palette through `useTheme()`. No component hard-codes a colour.

### Removed dependencies

`@shopify/react-native-skia` and the Sora font. Added: `expo-clipboard`, Newsreader and Inter.

## 13. Version 2 additions: files, to-dos, calendar, meaning

Reasons are in [`DECISIONS.md`](DECISIONS.md) D20 to D23.

### Data model (migration 2)

`thoughts` gains: `kind` now also `video` and `file`; `file_name`, `mime_type`, `file_size`; `todo` (0 or 1), `remind_at`, `done_at`, `notif_id`. New table `embeddings(thought_id, model, vector BLOB)`, one unit-length float32 vector per thought. The upgrade rebuilds `thoughts` and keeps every row, link, tag and the search index.

### Files

| Source | What happens |
|---|---|
| Attach menu, "Photo or video" | System picker, several at once. Each becomes an image or video thought. |
| Attach menu, "File" | Document picker, several at once. |
| Share sheet | Text and links as before; images, video, audio and documents are copied in. Several images, videos or documents can be shared at once. |

The kind is taken from the MIME type, falling back to the file extension. Videos and documents are titled with their file name, which makes them searchable. Images show as a thumbnail in lists and full width on their screen. Videos and documents show a card that opens them in another app.

### To-dos and reminders

- The first pill on a thought's screen is "To do". Its menu offers: add to the list with no reminder; remind in an hour, this evening, tomorrow at 9 or in a week; pick a date and time; mark done; remove.
- A reminder is a local notification on a "Reminders" channel. Tapping it opens the thought.
- Today lists up to three open to-dos, soonest first, with a round check to mark each done. The To do screen (fourth header button) lists all open and the last 50 done.
- An overdue reminder is shown in the danger colour with how long it has been.

### Calendar

- Thought menu, "Add to calendar": opens the system's new-event screen with the thought's first line as the title, its text and link as notes, and its reminder time (or the next hour) for 30 minutes.
- Settings, "Show today's events" (off by default): asks for calendar access, then Today lists the rest of today's events. Tapping one opens the note editor with the event's title as the first line.

### Linking by meaning

- Settings, "Understand meaning": downloads the model on first use, gives every thought a vector, rebuilds links, and from then on embeds each thought when it is captured or edited. Progress is shown in Settings. Turning it off deletes the vectors and rebuilds links from words alone.
- Scoring: `max(word score, cosine)` when cosine ≥ 0.5, otherwise the word score. Website and tag boosts still apply. Top 4 neighbours above 0.12 are kept, as before.
- A link with no shared words is explained as "Similar meaning".
- On launch, if the setting is on, the model is loaded in the background; until it is ready, new thoughts link by words and are embedded on the next launch.

## 14. Version 0.3

Reasons are in [`DECISIONS.md`](DECISIONS.md) D25 to D32. Where this section and earlier ones disagree, this one is current.

### Data

PowerSync, local-only. Tables: `thoughts`, `links`, `tags`, `thought_tags`, `meta`, each with a text `id`. `thoughts` adds `body_html`, `repeat`, `priority`, `event_id`, `event_title`, `event_at`. Beside them, two ordinary SQLite tables that are rebuilt from the thoughts: `embeddings` (vector as hex text) and `thoughts_fts`. If the SQLite build has no FTS5, search falls back to matching every word with `LIKE`.

### Notes

A note is a title (optional) and a body. Lists show the title, or the body's first line when there is none, and a two-line preview of the body under a title. The formatting bar appears above the keyboard while the body has focus. Edits are saved when the field or the screen is left.

### Home

| Layout | What is on screen |
|---|---|
| List | Header, group pills, today's events, three to-dos, "Worth another look", then the stream by day |
| Map and list | Header, the map in a panel about a third of the screen tall, then the list without group pills |
| Map | Header, the whole map, to-dos, the five latest thoughts |

### Map

Groups are circles sized by member count and joined to their nearest groups. Up to 18 ungrouped thoughts are small circles with their first words, joined to nothing; the rest are behind an "N more on their own" pill.

### To-dos

Sections in order: Overdue, Today, Tomorrow, This week, Later, No date; important first within each. Repeat choices: every day, every week, every month (the same day, or the month's last day when it is shorter). Finishing a repeating to-do reschedules it. Notification buttons: Done; In an hour.

### Outcomes

Group screen: Chat with Claude and Chat with ChatGPT (only when installed), Make one note of these. The message lists each thought's words (up to about 6,000 characters) and asks what the person seems to be trying to do, the three most useful next actions, and what is missing or contradictory.

### Widgets

Quick thought (4×1): the field opens a new note, the tick opens the to-do list, the dot starts a voice note. To do (3×2): up to four open to-dos with their due labels; each opens its thought; + opens a new note.

### Test hooks

`engram://samples`, `engram://group/largest`, `engram://latest?menu=todo`, `engram://settings?smart=on`, `engram://settings?home=list|split|map`, `engram://search?q=…`.

## 15. Version 0.4

Reasons: [`DECISIONS.md`](DECISIONS.md) D33 to D36. Cloud details: [`CLOUD.md`](CLOUD.md).

- **Quick capture.** One line becomes the title. Several lines: first line title, rest body. A bare web address is still a link with no title.
- **Hold a note** in Today, a group, search or the to-do list: Open; add to to-do, remind tomorrow (or mark done, important, remove); Add to calendar; Think this through with Claude or ChatGPT (if installed); Copy text; Delete.
- **Clipboard.** A button between the plus button and the field, visible only while the clipboard has text and the field is empty.
- **Tour.** Five pages: capture, notes, groups and the map, to-dos and resurfacing, privacy and the two optional services. Skip on every page but the last. Stored as `meta.tour_done`.
- **Engram Cloud.** Settings section with the explanation, email, password, Sign in, Create account; when signed in: the account, a status line (syncing, up to date and when, N changes waiting, or not synced), Sync now, Sign out, Delete my cloud account. Syncs four seconds after a change, on returning to the app, and on demand.

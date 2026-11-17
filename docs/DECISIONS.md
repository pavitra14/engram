# Decisions

Short records of choices someone might later want to revisit. Newest at the bottom. Add an entry when you make a choice that is not obvious from the code.

Format: **context**, **decision**, **consequences**, and what would make us revisit it.

---

## D1. Separate app from SoulMate, built on React Native

_15 Nov 2026_

**Context.** The owner already has SoulMate, a larger planned second-brain project with a server and gesture-triggered conversation capture.
**Decision.** Engram is a separate, simpler app: phone-only, no server, React Native with Expo.
**Consequences.** No shared code or data with SoulMate. Everything must work offline on the device.

## D2. Name: Engram

_15 Nov 2026_

**Context.** Working title was SecondBrain.
**Decision.** "Engram", the neuroscience term for the physical trace a memory leaves in the brain. Alternatives considered: Axon, Dendrite, Synapse (crowded).
**Consequences.** Package `com.pavitra14.engram`, scheme `engram://`. Play Store name collisions were not checked.

## D3. Android first

_15 Nov 2026_

**Context.** iOS share extensions are the hardest part of a share-target app; the owner asked for Android first.
**Decision.** Ship Android only. Keep code portable where it costs nothing.
**Revisit when** v1 is stable on Android.

## D4. Expo SDK 58 with development builds

**Decision.** Expo (CNG, `expo prebuild`) rather than bare React Native, on the current SDK 58 / RN 0.88. Native modules (Skia, SQLite extensions, speech, sharing) rule out Expo Go.
**Consequences.** `android/` is generated and gitignored; native changes go through config plugins.

## D5. The graph is the home screen (superseded by D14)

**Context.** The owner wanted thoughts shown "as an interactive neural network" that looks modern and futuristic.
**Decision.** A force-directed graph drawn with React Native Skia, laid out by `d3-force`, is the first screen. Capture lives in a dock on top of it.
**Consequences.** No maintained React Native graph library fit, so `src/graph/BrainCanvas.tsx` is custom. Nodes are batched into one Skia path per kind to keep draw calls flat.

## D6. Word-overlap linking for v1, embeddings later

**Context.** The plan called for on-device embeddings (ExecuTorch, all-MiniLM-L6-v2) with `sqlite-vec`.
**Decision.** Ship TF-IDF cosine plus a lift for shared distinctive words and boosts for shared website or tag (`src/lib/linker.ts`). Threshold 0.12, top 4 neighbours, tuned against the sample data.
**Why.** No model download, instant, deterministic, and testable in Node. The embedding path could not be verified without a device in the build environment.
**Consequences.** Paraphrases do not link. The linker's interface (`related`, `relateAll`) is stable so an embedding scorer can replace it.
**Revisit:** backlog item 2 in `STATUS.md`.

## D7. Android's on-device speech recogniser instead of Whisper

**Context.** The plan called for Whisper via ExecuTorch or `whisper.rn`.
**Decision.** `expo-speech-recognition` with `requiresOnDeviceRecognition: true`, live interim results, and the recording persisted as WAV. Fall back to `expo-audio` (M4A, no transcript) when on-device recognition is unavailable or fails before any words arrive.
**Why.** Small dependency, live transcript while speaking, system-provided language packs including Hindi and Indian English, no 75 MB+ model to ship.
**Consequences.** Transcription needs Android 13+ and an installed offline speech pack. Older phones get audio-only notes. Audio never leaves the device either way.
**Revisit if** transcription quality or coverage is poor on the owner's phone.

## D8. No job queue yet

**Context.** The plan had a resumable `jobs` table for transcribe / embed / link.
**Decision.** Capture inserts, then links inline. Transcription happens during recording.
**Why.** Linking takes milliseconds. A queue added complexity with nothing to queue.
**Revisit** when embeddings arrive (model inference can be slow and should not block capture).

## D9. Undirected links with two kinds

**Decision.** `links(a_id, b_id)` with `a_id < b_id`, `kind` is `auto` or `manual`, and `weight`. Tags feed the link score rather than being their own link kind. Manual links are never downgraded by automatic relinking.

## D10. No state library

**Decision.** SQLite is the source of truth. Writes call `dataChanged()`; screens subscribe with `useDataVersion()` and re-query.
**Why.** The data set is small and local; a store would duplicate it.

## D11. Design direction: "night water" (superseded by D14)

**Decision.** Deep indigo instead of black, one typeface (Sora), four signal colours mapped to the kinds of thought, and only the graph allowed to glow or move. See `DESIGN.md` for tokens and `research.md` for the award-winning apps used as reference.

## D12. CI on GitHub Actions builds, tests and releases

**Decision.** One workflow (`.github/workflows/android.yml`): checks, an x86_64 APK for the emulator test and an arm64 APK for phones, a smoke test on an Android 14 emulator, screenshots force-pushed to `smoke-shots`, and a GitHub release for `vX.Y.Z` tags or `release/vX.Y.Z` branches.
**Why two APKs.** The universal APK was 113 MB. Phones only need arm64; the emulator needs x86_64.
**Why release branches.** Claude Code cloud sessions cannot push tags.

## D13. Debug signing for sideloading

**Decision.** v1 is signed with the template debug keystore, which is stable across builds so upgrades install cleanly.
**Revisit** before any Play Store submission (backlog item 7).

## D14. Redesign: a typographic stream with a map of groups

_16 Nov 2026_

**Context.** The owner found the v1 design poor. Reviewing it against Apple's and Google's guidance and recent award winners showed three problems: the home screen had no readable words, capture was a thin bar, and kind was shown by colour alone.
**Decision.** Three directions were mocked (Atlas, Stream, Orbit). The owner chose Stream's look with Atlas as the map. Home is now a readable stream of today's thoughts; the network appears as a map of named groups; thoughts are always shown as words.
**Consequences.** The Skia thought-level graph and its gestures were removed, along with the Skia dependency. `docs/DESIGN.md` was rewritten. Mocks live in `docs/design/`.

## D15. Light and true-black themes

**Decision.** Two palettes with the same token names: light, and true black (`#000000`) for AMOLED screens. Settings offers System, Light and Black; System follows the phone.
**Why not Material's grey dark theme.** The owner asked for AMOLED black. Material's default dark surface is dark grey, which is fine alongside an explicit black option.
**Revisit if** a softer grey dark theme is wanted as what System maps to.

## D16. Groups are computed, not stored

**Context.** The map needs groups with names; v1 only had pairwise links.
**Decision.** `src/lib/groups.ts` runs deterministic label propagation over the link graph and names each group after the distinctive word most members share. Groups are recomputed whenever data changes and are never written to the database.
**Consequences.** No migration. Groups cannot be renamed, merged or pinned by hand yet, and a group's id can change when links change. Names are single words and sometimes odd (a running group may be called "Pace").
**Revisit** when semantic linking lands, or if hand-edited groups are wanted (that needs a table).

## D17. Clipboard prompt reads only on tap

**Context.** The owner wants home to offer "create from clipboard" when something has been copied.
**Decision.** The app checks whether the clipboard has text (`hasStringAsync`, which does not read it) and shows a "Save what you copied" prompt. The content is read only when the prompt is tapped.
**Why.** Reading the clipboard makes Android show a "pasted from your clipboard" notice and iOS show a permission prompt. Doing that on every launch would be intrusive. There is no clipboard permission to declare on Android; a foreground app may read it.
**Consequences.** The prompt cannot preview what will be saved, and it reappears each time the app returns to the foreground while the clipboard has text.

## D18. Notepad as a full-page editor

**Decision.** The capture field has an expand button that opens `compose.tsx`, a full-page editor for longer notes. A note is an ordinary text thought; its first line is its title in lists. Existing thoughts are edited in place on their own screen.
**Why.** No new data model, and long notes link and group like everything else.

## D19. New brand: a serif "e" and a full stop

**Decision.** The mark is a Newsreader "e" followed by a dot, paper on cobalt. The wordmark is "engram." It replaces the v1 mark (an "e" drawn as a graph), which belonged to the dark graph design.

## D20. Any file can be a thought

_16 Nov 2026_

**Decision.** Two new kinds, `video` and `file`, join text, voice, link and image. A file is copied into Engram's own storage on capture, from the attach menu (photo or video picker, document picker) or the share sheet (`text/*`, `image/*`, `video/*`, `audio/*`, `application/*`). Videos and documents open in whichever app on the phone handles them; images show inline.
**Why not an in-app video player or document viewer.** Each is another native dependency to carry for something the phone already does well.
**Consequences.** The `kind` CHECK constraint had to change, which in SQLite means rebuilding the table (migration 2). Files are not understood: a PDF links only by its file name and any note you add.

## D21. To-dos are thoughts with a flag

**Decision.** A thought has `todo`, `remind_at` and `done_at`. Putting it on the to-do list is one tap on its screen, with an optional reminder from presets or a date and time. Reminders are local notifications scheduled on the phone (`expo-notifications`); nothing is sent to a server.
**Why.** The owner wants thoughts not to be forgotten once entered. Keeping to-dos as ordinary thoughts means they still link and group.
**Consequences.** No recurring reminders, no sub-tasks, no due-date-without-time. If notifications are denied, the to-do and its time are kept and the person is told the phone will not alert them.

## D22. Calendar: write through the system screen, read only if asked

**Decision.** "Add to calendar" opens the phone's own new-event screen pre-filled from the thought, which needs no permission. Separately, a setting (off by default) shows today's events on Today; tapping one starts a note titled with the event. Only that setting asks for calendar access.
**Why.** It keeps the default install free of a calendar permission, and makes the common wish (notes for a meeting) one tap.
**Not done.** Thoughts are not stored against calendar event ids, and reminders are not mirrored into the calendar automatically.

## D23. Linking by meaning with an on-device model, opt-in

**Context.** Word overlap cannot link paraphrases. The owner asked for links and groups that follow meaning.
**Decision.** `react-native-executorch` runs `distiluse-base-multilingual-cased-v2` (512-dimension sentence vectors, 50+ languages including Hindi) on the phone. Each thought gets a unit vector stored as a BLOB in `embeddings`. The linker scores a pair as the greater of its word score and its vector cosine when the cosine is at least 0.5. Groups are unchanged in method but follow the better links.
**Why this model.** Multilingual matters for this owner; MiniLM is English-only.
**Revised 16 Nov 2026.** The library's `DEFAULT` variant on Android is a Vulkan build; on the emulator it gave every sentence the same vector. `semantic.ts` now names the XNNPACK (processor) build, and tests any loaded model on a fixed paraphrase pair, refusing it if it cannot tell the pair from an unrelated sentence. Measured with the processor build: unrelated notes about 0.08, 90th percentile 0.28, the sample paraphrase 0.28. The thresholds were lowered to match (floor 0.25, 1.25 standard deviations above a thought's own average, mutual nearest three).
**Why opt-in.** The model is a download of about 130 MB from Hugging Face. The app otherwise never touches the network, so the person chooses when that happens. The library's download telemetry is switched off.
**Why brute force, not `sqlite-vec`.** A few thousand 512-float vectors compare in milliseconds in JavaScript. An index is not needed yet.
**Consequences.** Group names still come from shared words, so a group joined only by meaning may get a generic name. Images, audio without a transcript, and file contents are not understood. The 0.5 threshold is a starting value and has not been tuned on real notes.
**Revisit:** tune the threshold on the owner's notes; name groups with a small on-device language model; understand images and documents (OCR, image embeddings).

## D24. Push to main; every release is a beta

**Decision (owner's instruction, 16 Nov 2026).** The owner is the sole maintainer: push directly to `main`. Releases are tagged `vX.Y.Z-beta.N` and published as pre-releases until the owner says the app is ready.

## D25. PowerSync, local-only, in place of expo-sqlite

_16 Nov 2026, owner's request._

**Context.** The owner expects to add a backend such as Supabase later and wants the storage to be ready for it.
**Decision.** The database is PowerSync (`@powersync/react-native` on op-sqlite) with every table marked local-only and no backend connected. Tables and columns are declared in `schema.ts`.
**What it costs.** PowerSync tables are views over JSON rows. They cannot have constraints, foreign keys, cascades, BLOBs or upserts, and there are no migrations. So: every row has a text `id` (links use `a:b`, tag assignments `thought:tag`, settings their key); `repo.ts` does by hand what constraints did; meaning vectors are hex text; the search index and the vectors are ordinary SQLite tables beside the PowerSync ones because they are derived and should never sync.
**Why not keep expo-sqlite and "be ready" on paper.** The owner asked for the engine, and moving later means a second data migration.
**Carried over.** On first launch the old `engram.db` is read with op-sqlite and copied in (`legacy.ts`). The old file is left in place.
**Testing.** `repo.ts` imports nothing from React Native, so the Node tests run it against node:sqlite with plain tables of the same columns. That proves the SQL and the rules, not PowerSync's own behaviour.
**When sync is added.** Remove `localOnly`, add a connector and sync rules, and move rows as PowerSync's "local-only then sync" guide describes. Timestamps are milliseconds (bigint in Postgres).

## D26. Every entry is a note: a title and a formatted body

**Decision (owner's request).** One editor (`NoteEditor`) everywhere: a title field and a body that takes bold, italic, underline, strike, a heading, bulleted, numbered and check lists, and quotes. The separate "Long note" choice is gone. The quick bar still saves a line with no title.
**Library.** `react-native-enriched-html`: a native editor (no web view) that outputs HTML and supports React Native 0.88.
**Storage.** `body` holds the plain words and `body_html` the HTML, or null when nothing is formatted. Search, linking, lists and widgets read `body`, so they never need to parse HTML.
**Not done.** Images inside a note, tables, links with custom text, and showing formatting in list previews.

## D27. Three home layouts

**Decision (owner's request).** Settings, Home screen: List (default), Map and list (the map in the top third, scrolling on its own), or Map. Stored in `meta.home_view`.

## D28. Each screen moves the way that fits it

**Context.** Every screen slid in from the right and the owner found it slow and uniform.
**Decision.** Going deeper (a thought, a group) pushes from the side and swipes back. Places you glance at (map, search, to-dos, settings, home) fade. Things you start and finish (a note, a recording, a share) rise from the bottom. Menus slide up while the screen dims. Nothing runs longer than 240 ms.
**Unverified.** The durations are requests to the native stack; Android may not honour all of them.

## D29. To-dos: repeats, importance, notification buttons, the week ahead

**Decision.** A reminder can repeat daily, weekly or monthly: finishing it moves it to its next time instead of marking it done. A to-do can be marked important and leads its section. The list is split into Overdue, Today, Tomorrow, This week, Later and No date, with a line to add one. Reminders carry Done and In an hour buttons. With calendar access on, the list also shows the next seven days of events, and a note started from an event remembers which event it was for.
**Not done.** End dates for repeats, custom intervals, sub-tasks, two-way calendar sync.

## D30. From ideas to outcomes

**Decision.** Three small things, none of which needs a server. A group can be gathered into one note that ends with "Next step:". If Claude or ChatGPT is installed, a group (or a thought and what it links to) can be opened there as a drafted message asking for the three next actions. Each day Today shows one thought at least a week old under "Worth another look".
**How the hand-off works.** Engram checks whether the app is installed (a manifest `<queries>` entry added by `plugins/withAppQueries.js`), then opens the app's own web link with the message in it, and also copies the message. Nothing is sent by Engram; the person sends it in the other app.
**Why not a share intent aimed at the app.** `expo-intent-launcher` cannot target a package without knowing the activity's class name.
**Unverified.** That each app fills in the draft from its link.

## D31. Home-screen widgets

**Decision.** Two widgets with `react-native-android-widget`: Quick thought (write, to-do list, speak) and To do (the next four, and a button to write). Taps open `engram://` links. The To do widget reads a small JSON file the app rewrites on every change, because Android may redraw a widget while the app is closed.
**Why not `expo-widgets`.** Its Android support could not be confirmed for SDK 58.

## D32. Version numbers are 0.x; one push per batch

**Decision (owner's instruction).** The app is not ready to be called 1.0. Versions are `0.x`, releases `v0.x.y-beta.n`. Work is finished and checked locally and pushed once, because a CI run takes about twenty minutes. CI itself was trimmed and can use a self-hosted runner (`docs/CI.md`).

## D33. Engram Cloud: optional sync, straight to Supabase

_16 Nov 2026, issue #2._

**Decision.** An optional account syncs notes, to-dos, tags and hand-made links through two Postgres functions (`apply_sync_batch` to write, `pull_changes` to read). Signed out, nothing is recorded or sent. Full account in `docs/CLOUD.md`.
**Why not PowerSync's replication service, as the issue proposes.** It is a separate service that must be created and connected; none exists for this project and an agent cannot create one. The local database stays PowerSync, and the sync round talks to a `Remote` interface so the transport can be swapped.
**Why fetch, not `supabase-js`.** The app needs six calls. Writing them out avoids a dependency and its polyfills.
**Conflict rule.** Never overwrite a note's words silently. A stale edit with different words is kept as a second note; a deletion beats an edit and the edit is kept as a new note. Everything else is last change wins. There is no merge screen.
**Ids are text on the server**, not uuid as the issue sketches, because link and tag-assignment ids are built from two ids.
**Consequences.** Files are not uploaded. Two devices that each create a tag with the same name get two tags. One local database per phone: signing in to a second account on the same phone copies the phone's notes into it, after asking.
**Revisit:** media in Storage; Google and Apple sign-in; a PowerSync service; a real merge screen; per-account local databases.

## D34. The privacy promise is now "unless you sign in"

**Decision.** The README, the tour, Settings and `AGENTS.md` say that everything stays on the phone unless the person signs in to Engram Cloud, and that the cloud copy is not end-to-end encrypted. Cloud AI (later phases of issue #2) will be a separate switch.

## D35. Only phase 1 and part of phase 2 of issue #2

**Decision.** Cloud search, Ask Engram, insights, other clients, sharing and billing are not started. Each needs an AI provider or payment account, a cost ceiling and consent wording that are the owner's to choose.

## D36. A quick line is a title; hold a note for its menu; clipboard as a button; a tour

**Decisions (owner's requests, 16 Nov 2026).**
- A line typed in the bar, shared, or pasted becomes the note's title with an empty body. With several lines, the first is the title. One line over 140 characters is body text with no title.
- Holding a note in any list opens the same actions as its three-dot menu (`ThoughtMenu`).
- The "Save what you copied" strip above the bar is gone. A clipboard button appears beside the plus button only while the clipboard holds text. It still reads the clipboard only when tapped.
- A new install opens on a five-page tour. A phone that already holds thoughts skips it. Settings, Help shows it again.

## D37. Feature flags on the server; Engram Cloud is behind one, off

_16 Nov 2026, owner's request._

**Decision.** A public `feature_flags` table in the project's Supabase database holds one row per flag. The app reads it at launch. Missing, false, or never fetched means off. `cloud` gates everything in Engram Cloud and ships off.
**The fallback, precisely.** The owner asked for "off" as the fallback. A phone that has never reached the server treats every flag as off. A phone that has reached it remembers the last answer and uses that while offline, because switching the cloud off every time a signed-in phone loses signal would stop it recording changes to send later.
**Cost.** The app now makes one request at launch even with no account. It carries the project's public key and nothing about the person. The privacy wording in the README and `AGENTS.md` says so.
**To switch the cloud on:** `update public.feature_flags set enabled = true where key = 'cloud';` Phones pick it up the next time they start.
**Not done.** Per-person or per-version targeting, percentages.

## D38. Voice notes had no microphone permission

**What happened.** `expo-image-picker` was configured with `microphonePermission: false` when attachments were added (0.2). That option does not mean "the picker does not need it"; it removes `RECORD_AUDIO` from the app. Voice notes could not ask for the microphone from then on. The emulator test cannot use a microphone, so nothing caught it.
**Fix.** The option now carries the same permission text as the voice features. The generated manifest was read to confirm `RECORD_AUDIO` is declared.

## D39. English versions of notes, on the phone, opt-in

**Decision (owner's request).** Settings, Translation. When on, a note not in English gets an English version stored beside it: shown under the note and under its title in lists, searchable, and used when linking. The original is never changed.
**How.** `expo-translate-text`, which on Android is Google's ML Kit: it identifies the language and translates on the device. The first note in each language downloads that language's pack (about 30 MB) from Google.
**"Existing system libraries".** Android has no system translation API an app can call for its own text; ML Kit is the on-device library Google provides for it, and the one the system's own offline translation uses. It adds its native library to the APK.
**Limits.** ML Kit's quality is "casual"; mixed-language notes are translated by whichever language it detects; formatting is not carried into the English version; nothing is translated out of English.

## D40. A question a day, a weekly review, templates

**Decision.** Three small additions aimed at coming back and at finishing things. Today shows one question a day that becomes a note's title when answered (hide it for the day, or switch it off in Settings). A weekly review shows the week in four numbers and a bar per day, the group most on your mind, and up to five notes untouched for two weeks to keep, turn into a to-do, or delete. A new note can start from one of five outlines.
**Why these.** Each uses what is already stored and needs no new library or permission.

## D41. Delete means trash; the trash and other marks are local (0.6)

Deleting sets `trashed_at` and offers Undo; the row is removed for good after 30 days. Confirmation dialogs for delete were dropped in favour of undo. `pinned`, `trashed_at`, `recall_*`, `list` and `focus_min` are in `LOCAL_THOUGHT_COLUMNS` and are never sent to Engram Cloud, so the server schema did not change. Consequence: a note trashed on one phone stays on another until the 30 days pass and the real delete syncs. Revisit when the cloud flag is turned on.

## D42. A group's name is stored against its members (0.6)

Group ids are derived and change. A `projects` row keeps the member ids it was given for and is carried by whichever group now holds more than half of them (`matchProjects`). Merging groups is done with manual links, because groups only ever follow links.

## D43. Reminders from words are cautious, and only for the person's own words (0.6)

`parseWhen` reads the first line only, needs a day, a relative time or an unambiguous clock time, and treats "Sat", "Sun", "Wed" and "may" as words. Shared, pasted and imported text never sets a reminder. Every one set shows a toast with Undo.

## D44. English notes never reach the translator (0.6)

ML Kit downloads a model even for English to English, and one failure rejected the whole call. `looksEnglish` (script check plus common words) marks such notes as English without calling it. Short Latin text with no common English word still goes to the translator.

## D45. OCR uses ML Kit through expo-text-extractor (0.6)

On the phone, Latin script only, delivered by Google Play services (which may download the recogniser once; nothing of the person's is sent). Loaded with a lazy `require` like executorch. Words are derived data in `image_text`.

## D46. Left out of 0.6 on purpose

Wear OS (a second app target), an on-phone LLM (about 1 GB, heavy native code, untestable in CI), place reminders (background location against the privacy rule's spirit), encrypted backups (no vetted cipher in the dependency set), image cards (needs a view-capture library). Shake works only while the app is open: background listening would need a permanent foreground service.

## D47. The package id becomes `dev.pavitra.engram` in 0.7

The owner asked for it, to match the domain. Android treats a new id as a different app: 0.7 installs beside 0.6 and earlier instead of over them, and their notes are not carried across. People move with Settings, Export a backup in the old app, Import in the new one, then uninstall the old one. Files and recordings only move once backups include them, so that ships in the same release. The old id was `com.pavitra14.engram` (see D1).

## D48. Text recognition is our own module with bundled models (0.7)

`expo-text-extractor` uses the Play services recogniser, which is fetched on first use and failed on the CI emulator. `modules/engram-ocr` uses `com.google.mlkit:text-recognition` and `text-recognition-devanagari` 16.0.1, whose models ship in the APK: no download, works offline, testable in CI, and Hindi is read. Both recognisers run on each picture and the longer result is kept. Cost: a larger APK and native code we maintain.

## D49. Ask your notes uses one downloaded model on every phone (0.7)

The owner did not want behaviour that depends on the device, so Android's built-in Gemini Nano (available on a short list of flagships) is not used. `react-native-executorch` runs LFM 2.5 1.2B (XNNPACK build), downloaded on request. Retrieval happens first with search and meaning vectors; the model sees at most five notes and must cite them. Hindi notes are passed in their English translation when one exists. Behind the `ask` flag until tried on real phones; the choice of model is the first thing to revisit.

## D50. Betas are ordinary releases from 0.7 (0.7)

The owner wants 0.7 usable by several people. CI marks only `-alpha` and `-rc` names as pre-releases. The APK is still signed with the template debug key; the release notes say to install only from the releases page, and a real key will force one more reinstall.

## D51. All rights reserved, not open source (17 Nov 2026)

The owner wants people to read the code and use the app, but not copy, modify or reuse the code. `LICENSE` says so explicitly rather than leaving the repository without a licence, which means the same in law but is easy to misread. It allows installing from the official releases for personal use, issues, and the viewing and forking that GitHub's terms already allow on GitHub; it takes rights to any contribution sent in. `docs/TERMS.md` section 6 and the README match it. Do not add an open-source licence, or code under a licence that would force one, without the owner's say-so.

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

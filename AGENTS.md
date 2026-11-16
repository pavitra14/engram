# Engram — instructions for agents

Engram is a local-first "second brain" for Android, built with Expo and React Native. You capture thoughts by typing, speaking or sharing from any app, and they link themselves into an interactive graph. There is no server and no account; everything is stored in SQLite on the phone.

This file is the entry point for any coding agent (Claude Code, Codex, Cursor, Copilot and others). Read it fully before changing anything. Humans can read it too.

## Start here

| Read | When |
|---|---|
| [`docs/STATUS.md`](docs/STATUS.md) | Always. What works, what is unverified, and the prioritised backlog. |
| [`docs/SPEC.md`](docs/SPEC.md) | Before changing behaviour. The product and technical spec as built. |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Before touching UI. Palette, type, motion, copy rules, logo. |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Before reversing a choice. Why things are the way they are. |
| [`docs/original-plan.md`](docs/original-plan.md) | Background only. The pre-build plan; superseded where SPEC differs. |
| [`docs/research.md`](docs/research.md) | When choosing libraries or revisiting design inspiration. |

When you finish a piece of work, update `docs/STATUS.md` (and `DECISIONS.md` if you made a choice someone might later question). These files are the shared memory between agents and sessions; if they are stale, the next agent starts wrong.

## Project facts

- **Owner:** pavitra14 on GitHub. Repo: `pavitra14/engram`. Default branch: `main`.
- **Platform:** Android first. iOS is out of scope for now, but avoid Android-only code where a cross-platform option is equally good.
- **Package id:** `com.pavitra14.engram`. App name: Engram. URL scheme: `engram://`.
- **Stack:** Expo SDK 58, React Native 0.88, React 19.3, TypeScript, Expo Router, `expo-sqlite`, `d3-force` (layout only), Reanimated 4.7, `expo-clipboard`, `expo-speech-recognition`, `expo-notifications`, `expo-calendar`, `expo-image-picker`, `react-native-executorch` (text embeddings only). Skia was removed in v2; nothing draws on a canvas.
- **Release:** v1.0.0 (the dark graph design) is at <https://github.com/pavitra14/engram/releases/tag/v1.0.0>. v2 (the redesign) is described in `docs/STATUS.md`.

## Repository map

```
src/
  app/                 Expo Router screens (every file is a route)
    _layout.tsx        fonts, SQLite provider + migrations, theme, stack
    index.tsx          Today: the stream, group pills, capture bar
    map.tsx            map of groups (circles laid out with d3-force)
    group/[id].tsx     one group's thoughts ("loose" = ungrouped, "largest" = test hook)
    thought/[id].tsx   detail: edit in place, audio, group, tags, linked thoughts
    search.tsx         full-text search with kind filters and group matches
    voice.tsx          full-screen voice capture with live transcript
    compose.tsx        the notepad: full-page note editor
    todo.tsx           the to-do list: open items, then done
    settings.tsx       appearance, voice, linking by meaning, calendar, backup, data
    handle-share.tsx   sheet shown when another app shares to Engram
    samples.tsx        engram://samples loads demo data (used by the smoke test)
    +native-intent.ts  routes incoming share intents to /handle-share
  components/          CaptureBar (text, mic, attach, clipboard prompt), Entry, TodoRow,
                       ActionSheet (bottom-sheet menu), ui.tsx primitives
  db/                  schema.ts (migrations), migrate.ts, repo.ts (all SQL), types.ts
  lib/                 brain.ts (shared data loader + groups), groups.ts, linker.ts,
                       capture.ts (save + link pipeline, file import), semantic.ts (language model),
                       smart.ts (switching meaning on and off), reminders.ts, calendar.ts,
                       open.ts, useVoice.ts, backup.ts, samples.ts, bus.ts, text.ts
  theme.tsx            light and black palettes, type scale, ThemeProvider, useTheme()
assets/brand/          SVG sources for the mark and wordmark; PNGs in assets/images are rendered from them
scripts/check.ts       Node-only logic tests (migrations, FTS, linker, groups, dates)
scripts/smoke.sh       emulator walkthrough run by CI, in both themes
.github/workflows/android.yml   CI: checks, APK builds, emulator test, releases
docs/                  spec, design (with mocks), status, decisions, research, screenshots
```

## Commands

```bash
npm ci                     # install (use npm; there is a package-lock.json)
npm run typecheck          # tsc --noEmit
npm run lint               # expo lint (ESLint flat config, eslint-config-expo)
npm run check              # Node tests: migrations, FTS, cascades, linker
npx expo run:android       # dev build on a device or emulator (Expo Go will NOT work)
npx expo export --platform android   # bundles JS; a quick "does it compile for Android" check
npx expo install <pkg>     # ALWAYS use this to add packages; it picks SDK-compatible versions
```

Run `typecheck`, `lint` and `check` before every commit. CI runs them too and will fail the build.

### Sandboxed or offline environments

If `npx expo install` fails with a network or proxy error (it calls the Expo API and React Native Directory), run it as `EXPO_OFFLINE=1 npx expo install <pkg>`. It then uses the version map bundled in `node_modules/expo/bundledNativeModules.json`.

You do not need the Android SDK locally. CI builds the APK.

## Rules

- **Never create or edit `android/` or `ios/`.** They are generated by `expo prebuild` and gitignored. Change native behaviour through `app.json` and config plugins.
- **Never edit a shipped migration** in `src/db/schema.ts`. Append a new entry to `MIGRATIONS`. The array index + 1 is the `PRAGMA user_version`.
- **All SQL lives in `src/db/repo.ts`.** Screens call repo functions; they do not write SQL.
- **Every write must call `dataChanged()`** from `src/lib/bus.ts` (directly or via `capture()` / `removeThought()`), or screens will not refresh. Pass the new id to animate it into the graph.
- **Capture is save-first.** Insert the row, then link. Never make capture wait on anything slower than one insert.
- **Links are undirected** and stored with `a_id < b_id` (a CHECK constraint enforces it). Use `repo.upsertLink`, which orders ids and never downgrades a manual link to an automatic one.
- **Nothing leaves the device.** No analytics, no network calls for user data, no cloud speech. Voice uses `requiresOnDeviceRecognition: true`. The one download the app ever makes is the language model, and only after the person turns on "Understand meaning". `react-native-executorch` reports downloads to its maker by default; `semantic.ts` switches that off and it must stay off.
- **Menus with more than three choices use `ActionSheet`.** Android's `Alert.alert` silently drops buttons beyond three. Use alerts only for confirmations.
- **`react-native-executorch` is loaded with a lazy `require`** inside `semantic.ts`, never a top-level import, so a fault in its native library cannot stop the app from starting. Its native libraries are fetched by its postinstall script, limited to text embeddings by the `react-native-executorch.features` key in `package.json`.
- **Changing the `thoughts` table means rebuilding it** (see migration 2). `migrate.ts` turns foreign keys off around migrations so the rebuild does not cascade deletes. Add a case to the upgrade test in `scripts/check.ts`.
- **Follow `docs/DESIGN.md`** for UI. Never hard-code a colour: take every one from `useTheme().c` so both the light and the black theme work. Newsreader for the person's words and titles, Inter for the app's own text, sentence case, 48 pt minimum targets, no decorative animation.
- **Screens read through `useBrain(db)`** (`src/lib/brain.ts`), which loads thoughts and links once per data change and computes groups. Do not query thoughts and recompute groups per screen.
- **Groups are derived, not stored.** `computeGroups` runs label propagation over the links and names each group from its shared words. A group's id is its smallest member id and can change when links change; screens must cope with a group id that no longer exists.
- **Do not read the clipboard without a tap.** `Clipboard.hasStringAsync()` is fine at any time; `getStringAsync()` triggers Android's "pasted from clipboard" notice and iOS's paste prompt, so call it only in response to the person tapping the prompt.
- **Copy is plain and specific.** Buttons name the action ("Export a backup"); errors say what happened and what to do. Users see "thought", "link" and "group", never "node", "edge", "cluster" or "embedding".
- **Expo APIs change every SDK.** Before using an Expo or React Native API, read the installed type definitions in `node_modules/<pkg>/build/*.d.ts` or the versioned docs at `https://docs.expo.dev/versions/v58.0.0/`. Do not rely on memory.

## API gotchas in this codebase

These caught the first build out. The installed versions behave this way:

- **Shared values (Reanimated):** write with `sv.set(value)`, not `sv.value = value`. The lint rule `react-hooks/immutability` rejects direct assignment.
- **`react-hooks/purity`** rejects impure calls such as `Date.now()` during render. Use `useState(() => Date.now())`.
- **React Native styles do not accept `oklch()`**. The group colours in `src/theme.tsx` are hex values computed from the oklch recipe in `docs/DESIGN.md`.
- **Typed routes** are generated into `.expo/types` by `expo start` or `expo export`. If `tsc` complains that a new route is not assignable, that folder is stale: delete it or regenerate.
- **`StyleSheet.absoluteFillObject` does not exist** in RN 0.88 types. Use `StyleSheet.absoluteFill` or spell out `position: 'absolute', top: 0, ...`.
- **`expo-file-system`** uses the `File` / `Directory` / `Paths` classes. `new File(contentUri).copy(dest)` imports a shared `content://` file.
- **`expo-sharing`** receives shares on Android via its config plugin (`android.enabled`, MIME type lists) and `useIncomingShare()`. Payloads have `value`, `shareType` and `mimeType`.
- **`expo-sharing`'s `useIncomingShare()` hook goes online**: it resolves every share, and for a shared web address that is an HTTP request to it. Use `getSharedPayloads()` and call `getResolvedSharedPayloadsAsync()` only for file shares, as `handle-share.tsx` does.
- **`new File(uri).copy()` rejects `content://` addresses.** Import with `copyAsync` from `expo-file-system/legacy`.
- **`expo-speech-recognition`** emits `result`, `volumechange`, `audioend` (with the saved WAV URI when `recordingOptions.persist` is true), `error` and `end`. On-device recognition needs Android 13+ and an installed offline speech pack.
- **React Compiler is off.** The template enabled `experiments.reactCompiler`; it was removed during the first build and has not been re-tested since. Its lint rules still run, so code must pass them.

## Testing

- `npm run check` covers the database and linker in Node using `node:sqlite`. Add a case there for any SQL or linker change.
- CI's emulator job (`scripts/smoke.sh`) installs the x86_64 APK on an Android 14 Pixel 6 emulator, loads sample data via `engram://samples`, types a thought, sets a reminder on it, shares a picture and text in, switches on linking by meaning (`engram://settings?smart=on`) and waits for the model, opens the map, a group, search, the note editor and settings, repeats the main screens in the black theme, and fails on any crash. **Tap coordinates assume 1080×2400.** If you move the top bar or dock, update them.
- Screenshots from each pushed branch's latest run are force-pushed to `smoke-shots` (for `main`) or `smoke-shots-<branch>`. CI runs on `main`, `release/**` and `redesign-**` branches and on pull requests; add your branch pattern to the workflow if you need screenshots from it. Look at them after any UI change: `git clone --depth 1 -b smoke-shots https://github.com/pavitra14/engram`.
- Not covered by automation: microphone, speech recognition, the clipboard prompt, the attach pickers, opening files in other apps, the date and time picker, a reminder actually firing, calendar events, real-device performance. Say so when you report work in those areas.

## Releasing

1. Bump `expo.version` and `expo.android.versionCode` in `app.json`.
2. Update `docs/release-notes.md` (it becomes the GitHub release body) and `docs/STATUS.md`.
3. Merge to `main` and wait for CI to pass.
4. Push a branch named `release/vX.Y.Z` from that commit, or a tag `vX.Y.Z` if your environment allows pushing tags (Claude Code cloud sessions cannot). A version with a hyphen, such as `v2.0.0-beta.1`, is published as a pre-release.
5. CI builds, runs the emulator test, and publishes the release with `engram-vX.Y.Z.apk` (arm64) attached.

The APK is signed with the React Native template's debug keystore, which is the same on every build, so new versions install over old ones. Replace it with a real keystore (via a config plugin and CI secrets) before any Play Store submission.

## Conventions

- TypeScript strict. Import from `@/…` (maps to `src/`).
- Functional components and hooks. No state library; SQLite is the source of truth and `useDataVersion()` triggers reloads.
- Name things for what the user sees.
- Commits: imperative subject under 72 characters, a body explaining why when it is not obvious.
- Branches: the owner is the sole maintainer and has asked for work to be pushed straight to `main`. No pull request is needed.
- Releases: every release is a beta until the owner says otherwise. Name them `vX.Y.Z-beta.N`; the hyphen makes CI publish a pre-release.

# Engram — instructions for agents

Engram is a local-first "second brain" for Android, built with Expo and React Native. You capture thoughts by typing, speaking or sharing from any app, and they link themselves into an interactive graph. Everything is stored in a database on the phone and no account is needed. An optional account (Engram Cloud) syncs notes between devices.

This file is the entry point for any coding agent (Claude Code, Codex, Cursor, Copilot and others). Read it fully before changing anything. Humans can read it too.

## Start here

| Read | When |
|---|---|
| [`docs/STATUS.md`](docs/STATUS.md) | Always. What works, what is unverified, and the prioritised backlog. |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Before building anything new. What the owner has committed to, and ideas not yet chosen. |
| [`docs/SPEC.md`](docs/SPEC.md) | Before changing behaviour. The product and technical spec as built. |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Before touching UI. Palette, type, motion, copy rules, logo. |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Before reversing a choice. Why things are the way they are. |
| [`docs/original-plan.md`](docs/original-plan.md) | Background only. The pre-build plan; superseded where SPEC differs. |
| [`docs/research.md`](docs/research.md) | When choosing libraries or revisiting design inspiration. |
| [`docs/CI.md`](docs/CI.md) | Before changing the workflow, or to make builds faster. |
| [`docs/CLOUD.md`](docs/CLOUD.md) | Before touching sync, accounts or anything in `supabase/`. |
| [`docs/PRIVACY.md`](docs/PRIVACY.md), [`docs/TERMS.md`](docs/TERMS.md) | Before changing what the app stores, sends, downloads or asks permission for. Keep them true to the code, and keep the published copies on https://engrm.app in step. |

When you finish a piece of work, update `docs/STATUS.md` (and `DECISIONS.md` if you made a choice someone might later question). These files are the shared memory between agents and sessions; if they are stale, the next agent starts wrong.

## Project facts

- **Owner:** pavitra14 on GitHub. Repo: `pavitra14/engram`. Default branch: `main`.
- **Website:** https://engrm.app. The domain is spelled without the "a" on purpose (engram.app was taken); the product is still called Engram everywhere, so never write "Engrm" as a name. It moved from engram.pavitra.dev on 17 Nov 2026, which now redirects. Contact: contact@engrm.app. (Repo `pavitra14/engram-web`, Next.js on Coolify). It hosts the published Privacy Policy (`/privacy`), Terms (`/terms`) and contact page (`/contact`, contact@engrm.app). Link to the website rather than to `docs/PRIVACY.md` or `docs/TERMS.md` in anything people read, and when you change either doc, make the same change in `engram-web` (`app/privacy/page.tsx`, `app/terms/page.tsx`).
- **Platform:** Android first. iOS is out of scope for now, but avoid Android-only code where a cross-platform option is equally good.
- **Package id:** `dev.pavitra.engram`. App name: Engram. URL scheme: `engram://`.
- **Stack:** Expo SDK 58, React Native 0.88, React 19.3, TypeScript, Expo Router, PowerSync (`@powersync/react-native` on `@op-engineering/op-sqlite`, local-only), `react-native-enriched-html` (the note editor), `react-native-android-widget`, `d3-force` (layout only), Reanimated 4.7, `expo-clipboard`, `expo-speech-recognition`, `expo-notifications`, `expo-calendar`, `expo-image-picker`, `react-native-executorch` (text embeddings only). Skia was removed in v2; nothing draws on a canvas.
- **Versions are 0.x.** The app is `0.8.0` (`versionCode` 8), released as `v0.8.0-beta.3` (a pre-release until the owner promotes it); the last ordinary release is `v0.7.0-beta.2`. Two earlier releases were numbered 1.0.0 and 2.0.0-beta.1 by mistake; the owner asked for them to be removed. Never number a release 1.0 or higher unless the owner says so.

## Repository map

```
src/
  app/                 Expo Router screens (every file is a route)
    _layout.tsx        fonts, database provider, theme, the stack and each screen's transition
    index.tsx          Today, in one of three layouts: list, map above list, or map
    map.tsx            the map screen (drawing is in components/GroupMap.tsx)
    group/[id].tsx     one group's thoughts ("loose" = ungrouped, "largest" = test hook)
    thought/[id].tsx   a note: title and formatted body edited in place, file, to-do, tags, links
    latest.tsx         engram://latest opens the newest thought (test hook)
    tour.tsx           the first-run tour and the usage-counts question; shown once, and from Settings
    review.tsx         the weekly review: the week in numbers, then older notes to decide on
    search.tsx         full-text search with kind filters and group matches
    voice.tsx          full-screen voice capture with live transcript
    compose.tsx        a new note (title + formatted body); also opened by widgets and calendar events
    todo.tsx           the to-do list by due date, quick add, the week's calendar, done
    settings.tsx       appearance, voice, linking by meaning, calendar, backup, data
    handle-share.tsx   sheet shown when another app shares to Engram
    ask.tsx            Ask your notes (behind the `ask` flag)
    recap.tsx          the month in review
    trash.tsx          deleted thoughts, kept 30 days
    tile.tsx           engram://tile, where the Quick Settings tile lands
    surprise.tsx       engram://surprise opens a random older note (widget)
    samples.tsx        engram://samples loads demo data (used by the smoke test)
    +native-intent.ts  routes incoming share intents to /handle-share
  components/          CaptureBar, NoteEditor (+ FormatBar), GroupMap, Entry, TodoRow,
                       ActionSheet (slide-up menu), ThoughtMenu (hold a note in any list),
                       CloudSection (Settings), ui.tsx primitives
  db/                  schema.ts (tables and columns), powersync.ts (opens the database),
                       provider.tsx (useDb), db.ts (the Db interface), repo.ts (all SQL),
                       legacy.ts (the pre-0.3 database and its one-time import), types.ts
  widgets/             home-screen widgets, their task handler and data snapshot
  cloud/               flags.ts (feature flags), and Engram Cloud behind the `cloud` flag: api.ts
                       (Supabase calls with fetch), sync.ts (the sync round), cloud.ts (session, timing)
  lib/                 brain.ts (shared data loader + groups), groups.ts, linker.ts,
                       capture.ts (save + link pipeline, file import), semantic.ts (language model),
                       smart.ts (switching meaning on and off), reminders.ts, calendar.ts,
                       assistants.ts (Chat with Claude / ChatGPT), open.ts, useVoice.ts,
                       translate.ts (English versions, on the phone), habits.ts (daily question,
                       streak, week numbers, note templates), when.ts (dates in plain words), checks.ts (check boxes),
                       recall.ts, projects.ts, markdown.ts, ocr.ts, ask.ts (+ ask.logic.ts), usage.ts (+ usage.logic.ts, anonymous usage counts), focus.ts, briefs.ts, lock.ts, toast.ts, actions.ts, backup.ts, samples.ts, bus.ts, text.ts
  theme.tsx            light and black palettes, type scale, ThemeProvider, useTheme()
assets/brand/          SVG sources for the mark and wordmark; PNGs in assets/images are rendered from them
index.ts               entry point: expo-router plus the widget task handler
modules/engram-ocr/    Engram's own native module: ML Kit's bundled text recognisers (Latin, Devanagari). Autolinked from `modules/`.
plugins/               local config plugins (app visibility queries; Quick Settings tile and icon shortcuts)
supabase/              the cloud's schema (migrations/) and Edge Functions (functions/)
scripts/check.ts       Node-only tests: repo.ts against node:sqlite, old-database import, linker, groups, dates
scripts/smoke.sh       emulator walkthrough run by CI, in both themes
.github/workflows/android.yml   CI: checks, APK builds, emulator test, releases
docs/                  spec, design (with mocks), status, decisions, research, screenshots
```

## Commands

```bash
npm ci                     # install (use npm; there is a package-lock.json)
npm run typecheck          # tsc --noEmit
npm run lint               # expo lint (ESLint flat config, eslint-config-expo)
npm run check              # Node tests: the database layer, search, import, linker
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
- **The database is PowerSync, local-only.** Tables are declared in `src/db/schema.ts` and need no migrations: adding a column is adding a line. They cannot have constraints, foreign keys, cascades, BLOB columns or `ON CONFLICT`, so `repo.ts` enforces the rules by hand (read, then insert or update; delete what hangs off a thought). Every row has a text `id`. Keep the tables in a shape a Postgres/Supabase backend could hold.
- **Derived data is not a PowerSync table.** Meaning vectors and the search index are ordinary SQLite tables created by `repo.prepare()`. They are rebuilt from the thoughts, never synced.
- **Never call the outer `db` inside `db.tx(...)`**; use the `Db` the callback receives. The outer one would wait for the transaction it is inside.
- **`legacy.ts` is frozen.** It describes the pre-0.3 database so old installs can be carried over. Do not edit its SQL.
- **All SQL lives in `src/db/repo.ts`.** Screens call repo functions; they do not write SQL.
- **Every write must call `dataChanged()`** from `src/lib/bus.ts` (directly or via `capture()` / `removeThought()`), or screens will not refresh. Pass the new id to animate it into the graph.
- **A quickly captured line is the note's title**, not its body (`splitQuick` in `capture.logic.ts`). Several lines: the first is the title, the rest the body.
- **Capture is save-first.** Insert the row, then link. Never make capture wait on anything slower than one insert.
- **Links are undirected** and stored with `a_id < b_id` (a CHECK constraint enforces it). Use `repo.upsertLink`, which orders ids and never downgrades a manual link to an automatic one.
- **Nothing of the person's leaves the device unless they sign in to Engram Cloud.** No tracking, no cloud speech. Voice uses `requiresOnDeviceRecognition: true`. Signed out, the app makes four kinds of request, none carrying the person's words: one public read of the feature flags at launch (`src/cloud/flags.ts`), the language model downloads after they turn on "Understand meaning" or download the Ask model, ML Kit's language pack download after they turn on translation, and, only if the person said yes, one anonymous usage-count message a day (`src/lib/usage.ts`, `docs/METRICS.md`). Usage counts never carry an id of any kind, a time of day, an order of actions, device details or anything the person wrote; they are counts of a fixed list, sent per finished day and kept only as totals. A new metric means updating `usage.logic.ts`, a new migration for `usage.metrics`, `docs/METRICS.md` and `docs/PRIVACY.md` (and the website copy) in the same release. Never count anything before the person has said yes. Signed in, `src/cloud/` sends notes, to-dos, tags and hand-made links to the project's Supabase database and nothing else; see `docs/CLOUD.md` for the exact list. Do not add anything to what is sent, a new network request, a download or a permission without updating that page, `docs/PRIVACY.md` and the sign-in text. `react-native-executorch` reports downloads to its maker by default; `semantic.ts` switches that off and it must stay off.
- **Sync is recorded only while signed in.** `repo.setTracking(true)` makes writes note themselves in `outbox`. Anything that changes a synced row must go through a `repo.ts` function that calls `mark()`, or other devices will never hear of it. Applying rows from the cloud goes through `repo.applyRemote`, which records nothing.
- **The cloud is written only through `apply_sync_batch`.** Never grant direct insert, update or delete on the cloud tables. Server changes are new files in `supabase/migrations/`, applied to the project and tested there; never edit a migration that has been applied.
- **Unfinished features sit behind a flag that is off by default.** Flags are rows in the cloud's `feature_flags` table, read by `src/cloud/flags.ts`. A flag that is missing, false, or never fetched is off; the last fetched answer is remembered for when the phone is offline. Engram Cloud is behind `cloud`, which is off: with it off the Settings section is hidden, no session is restored and no change is recorded for sending. To add a flag, add its name to `FLAGS` and a row to the table.
- **Deleting is `removeThought`, which moves to the trash.** Only `deleteForever` and `emptyOldTrash` remove rows. Every list query filters `trashed_at IS NULL`; a new query must too.
- **Columns in `LOCAL_THOUGHT_COLUMNS` stay on the phone** (pins, trash, recall, parked list, focus minutes) and are written without `mark()`. The `projects` table is local too.
- **Short messages use `showToast`** (`src/lib/toast.ts`), with at most one action. Prefer Undo over a confirmation.
- **Text read from pictures is derived data** (`image_text`), like translations. It is read by `modules/engram-ocr` with recognisers bundled in the APK; do not swap in the Play services variants, which download on first use and failed on the emulator in 0.6. `modules/<name>/android` is hand-written native code and is the one exception to "never write Android code".
- **Ask your notes runs on the phone and is behind the `ask` flag.** `ask.ts` gives the model only the few notes search found, and the screen lists them. The model is downloaded on request, like the meaning model, with telemetry off.
- **Translations are derived data**, like meaning vectors: a plain `translations` table, never synced, rebuilt on demand. The original note is never changed.
- **Only the publishable key is in the app.** The service role key exists only inside Edge Functions.
- **Menus with more than three choices use `ActionSheet`.** Android's `Alert.alert` silently drops buttons beyond three. Use alerts only for confirmations.
- **`react-native-executorch` is loaded with a lazy `require`** inside `semantic.ts`, never a top-level import, so a fault in its native library cannot stop the app from starting. Its native libraries are fetched by its postinstall script, limited to text embeddings by the `react-native-executorch.features` key in `package.json`.
- **A note's body is stored twice**: `body` is its plain words (what search, linking and lists read) and `body_html` its formatting, or null when it has none. Always write both through `repo.updateThought` or `capture`.
- **Screens choose their own transition** in `_layout.tsx`: going deeper pushes from the side, glance-and-leave screens fade, things you start and finish rise from the bottom. Sheets slide up. Keep durations at or under 240 ms.
- **Widgets cannot use app components or the theme.** They are drawn by `react-native-android-widget` from `src/widgets/widgets.tsx` and read `widgets.json`, which `refreshWidgets` writes on every data change.
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
- **`expo-file-system`** uses the `File` / `Directory` / `Paths` classes.
- **`expo-sharing`** receives shares on Android via its config plugin (`android.enabled`, MIME type lists). Payloads have `value`, `shareType` and `mimeType`.
- **`expo-sharing`'s `useIncomingShare()` hook goes online**: it resolves every share, and for a shared web address that is an HTTP request to it. Use `getSharedPayloads()` and call `getResolvedSharedPayloadsAsync()` only for file shares, as `handle-share.tsx` does.
- **`new File(uri).copy()` rejects `content://` addresses.** Import with `copyAsync` from `expo-file-system/legacy`.
- **`expo-speech-recognition`** emits `result`, `volumechange`, `audioend` (with the saved WAV URI when `recordingOptions.persist` is true), `error` and `end`. On-device recognition needs Android 13+ and an installed offline speech pack.
- **`expo-image-picker`'s `microphonePermission: false` removes `RECORD_AUDIO` from the whole app**, not only from the picker. That silently broke voice notes in 0.2 to 0.4. Any plugin option set to `false` for a permission another feature needs will do the same; after changing plugins, read the generated manifest (`npx expo prebuild` in a scratch copy).
- **`react-native-executorch`'s `DEFAULT` model variant on Android is the Vulkan (graphics chip) build.** On the emulator it returned the same vector for every sentence. `semantic.ts` names the XNNPACK (processor) build and checks the model on a fixed paraphrase pair after loading.
- **`expo-intent-launcher` ignores `packageName` unless `className` is given**, so it cannot aim a share at one app. `assistants.ts` opens the app's own web link instead.
- **`react-hooks/set-state-in-effect`** rejects calling a state setter straight from an effect body, including through a helper. Set state in the promise callback, or derive it during render.
- **React Compiler is off.** The template enabled `experiments.reactCompiler`; it was removed during the first build and has not been re-tested since. Its lint rules still run, so code must pass them.

## Testing

- `npm run check` runs `repo.ts` itself against `node:sqlite` (plain tables with the same columns), plus the old-database import and the linker. Add a case there for any SQL or linker change. It cannot catch a difference between PowerSync's tables and plain ones; the emulator run does.
- CI's emulator job (`scripts/smoke.sh`) installs the x86_64 APK on an Android 14 Pixel 6 emulator, photographs the first-run tour, loads sample data via `engram://samples`, types a thought, holds a note to open its menu, sets a reminder on it (`engram://latest?menu=todo`), shares a picture and text in, saves a titled note, shows the split and map home layouts (`engram://settings?home=split`), switches on linking by meaning (`engram://settings?smart=on`) and waits for the model, opens the map, a group, search, the note editor and settings, repeats the main screens in the black theme, and fails on any crash. **Tap coordinates assume 1080×2400.** If you move the top bar or dock, update them.
- Screenshots from each pushed branch's latest run are force-pushed to `smoke-shots` (for `main`) or `smoke-shots-<branch>`. CI runs on `main`, `release/**` and `redesign-**` branches and on pull requests; add your branch pattern to the workflow if you need screenshots from it. Look at them after any UI change: `git clone --depth 1 -b smoke-shots https://github.com/pavitra14/engram`.
- Not covered by automation: the microphone and its permission prompt, translation (needs a language pack download), anything signed in to Engram Cloud, home-screen widgets (only that Android registered them), formatting buttons in the note editor, the Chat with Claude/ChatGPT buttons, notification buttons, the speech pack download, microphone, speech recognition, the clipboard prompt, the attach pickers, opening files in other apps, the date and time picker, a reminder actually firing, calendar events, real-device performance. Say so when you report work in those areas.

## Releasing

1. Bump `expo.version` and `expo.android.versionCode` in `app.json`.
2. Update `docs/release-notes.md` (it becomes the GitHub release body) and `docs/STATUS.md`.
3. Merge to `main` and wait for CI to pass.
4. Push a branch named `release/vX.Y.Z-beta.N` (if main already has the commit, the paths filter skips the run; see `docs/CI.md`), or a tag of the same name if your environment allows pushing tags (Claude Code cloud sessions cannot). From 0.7 a beta is published as an ordinary release; `-alpha` and `-rc` names are marked pre-release, and so is any release whose `docs/release-notes.md` starts with the line `<!-- prerelease -->` (the owner promotes it by hand once tested; remove the line for the next release). The phone APK is only built for these refs.
5. CI builds, runs the emulator test, and publishes the release with `engram-vX.Y.Z.apk` (arm64) attached.

Release builds are signed with the owner's keystore when the `ENGRAM_KEYSTORE_BASE64`, `ENGRAM_KEYSTORE_PASSWORD`, `ENGRAM_KEY_ALIAS` and `ENGRAM_KEY_PASSWORD` secrets exist (`plugins/withReleaseSigning.js`); without them the build falls back to the template debug key. The release job also builds an AAB for Google Play. See `docs/PLAY.md`. Never commit a keystore or print a secret.

## Conventions

- TypeScript strict. Import from `@/…` (maps to `src/`).
- Functional components and hooks. No state library; SQLite is the source of truth and `useDataVersion()` triggers reloads.
- Name things for what the user sees.
- Commits: imperative subject under 72 characters, a body explaining why when it is not obvious.
- Branches: the owner is the sole maintainer and has asked for work to be pushed straight to `main`. No pull request is needed.
- Releases: every release is a beta until the owner says otherwise. Name them `v0.Y.Z-beta.N`. Since 0.7 these are ordinary GitHub releases, meant for several testers.
- One push per batch of work. A CI run takes around twenty minutes, so finish and check locally (typecheck, lint, check, `npx expo export --platform android`, and `npx expo prebuild` in a scratch copy for plugin changes) before pushing. Document-only pushes start no run.
- **Skipping CI for a push that needs no build.** Put `[skip ci]` in the subject or body of the last commit being pushed. GitHub reads only the head commit of the push, so the marker must be on that commit. Use it for status and docs commits; `*.md` and `docs/**` changes start no run even without it. Do not add it to a commit that changes code, `package.json`, `app.json`, `modules/`, `plugins/`, `supabase/` or the workflow, because those must be built and tested. Details: `docs/CI.md`, "Skipping a run".
- **Recording status.** When you finish work, update `docs/STATUS.md` (and `docs/DECISIONS.md` for a choice someone might question). Put anything the owner decided or said in chat that is not yet in the repo into one of these files, in the same push. For GitHub issues, post a dated comment with the latest state rather than rewriting the issue body, which is the original plan.
- **Commit attribution.** If your environment gives you an attribution line (for example `Co-Authored-By` or a session link), add it to the commit message; do not invent one.

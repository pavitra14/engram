# Status

_Last updated: 16 Nov 2026, v0.3.0-beta.1 on `main`. Update this file whenever you finish work._

## Where things are

- The app is **0.3.0**. Work is pushed straight to `main`; every release is a `0.x` beta (pre-release) until the owner says otherwise.
- Two earlier releases were numbered `v1.0.0` and `v2.0.0-beta.1`. The owner has asked for them to be removed; that has to be done by hand on GitHub's Releases page (the agent environment cannot delete releases or tags).
- 0.3.0 was written and checked locally as one batch and pushed once. **Everything native in it compiled for the first time in CI**, so read the latest run before trusting any line below marked "new in 0.3".

## What 0.3 changed

1. **Database:** `expo-sqlite` replaced by PowerSync on op-sqlite, local-only (D25). Old installs are carried over once from `engram.db`.
2. **Notes:** every entry has a title and a formatted body, edited with one shared editor (D26). "Long note" is gone.
3. **Home:** three layouts, set in Settings: list, map above list, map (D27).
4. **Map:** thoughts in no group are drawn as small circles of their own.
5. **Motion:** each screen has its own transition; sheets slide up (D28).
6. **To-dos:** due-date sections, quick add, repeats, an important mark, Done and In an hour buttons on the notification, the week's calendar (D29).
7. **Outcomes:** "Make one note of these" and Chat with Claude / ChatGPT on a group; a daily "Worth another look" thought (D30).
8. **Widgets:** Quick thought and To do (D31).
9. **Speech pack:** shows that it is downloading and disappears once installed.
10. **Linking by meaning** uses the processor build of the model and now passes its self-check on the emulator (D23, revised).
11. **CI:** document-only pushes start no run; the phone APK is built only for releases; an optional self-hosted runner (D32, `docs/CI.md`).

## Verified

In Node (`npm run check`), running the app's own `repo.ts`: inserts, search and its index following edits, links stored once and never downgraded from manual, tags, settings, to-dos with repeats and importance, vectors stored as text, deleting a thought removing everything attached, wiping, and the import from both a version 1 and a version 2 old database. Also the linker (words and meaning), grouping, formatted-note helpers, repeat dates and to-do sections.

Locally: typecheck, lint, a full Android JS bundle, and `expo prebuild` generating the widget receivers and the app-visibility queries.

On the emulator before 0.3 (still expected to hold, re-check in the latest run): capture, sharing text and a picture in, a reminder scheduled with Android, search, the map, both themes, the model self-check passing with the processor build.

## Not verified by anyone

- **Everything "new in 0.3" on a device**, until the first CI run's screenshots are read: PowerSync opening and the old-database import, the rich text editor, the home layouts, transitions, widgets, notification buttons.
- **Does a PowerSync table behave like the plain tables the tests use?** The tests cannot tell. Watch for errors mentioning views or triggers.
- **Linking by meaning on real notes.** On the emulator the sample paraphrase pair scored 0.28 against 0.19 for an unrelated pair, which is a narrow margin. The thresholds in `linker.ts` were set from that one run.
- **The Claude and ChatGPT links.** They open `https://claude.ai/new?q=…` and `https://chatgpt.com/?q=…`. Whether each app opens with the draft filled in has not been tried; the draft is also put on the clipboard for that reason.
- Never run by anyone: install on a real phone; voice notes; the clipboard prompt; pickers; opening a saved file; the date and time picker; a reminder arriving; calendar features; backup export and import; large text sizes and screen readers; performance with thousands of thoughts.

## Known issues and limits

- Group names are one word taken from the thoughts, and can be odd. Groups cannot be renamed.
- Files are not read: a PDF or picture links only by its name and any note added to it.
- Formatting is not shown in lists, search results or widgets; they show the plain words.
- A repeating to-do has no end date. Reminders are not rescheduled after a backup is restored on another phone.
- Widgets use fixed colours and refresh when the app changes data, or every 30 minutes.
- The share sheet appears over a dimmed Engram screen, not over the app you shared from.
- Backups exclude files, pictures and recordings.
- Signed with the debug keystore. Fine for sideloading, not for the Play Store.
- The smoke test's tap coordinates are hard-coded for 1080×2400.
- Do not reintroduce `useIncomingShare` from `expo-sharing`: it fetches any shared web address.

## Backlog

Ordered by priority. Each item has a done-when line so any agent can pick it up.

0. **Read the first 0.3 CI run and fix what it shows.** Screenshots are on `smoke-shots`. Then refresh `docs/screenshots/` and the README from them.
   _Done when:_ every screenshot shows the screen it is named for and the log has no `engram:` error lines.
0. **Tune linking by meaning on real notes.** The self-check passes on the emulator with a narrow margin. Collect the similarity spread from the owner's phone (logged as `engram: meaning ready; …`) and adjust `MEANING_*` in `linker.ts`.
   _Done when:_ the car and garage pair in the sample data links on a real phone and unrelated notes do not.
1. **Verify on a real device.** Install v2 on the owner's phone and go through "Not yet verified". Fix what breaks.
   _Done when:_ every item is checked off or has an issue filed.
2. **Semantic linking.** Add an on-device text-embedding model (candidate: `react-native-executorch` with all-MiniLM-L6-v2) behind the `related` / `relateAll` interface in `src/lib/linker.ts`, stored with `sqlite-vec`. Keep word overlap as the fallback until the model has downloaded. Groups and their names improve for free.
   _Done when:_ two paraphrased thoughts link and land in the same group, and the app works fully before the model has downloaded.
3. **Editable groups.** Rename a group, move a thought between groups, pin a group. Needs a `groups` table and a rule for how hand edits and automatic grouping coexist.
4. **Translucent share target.** A native transparent activity (config plugin) so the share sheet appears over the app you shared from, as in the mock.
5. **Faster capture surfaces.** Quick Settings tile, home-screen widget, app-icon shortcuts.
6. **Media in backups.** Export a zip with the database rows and the `media/` folder.
7. **Accessibility pass.** Test at 200% text size and with TalkBack; fix what truncates.
8. **Release signing and size.** Real keystore via CI secrets; enable R8.
9. **iOS.** Share extension, Apple's on-device speech recogniser, a TestFlight build. The design already follows the HIG's target sizes, safe areas and back conventions.

## Open questions for the owner

- Should System dark map to true black (as now) or to a softer grey theme?
- Which languages should voice support beyond English (India, US, UK) and Hindi?
- Personal tool only, or headed for the Play Store and App Store?
- Should images be understood (OCR) or only stored?

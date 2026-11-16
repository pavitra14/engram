# Status

_Last updated: 16 Nov 2026, v0.5.0-beta.1. Update this file whenever you finish work._

## Where things are

- The app is **0.5.0**. Work is pushed straight to `main`; every release is a `0.x` beta until the owner says otherwise.
- **Engram Cloud is switched off** by the `cloud` feature flag (D37). The code and the server side from 0.4 are still there.
- The old `v1.0.0` and `v2.0.0-beta.1` releases still need deleting by hand on GitHub.

## What 0.5 changed

1. Feature flags read from the server, default off; the cloud is behind one (D37).
2. The microphone permission is declared again (D38). **Voice notes were broken from 0.2 to 0.4.**
3. Optional translation into English on the phone (D39).
4. A question a day, a weekly review, note templates (D40).

### Not verified in 0.5

- **The microphone on a real phone.** The fix was confirmed only by reading the generated manifest. No test has ever recorded audio.
- **Translation.** `expo-translate-text` has never run here: language detection, the pack download, the result. Only the storage and search of an English version are tested (in Node).
- That the flag request succeeds from a phone (the emulator screenshot will show whether the cloud section is hidden, which is also what a failed request looks like).
- The templates' check-list markup in the editor.

## What 0.4 changed

1. **Engram Cloud**, optional sync to the project's Supabase database (D33 to D35, `docs/CLOUD.md`). Server schema and functions are applied and tested in the database. **The app side has never run signed in.**
2. A quickly captured line is the note's title (D36).
3. Holding a note in a list opens its menu.
4. The clipboard prompt is a button beside the plus button.
5. A first-run tour.

### Verified in 0.4 on the emulator (run for `release/v0.4.0-beta.1`, screenshots on `smoke-shots-release-v0.4.0-beta.1`)

- A new install opens on the tour; Next moves to the second page
- A typed line is saved as the note's title, with "Write here" in the empty body
- Holding a note opens its menu (Open, Add to my to-do list, Remind me tomorrow, Add to calendar, Copy text, Delete)
- The "Map and list" and "Map" home layouts (unverified in 0.3, now seen)
- Settings shows Help and the Engram Cloud sign-in form, so the build picked up the cloud address from the repository secrets
- No crash, no `engram:` error lines

### Not verified in 0.4

- The clipboard button: the emulator's clipboard was empty, so it never appeared.

- Everything in Engram Cloud beyond the database tests and the two-simulated-phones test: the HTTP calls, sign-up and its email, sign-in, session refresh, sync from a device, account deletion.
- The `delete-account` Edge Function has been deployed and never called.
- Supabase's security advisors report nothing wrong with the new tables. They note, as expected, that `apply_sync_batch` and `delete_my_data` run with definer rights for signed-in users, and that `sync_receipts` has no policy (nobody should read it). They also flag `public.rls_auto_enable()`, a function that was already in the project and is callable without signing in; the owner should decide whether it is needed.

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

On the Android 14 emulator, from the 0.3.0-beta.1 run's screenshots and log:

- The PowerSync database opens on a fresh install; sample thoughts load, link and group
- Typing a thought; the thought screen with its Title field and body editor
- The to-do menu sliding up; "in a week" putting the thought on the list with its time, and Android holding the alarm
- The to-do screen with its add line, a "Later" section and the important star
- "Worth another look" on Today
- Sharing a picture and text in
- Search finding a thought through the new index
- Linking by meaning: the model passes its self-check (pair 0.277, unrelated 0.194), and the garage note links to the car note with the reason "Similar meaning", with no words in common
- The map with eight groups and two ungrouped thoughts drawn as their own small circles
- A group screen with "Make one note of these"
- A titled note typed in the new editor and saved
- Settings with the Home screen control and the speech pack row
- Android registered both widgets (`dumpsys appwidget` lists `widget.QuickThought` and `widget.Todo`)
- The black theme
- No crash and no `engram:` error line in the log

## Not verified by anyone

- **The old-database import on a phone.** The emulator starts empty, so only the Node tests cover it.
- **Formatting buttons, drawn widgets, notification buttons, how the transitions feel.** The walkthrough types and takes still pictures; it does not press these.
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

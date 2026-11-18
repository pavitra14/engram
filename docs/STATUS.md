# Status

_Last updated: 18 Nov 2026, after `v0.8.0-beta.3` (pre-release). Update this file whenever you finish work._

> **18 Nov 2026:** the `metrics` flag is switched **on** in Supabase at the owner's request. Phones whose owner said yes to usage counts now send one anonymous daily total through `record_usage`. Turn it off in `public.feature_flags` to stop all sending.

## Where things are

- The app is **0.8.0** (`versionCode` 8), released as `v0.8.0-beta.3`, a **pre-release** the owner will promote by hand once tested (the owner chose the beta.3 number). The last ordinary release is `v0.7.0-beta.2`; the website shows the latest ordinary release, so it keeps showing 0.7 until 0.8 is promoted. Work is pushed straight to `main`; every release is a `0.x` beta until the owner says otherwise.
- **Engram Cloud is switched off** by the `cloud` feature flag (D37). The code and the server side from 0.4 are still there. Status against issue #2 is in `CLOUD.md`.
- **Ask your notes is switched off** by the `ask` flag. Its model is not yet in `package.json` (see "Before turning Ask on" below).
- The old `v1.0.0`, `v2.0.0-beta.1` releases and the `redesign-diag` branch still need deleting by hand on GitHub. Branch deletion commands are in the owner's hands; the agent cannot delete them from a cloud session.
- **Website** live at https://engrm.app (17 Nov 2026; repo `pavitra14/engram-web`): landing page, Privacy Policy, Terms and contact (contact@engrm.app). README, LICENSE and the docs now link there.
- **Privacy Policy and Terms** are in `docs/PRIVACY.md` and `docs/TERMS.md` (17 Nov 2026) and published at https://engrm.app/privacy and /terms, which a Play Store listing can use. Written from the code, not reviewed by a lawyer. `LICENSE` is all rights reserved (D51). They give no governing law; that is the owner's to add before any Play Store listing. The app itself does not yet link to them from Settings.
- The owner's next test is on a Samsung S24 Ultra (see "Owner test list for 0.7" below).

### Before turning Ask on

- `react-native-executorch` needs the `llm` feature to fetch the chat model's native libraries. `package.json` lists only `textEmbeddings`. Add `llm` to `react-native-executorch.features` in the same commit as the flag change, then check the generated manifest and run a full CI build, since this changes native packaging. Not done yet on purpose: adding it now would start a build with no visible effect.
- Turn the flag on only after the owner decides: `update public.feature_flags set enabled = true where key = 'ask';`. It applies to every install, not only the owner's phone.

### Owner test list for 0.7 (S24 Ultra, not yet reported)

- A photo with Hindi text: does it read and show under the picture?
- Backup, then restore on a fresh install: do photos and recordings come back?
- Translation in a non-English language. If it fails, the message shown on the phone is the first thing to report.
- Quick Settings tile, icon shortcuts, app lock, focus timer, morning and evening notifications.
- Anything that crashes shows the crash screen; note what it says.

## What 0.8 adds: anonymous usage counts (18 Nov 2026)

Opt-in usage counts, designed with the owner in chat (D53, `docs/METRICS.md`). The tour's last page asks; people updating or who skipped the tour get a one-time sheet on Today; Settings, Privacy has the switch and "What's sent". The phone tallies per local date and sends one message per finished day to `public.record_usage`; the server keeps only totals in the unexposed `usage` schema. Kill switch: the `metrics` flag, **off** until the owner has tested. Widget, tile and shortcut links now carry `?from=`. Privacy Policy, README, AGENTS and the website changed in the same push: "no analytics" is gone; the phrases are "no tracking" and "your notes stay on your phone".

- **Verified:** migration `0004_usage_counts` applied to the project and tested in SQL as `anon` (adding up, the 500 cap, unknown ids dropped, one range per bucket set, old and future days and bad versions refused, `anon` cannot read the schema). `npm run check` covers the local table and the message logic.
- **Released:** `v0.8.0-beta.3` published as a pre-release by run 44176097163 (build, emulator test and release all passed); main run 44172213565 passed too. Screenshot `01c-tour-usage-question` on `smoke-shots` shows the question page. Signed with the template debug key (no keystore secrets yet), so it installs over 0.7. The website (engram-web `8a29c2c`) carries the matching Privacy Policy and no longer hard-codes a release number.
- **Not verified:** a real phone sending (debug builds never send and the emulator test answers no). The owner turns the flag on after testing: `update public.feature_flags set enabled = true, updated_at = now() where key = 'metrics';`, then checks `select * from usage.daily order by day desc;` the day after. The dashboard login needs a password set by the owner (METRICS.md).

### Owner test list for 0.8
- Fresh install: the tour ends with the question; both buttons work.
- Over 0.7: the sheet appears once on Today and not again.
- Settings, Privacy: switch on and off; What's sent.
- With the flag on and counts on: the previous day's row appears in `usage.daily`.

## Preparing for Google Play (17 Nov 2026)

F-Droid is dropped (D52). In the repo: release-signing plugin, AAB in the release job, target SDK 36, About links in Settings, `SYSTEM_ALERT_WINDOW` blocked. **Not yet done, owner's:** make the keystore and add the four secrets, create the Play Console account and app, run the 14-day closed test, add governing law to the policy and terms. Full list: `docs/PLAY.md`. None of this has been through a CI run yet; the first run will also print the merged permissions and the Firebase count, which need reading.

## What 0.7 changed (released as `v0.7.0-beta.2`, the first ordinary release)

- **Package id is `dev.pavitra.engram`** (D47). Installs beside older builds; people move by backup and restore.
- **Text in pictures** moved to `modules/engram-ocr` with bundled Latin and Devanagari recognisers (D48). `expo-text-extractor` removed.
- **Backups carry media**: `exportFullBackup` writes a zip; `importBackup` reads that or an old JSON.
- **Crash screen** (`CrashScreen`, exported as `ErrorBoundary` from `_layout.tsx`).
- **Ask your notes** (`ask.ts`, `/ask`) behind the `ask` flag, which is off in the cloud table. Never run on any device.
- CI publishes betas as ordinary releases.

### Verified in 0.7 on the emulator (run 43998727605 for `release/v0.7.0-beta.2`, screenshots on `smoke-shots-release-v0.7.0-beta.2`)
- The APK builds under `dev.pavitra.engram` with `modules/engram-ocr`; the tile service is registered under the new id. Published as an ordinary release, 99 MB (86 MB in 0.6).
- **Text in pictures works:** the shared screenshot was read (270 characters) and its words are shown under the picture (`11b-image-text`). Latin only was exercised.
- No crash through the walkthrough, both themes.

### Not verified in 0.7
Devanagari text in a picture; backup zip export and restore with media; the crash screen (nothing crashed); Ask your notes (flag off, never run); everything listed as unverified for 0.6. Known small thing: a new picture is read twice on first save (once by capture, once by the catch-up pass at launch); harmless, worth tidying.

## What 0.6 changed

One commit, built from `docs/ROADMAP.md` (all 19 committed items and most of the proposed list). Verification is filled in below once the release run has finished.

- **Fixed:** translation stopped at the first failing note and always reported a language-pack download failure. `translateAll` now tries each note on its own, `looksEnglish` keeps English notes away from ML Kit (English to English still triggered a pack download), and `runSummary` reports the error the phone gave.
- **Capture:** reminders from plain words (`lib/when.ts`), Quick Settings tile and app shortcuts (`plugins/withQuickCapture.js`), shake to record (in-app only), sticky quick-note notification, "Add to another note" on the share sheet, scan paper, text read from pictures (`lib/ocr.ts`, `image_text` table), voice notes over a minute set out in paragraphs.
- **Linking:** pins, `[[Title]]` links, `@people` as tags, saved searches, link suggestions (`nearMisses`, `dismissed_links`), near-duplicate warning, group rename/merge/goal/date (`projects` table, `lib/projects.ts`).
- **Recall:** Remember this, decisions, on this day, surprise me, month in review (`/recap`), map time-lapse (`/map?play=1`), milestones, a third widget.
- **Doing:** check boxes roll up to To do (`lib/checks.ts`), focus timer (`lib/focus.ts`), Waiting and Someday, habits, morning brief and evening wrap-up (`lib/briefs.ts`).
- **Yours:** trash with undo (30 days), app lock (`LockGate`), accent colour, weekly backup, Markdown export, import from Markdown, text and Keep.

### Verified in 0.6 on the emulator (run 43987356275 for `release/v0.6.0-beta.1`, screenshots on `smoke-shots-release-v0.6.0-beta.1`)
- The APK builds with the Kotlin tile service, shortcuts, `expo-sensors`, `expo-local-authentication` and `expo-text-extractor`. Android lists `QuickTileService` and the three icon shortcuts.
- "Call the bank tomorrow 9am" typed in the capture bar became a to-do for tomorrow 9:00 with the Undo message (`24-plain-reminder`).
- To do shows unticked check boxes from the sample note under "In your notes", and the habits section (`25-todo-boxes`).
- Today shows "Surprise me" and a "These two seem related" card (`02-home`). Month in review, empty trash and the new Settings sections draw correctly.
- No crash through the whole walkthrough, both themes.

### Seen to fail or not exercised on the emulator
- **Text in pictures:** ML Kit's recogniser failed there (`picture not read 'err'`, its own failure listener; the file was found). The emulator probably lacks the Play services module. Unknown on a real phone. The app carried on; the picture was saved without words.
- **Playing the map:** the sample data spans one week, which is a single step, so the play button is hidden and nothing played. Needs two weeks of notes to see.

### Not built
Wear OS tile; on-phone language model features; place reminders; password-protected backups; share a note as an image; media in backups. Back-tap is a system gesture an app cannot claim.

### Not verified in 0.6 (no automation can reach them)
Translation on a real phone, the tile, shortcuts, shake, the sticky notification, scan, OCR on a phone without the ML Kit module, app lock, focus timer firing, briefs firing, weekly backup, Markdown export, note import, the Memory widget drawn.

## What 0.5 changed

1. Feature flags read from the server, default off; the cloud is behind one (D37).
2. The microphone permission is declared again (D38). **Voice notes were broken from 0.2 to 0.4.**
3. Optional translation into English on the phone (D39).
4. A question a day, a weekly review, note templates (D40).

### Verified in 0.5 on the emulator (run for `release/v0.5.0-beta.1`, screenshots on `smoke-shots-release-v0.5.0-beta.1`)

- Today shows the day's question with Answer and Not today, and the "This week" line
- The weekly review: four numbers, a bar per day, "Most on your mind", and the empty state for older notes
- Holding a note in a group opens its menu
- Settings shows Today (a question a day) and Translation, and no Engram Cloud section, as expected with the flag off
- No crash, no `engram:` error lines
- The phone APK is now 90 MB, up from 72 MB: ML Kit's translation library.

### Not verified in 0.5

- The template chips on a new note (the walkthrough types a title first, which hides them).

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
- Backups carry pictures, recordings and files as of 0.7 (the zip). A backup made by 0.6 or earlier has only words, tags and links, so media from the old install does not come across.
- Signed with the debug keystore. Fine for sideloading, not for the Play Store.
- The smoke test's tap coordinates are hard-coded for 1080×2400.
- Do not reintroduce `useIncomingShare` from `expo-sharing`: it fetches any shared web address.

## Backlog

New features are in [`ROADMAP.md`](ROADMAP.md). This list is for fixing and checking what exists. Each item has a done-when line.

0. **Check 0.5 on the owner's phone.** Microphone prompt and recording, translation, the clipboard button, the weekly review, templates.
   _Done when:_ each is confirmed or has an issue filed.
1. **Tune linking by meaning on real notes.** The self-check passes on the emulator with a narrow margin. Collect the similarity spread from the owner's phone (logged as `engram: meaning ready; …`) and adjust `MEANING_*` in `linker.ts`.
   _Done when:_ the car and garage pair in the sample data links on a real phone and unrelated notes do not.
2. **Try Engram Cloud end to end**, then switch its flag on. See `CLOUD.md`, "Things only the owner can do".
   _Done when:_ sign-up, confirmation, sign-in, sync between two devices and account deletion each work once.
3. **Translucent share target.** A native transparent activity (config plugin) so the share sheet appears over the app you shared from.
4. ~~**Backups include files and recordings.**~~ Done in 0.7 (`exportFullBackup`). Still to check on a phone: a restore on a fresh install brings the media back.
5. **A real signing key** before any Play Store submission.

## Open questions for the owner

- Should System dark map to true black (as now) or to a softer grey theme?
- Which languages should voice support beyond English (India, US, UK) and Hindi?
- Personal tool only, or headed for the Play Store and App Store?
- Should images be understood (OCR) or only stored?

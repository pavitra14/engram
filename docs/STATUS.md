# Status

_Last updated: 16 Nov 2026, v2.0.0-beta.1 on `main`. Update this file whenever you finish work._

## Where things are

- **v1.0.0** (15 Nov 2026) is the original dark graph design: <https://github.com/pavitra14/engram/releases/tag/v1.0.0>.
- **v2.0.0-beta.1** is the redesign plus files, to-dos and reminders, calendar, and experimental linking by meaning. Work is pushed straight to `main`; every release is a beta (pre-release) until the owner says otherwise.

## What works

Verified by the CI emulator run on Android 14 (screenshots on the `smoke-shots` branch):

- Launch, empty state, loading sample thoughts, upgrade-safe database migration 2
- Today: stream by day, group pills, a To do section, four header buttons, the attach (+) button
- Typing a thought saves it, links it and places it in a group
- Thought screen: To do pill and its menu; "Remind me: in a week" puts the thought on the list, shows the time, and schedules an alarm with Android (seen in `dumpsys alarm`)
- To do screen: open items with their reminder time
- Map, group screen, search (with a `q` parameter), note editor, settings
- Sharing text in from another app
- The model self-check: a model that cannot tell a paraphrase from an unrelated sentence is refused and Settings says so
- Light and true-black themes following the phone
- No crashes in the log across the run

Verified in Node (`npm run check`): migrations including the v1 to v2 upgrade (thoughts, links, tags and search survive), full-text search, cascades, the linker, meaning-based linking with made-up vectors (three topics stay three groups even when every pair looks similar), grouping, reminder labels, file sizes.

## Not working or not verified

- **Linking by meaning has never produced good links.** On the x86_64 emulator, `react-native-executorch` 0.11 with `DISTILUSE_BASE_MULTILINGUAL_CASED_V2.DEFAULT` returns nearly the same vector for every sentence (self-check: pair 0.937, unrelated 0.936; on a second load all 1.0). The app detects this and stays on word linking. Unknown: whether a real arm64 phone behaves the same, and whether another model variant works. A `redesign-diag` branch tries the variants on the emulator; see its `smoke-shots-redesign-diag` log.
- **Sharing a picture in** failed in the emulator test until run of 16 Nov; the test's share did not carry read access the way a real app's does. Check the latest `10-share-image` screenshot before trusting it.
- Never run by anyone: install on a real phone; voice notes; the clipboard prompt; the photo, video and file pickers; opening a saved video or document in another app; the date and time picker; a reminder notification arriving and being tapped; "Add to calendar"; today's events on Today; backup export and import; large text sizes and screen readers; performance with thousands of thoughts.

## Known issues and limits

- Group names are one word taken from the thoughts, and can be odd. Groups cannot be renamed.
- Files are not read: a PDF or picture links only by its name and any note added to it.
- No repeating reminders. Reminders are not rescheduled after a backup is restored on another phone.
- The share sheet appears over a dimmed Engram screen, not over the app you shared from.
- Backups exclude files, pictures and recordings.
- Signed with the debug keystore. Fine for sideloading, not for the Play Store.
- The smoke test's tap coordinates are hard-coded for 1080×2400.
- Until 16 Nov the share screen used `useIncomingShare`, which fetches any shared web address to "resolve" it. That broke the nothing-leaves-the-device rule (v1.0.0 has it). `handle-share.tsx` now reads shares directly; do not reintroduce the hook.

## Backlog

Ordered by priority. Each item has a done-when line so any agent can pick it up.

0. **Make linking by meaning work, or remove it.** Find out from the `redesign-diag` run and the owner's phone whether any model variant passes the self-check. If one does, switch `semantic.ts` to it and tune `MEANING_*` in `linker.ts` on real notes. If none does, try another runtime or drop the dependency (it adds native libraries to the APK).
   _Done when:_ the paraphrase pair in the sample data links on a real phone, or the feature and dependency are gone.
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

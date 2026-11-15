# Status

_Last updated: 16 Nov 2026, v2 redesign on the `redesign-v2` branch. Update this file whenever you finish work._

## Where things are

- **v1.0.0** (released 15 Nov 2026) is the original dark graph design: <https://github.com/pavitra14/engram/releases/tag/v1.0.0>.
- **v2.0.0** is the redesign: light and true-black themes, a readable stream as home, a map of named groups, a notepad editor, a clipboard prompt, and a new icon. It lives on `redesign-v2` and is not released yet.

## What works in v2

Verified by the CI emulator run on Android 14 (screenshots on the `smoke-shots-redesign-v2` branch):

- See the pull request for the list confirmed by the latest run.

Verified in Node (`npm run check`): migrations, full-text search, cascade deletes, the linker, link explanations, grouping and group naming (including that results do not depend on input order), day labels and search highlighting.

## Not yet verified

Nobody has run these; treat them as untested, not broken:

- **Install on a real phone** (only the emulator has run it)
- **Voice notes**: microphone permission, live transcription, the audio-only fallback, playback
- **The clipboard prompt** (the emulator's clipboard was empty during the test)
- **Sharing images and audio** (only text was tested)
- **Backup export and import** round trip
- **Large text sizes** (200% scaling) and screen readers
- **Performance** with thousands of thoughts: groups are recomputed on every change

## Known issues and limits

- Linking and grouping compare words, not meaning. Paraphrases do not link.
- Group names are one word taken from the thoughts, and can be odd. Groups cannot be renamed or edited by hand.
- A group's identity can change when links change, so an open group screen may say the group has changed.
- The share sheet appears over a dimmed Engram screen, not over the app you shared from.
- The voice screen has no pause.
- The clipboard prompt cannot preview the content (by design, see `DECISIONS.md` D17).
- Backups exclude recordings and images.
- Signed with the debug keystore. Fine for sideloading, not for the Play Store.
- The smoke test's tap coordinates are hard-coded for 1080×2400.

## Backlog

Ordered by priority. Each item has a done-when line so any agent can pick it up.

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

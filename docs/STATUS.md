# Status

_Last updated: 15 Nov 2026, after v1.0.0. Update this file whenever you finish work._

## Current release

**v1.0.0**, published 15 Nov 2026: <https://github.com/pavitra14/engram/releases/tag/v1.0.0> (APK `engram-v1.0.0.apk`, arm64, about 50 MB).

`main` is ahead of the release by: clearing the selected thought when search opens, and these agent docs.

## What works

Verified by the CI emulator test on Android 14 (Pixel 6 profile), with screenshots in [`screenshots/`](screenshots/):

- App launches, fonts load, empty state shows
- Sample data loads; the graph lays out, glows and pulses
- Tapping a thought selects it, dims the rest and shows the card
- Search from the graph dims non-matches and shows a count
- Typing a thought in the dock saves it, links it and animates it in
- List screen with search and filters; thought detail with tags and connections
- Settings screen renders
- Sharing text from another app saves it and returns
- No crashes in the log across the run

Verified in Node (`npm run check`): migrations, full-text search including prefix and edits, cascade deletes, undirected link constraint, text helpers, linker grouping.

## Not yet verified

Nobody has run these; treat them as untested, not broken:

- **Install on a real phone** (only the emulator has run it)
- **Voice notes**: microphone permission, live transcription, the audio-only fallback, playback
- **Speech pack download** button in Settings
- **Multi-finger gestures**: pinch zoom and dragging a node (single taps are tested)
- **Sharing images and audio** (only text was tested)
- **Backup export and import** round trip
- **Performance** with hundreds of thoughts on a mid-range phone

## Known issues and limits

- Auto-linking compares words, not meaning. Paraphrases do not link.
- Only the newest 400 thoughts are drawn in the graph.
- Backups exclude recordings and images.
- The launcher icon looked slightly washed out on the emulator's home screen; check on a real device.
- Signed with the debug keystore. Fine for sideloading, not for the Play Store.
- The smoke test's tap coordinates are hard-coded for 1080×2400.

## Backlog

Ordered by priority. Each item has a done-when line so any agent can pick it up.

1. **Verify on a real device.** Install the release on the owner's phone and go through the "Not yet verified" list. Fix what breaks.
   _Done when:_ every item above is checked off or has an issue filed.
2. **Semantic linking.** Add an on-device text-embedding model (candidate: `react-native-executorch` with all-MiniLM-L6-v2, 384-d, about 90 MB) behind the existing `related` / `relateAll` interface in `src/lib/linker.ts`. Store vectors with `sqlite-vec` (`expo-sqlite` plugin option `withSQLiteVecExtension`). Download the model on first use with progress; keep TF-IDF as the fallback until it is ready. Note the model is English-only; the owner may want Hindi (see open questions).
   _Done when:_ two paraphrased thoughts link, linking a new thought takes under 300 ms on a mid-range phone, and the app works fully before the model has downloaded.
3. **Faster capture surfaces.** Quick Settings tile and a home-screen widget that open straight into voice or text capture. Both need a config plugin with native Kotlin; also consider app-icon shortcuts (`expo-quick-actions` or similar).
   _Done when:_ a voice note can be started from the notification shade in one tap.
4. **Graph at scale.** Replace the 400-node cap with clustering (super-nodes that expand on zoom) and move the simulation off the JS thread if it janks.
   _Done when:_ 2,000 thoughts render and pan at 60 fps on a mid-range phone.
5. **Labels in the graph.** Show short titles for selected and nearby nodes when zoomed in; name clusters.
6. **Media in backups.** Export a zip with the database rows and the `media/` folder.
7. **Release signing.** Real keystore via CI secrets and a config plugin; enable R8 shrinking to cut APK size.
8. **iOS.** Share extension, speech path (Apple's on-device recogniser), and a TestFlight build.

## Open questions for the owner

- Which languages should voice and linking support? Settings currently offers English (India, US, UK) and Hindi for voice; linking is language-agnostic word overlap today.
- Personal tool only, or headed for the Play Store? This decides when signing and a privacy policy matter.
- Should images be understood (OCR, image embeddings) or only stored?
- Encryption at rest (SQLCipher)?

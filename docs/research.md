# Research notes

Findings gathered on 15 Nov 2026 while planning and building v1. Versions and facts were current then; re-check before relying on them.

## Design inspiration

The brief was "modern, minimal and futuristic", drawing on the most awarded apps for UI. The reference set:

- **Apple Design Awards 2026** (announced 2 June 2026, six categories, one app and one game each).
  - *Interaction*: **Moonlitt: Moon Phase Tracker** — a single fluid scene explored directly by touch.
  - *Visuals and Graphics*: **Tide Guide: Charts & Tables** — dense data made legible through a tight, consistent visual theme.
  - Other app winners: grug (Delight and Fun), Guitar Wiz (Inclusivity), NBA (Innovation), Primary: News in Depth (Social Impact).
  - Source: [Apple Newsroom](https://www.apple.com/newsroom/2026/06/apple-reveals-winners-of-the-2026-apple-design-awards/), [MacStories](https://www.macstories.net/?p=197364)
- **Google Play Best of 2025**: Focus Friend (Best App), Goodnotes (Best for Large Screens). Commentary on Play's 2026 productivity picks highlighted calm, adaptive interfaces that surface only what matters.
  - Source: [TechRadar](https://www.techradar.com/phones/these-are-the-10-best-android-apps-of-the-year-according-to-google), [Google blog](https://blog.google/products-and-platforms/platforms/google-play/best-apps-games-2025/)

How each influenced Engram is in [`DESIGN.md`](DESIGN.md#what-we-took-from-award-winning-apps).

## Libraries

| Need | Option | Notes | Used? |
|---|---|---|---|
| Expo SDK | SDK 58 (15 Oct 2026), RN 0.88 | [Upgrade guide](https://expo.dev/blog/how-to-upgrade-to-sdk-58.md) | Yes |
| Share target | `expo-sharing` receive support | Config plugin adds Android intent filters and an iOS share extension; `useIncomingShare()`. [Docs](https://docs.expo.dev/versions/v58.0.0/sdk/sharing.md) | Yes |
| Share target | `expo-share-intent` | Mature third-party alternative (v8). | Fallback only |
| SQLite | `expo-sqlite` | FTS5 on by default; `withSQLiteVecExtension` bundles sqlite-vec, loaded via `bundledExtensions['sqlite-vec']` and `loadExtensionAsync`. [Docs](https://docs.expo.dev/versions/v58.0.0/sdk/sqlite.md) | Yes (FTS5) |
| SQLite | `op-sqlite` | Faster JSI SQLite with FTS5, sqlite-vec, SQLCipher, libSQL. | Not needed yet |
| Speech-to-text | `expo-speech-recognition` 58.0.1 | Wraps Android `SpeechRecognizer`; on-device mode, persisted audio, volume events, offline model download trigger. | Yes |
| Speech-to-text | `react-native-executorch` 0.11 | Whisper via ExecuTorch, also text embeddings. Peer deps: worklets, blob-util, background-downloader. [Docs](https://docs.swmansion.com/react-native-executorch/docs/extensions/text-embeddings) | Planned for embeddings |
| Speech-to-text | `whisper.rn` 0.7 | whisper.cpp bindings; models 75 MB to 2.9 GB; needs a dev build. | No |
| Embeddings | all-MiniLM-L6-v2 via ExecuTorch | 384-d, about 91 MB, English only, tens of ms per sentence on recent phones. | Backlog |
| Graph drawing | `@shopify/react-native-skia` 2.14 + `d3-force` | No maintained RN force-graph library found; web libraries (react-force-graph, d3-graph-react) are DOM/canvas only. | Yes |
| Audio | `expo-audio` | `useAudioRecorder`, `RecordingPresets`, `useAudioPlayer`. | Yes |

## Original plan

The pre-build plan, with milestones M0 to M5 and open questions, is kept as [`original-plan.md`](original-plan.md). Where it disagrees with [`SPEC.md`](SPEC.md), the spec wins; [`DECISIONS.md`](DECISIONS.md) explains each change.

# Engram

A second brain that lives entirely on your phone. Capture a thought by typing, speaking or sharing from any app, and watch it link itself into a living graph. No account, no server.

<img src="assets/images/icon.png" width="96" alt="Engram icon">

## What it does

- **Graph home screen.** Every thought is a glowing node; related thoughts pull together. Pan, pinch, drag, tap to peek, search to dim everything that does not match.
- **Capture from anywhere.** Type in the dock, record a voice note, or share text, links, images and audio to Engram from the Android share sheet.
- **On-device transcription.** Voice notes are transcribed by Android's offline speech recogniser (Android 13+). On phones without it, the audio alone is saved.
- **Self-organising.** Thoughts that share distinctive words, tags or a website are linked automatically. You can connect any two by hand.
- **Yours.** Everything is in one SQLite database on the phone. Export and import a backup file whenever you like.

## Install

Download the latest APK from [Releases](../../releases) and open it on an Android phone.

## Develop

```bash
npm install
npx expo run:android      # builds a development app; Expo Go will not work
```

```bash
npm run typecheck         # TypeScript
npm run lint              # ESLint
npm run check             # database migrations, search and linker logic, in Node
```

Every push to `main` builds a release APK and launches it on an emulator in GitHub Actions. Pushing a tag such as `v1.0.1` also publishes a GitHub release with the APK attached.

## How it is built

| Concern | Choice |
|---|---|
| Framework | Expo SDK 58, React Native 0.88, Expo Router |
| Storage | `expo-sqlite` with FTS5 full-text search |
| Graph | React Native Skia for drawing, `d3-force` for layout, Gesture Handler and Reanimated for touch |
| Voice | `expo-speech-recognition` (on-device only) with `expo-audio` as the audio-only fallback |
| Share target | `expo-sharing` |

```
src/
  app/          screens (graph, list, thought, settings, share capture)
  components/   capture dock, rows, buttons
  db/           schema and migrations, queries
  graph/        the Skia canvas and force simulation
  lib/          capture pipeline, linker, voice, backup
```

### Linking

`src/lib/linker.ts` scores two thoughts by the words they share (TF-IDF cosine), lifts the score for each distinctive shared word, and adds a boost for a shared website or tag. It is pure TypeScript and instant. The plan is to add an on-device embedding model behind the same interface so that thoughts link by meaning, not only by wording.

## Roadmap

- Semantic linking with an on-device embedding model
- Quick Settings tile and home-screen widget for one-tap capture
- Labels and cluster names in the graph
- Media in backups
- iOS

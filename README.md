# Engram

A second brain that lives entirely on your phone. Write, speak or share a thought from any app; related thoughts link themselves and gather into named groups. No account, no server.

<img src="assets/brand/wordmark.png" width="300" alt="engram.">

## What it does

- **Today.** A calm, readable stream of what you captured, each thought showing where it landed.
- **Map.** Your thoughts as named groups ("Sourdough", "Hampi") that form on their own.
- **Capture from anywhere.** Type in the bar, tap the mic, open the full-page note editor, save what you just copied, or share text, links, images and audio from any app.
- **On-device transcription.** Voice notes are transcribed by Android's offline speech recogniser (Android 13+). On other phones the audio alone is saved.
- **Light and true black.** Follows your phone, or pick one. Black is for AMOLED screens.
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

Every push to `main` builds a release APK and launches it on an emulator in GitHub Actions. Pushing a tag such as `v1.0.1`, or a branch named `release/v1.0.1`, also publishes a GitHub release with the APK attached.

## How it is built

| Concern | Choice |
|---|---|
| Framework | Expo SDK 58, React Native 0.88, Expo Router |
| Storage | `expo-sqlite` with FTS5 full-text search |
| Groups and links | Pure TypeScript: word-overlap scoring and label propagation (`src/lib/linker.ts`, `src/lib/groups.ts`) |
| Map layout | `d3-force`, drawn with plain views |
| Voice | `expo-speech-recognition` (on-device only) with `expo-audio` as the audio-only fallback |
| Share target | `expo-sharing` |

The repository map is in [AGENTS.md](AGENTS.md#repository-map).

### Linking

`src/lib/linker.ts` scores two thoughts by the words they share (TF-IDF cosine), lifts the score for each distinctive shared word, and adds a boost for a shared website or tag. It is pure TypeScript and instant. The plan is to add an on-device embedding model behind the same interface so that thoughts link by meaning, not only by wording.

## Docs

| | |
|---|---|
| [AGENTS.md](AGENTS.md) | Start here if you are a coding agent (or a new contributor): repo map, commands, rules, gotchas, release steps |
| [docs/STATUS.md](docs/STATUS.md) | What works, what is untested, and the prioritised backlog |
| [docs/SPEC.md](docs/SPEC.md) | Product and technical spec as built |
| [docs/DESIGN.md](docs/DESIGN.md) | Design principles, colour, type, motion, wording, brand |
| [docs/design/](docs/design/README.md) | The mocks the app is built from |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Why things are the way they are |
| [docs/research.md](docs/research.md) | Design inspiration and library research |
| [docs/original-plan.md](docs/original-plan.md) | The pre-build plan, for history |

Brand sources are in `assets/brand/`.

## Roadmap

See the backlog in [docs/STATUS.md](docs/STATUS.md#backlog).

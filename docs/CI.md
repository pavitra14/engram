# Builds

`.github/workflows/android.yml` runs three jobs: **build** (checks, then the APK), **smoke** (installs the APK on an emulator and walks through the app), and **release** (publishes the APK).

## What makes a run slow

From runs on GitHub's free Linux runners in November 2026, when every push built two APKs:

| Job | Time |
|---|---|
| Build: install, typecheck, lint, tests, then both APKs | about 16 min |
| Smoke: boot an emulator and run the walkthrough | about 8 min |

A GitHub runner starts empty every time, so the C++ of React Native and of each native library is compiled from scratch on every run. That is most of the build job.

## What is already done about it

- **Document-only changes start no run.** Edits to `*.md` and `docs/**` are ignored.
- **One APK per ordinary push.** A push to `main` builds only the x86_64 APK the emulator needs. The arm64 phone APK is built for a release, or when you start a run by hand (Actions, Android, Run workflow).
- **Gradle's caches are kept** between runs (`gradle/actions/setup-gradle`, the Gradle build cache, parallel workers, more memory).
- **A newer push cancels the older run** on the same branch.

Building one APK on ordinary pushes should take several minutes off the build job; this has not been measured yet. Releases still build both APKs.

## Using your own machine as the runner

This is the big one. A machine that keeps its files between runs compiles only what changed, so the build job drops to a few minutes.

1. On GitHub: the repository, Settings, Actions, Runners, **New self-hosted runner**. Pick Linux x64 (or macOS) and run the commands it shows on your machine. Leave the default label `self-hosted`.
2. On that machine, install: Node 22, JDK 17, and the Android SDK with the command-line tools, platform tools, the platform and build tools React Native 0.88 asks for, and the NDK (Gradle downloads a missing NDK itself if the SDK licences are accepted). Set `ANDROID_HOME`.
3. On GitHub: Settings, Secrets and variables, Actions, **Variables**, add `ENGRAM_RUNNER` with the value `self-hosted`.

From then on the build job runs on your machine and does not wipe `node_modules` or the previous build. To go back, delete the variable.

The emulator job stays on GitHub's runners unless you change its `runs-on` too; it needs KVM (Linux with virtualisation enabled).

**Security.** A self-hosted runner executes whatever the workflow says. Pull requests are always sent to GitHub's runners for that reason, so a stranger's pull request never runs on your machine. Keep it that way if the repository is public.

## Releasing

Push a branch named `release/vX.Y.Z-beta.N` from a commit on `main`. The hyphen makes the release a pre-release. See "Releasing" in `AGENTS.md`.

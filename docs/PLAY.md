# Google Play release

_Written 17 Nov 2026. F-Droid was considered and dropped (D52): the code is all rights reserved and F-Droid takes only free software._

## What is in the repo

- **Release signing:** `plugins/withReleaseSigning.js` signs release builds with Engram's own key when `ENGRAM_KEYSTORE_PATH`, `ENGRAM_KEYSTORE_PASSWORD`, `ENGRAM_KEY_ALIAS` and `ENGRAM_KEY_PASSWORD` are set. Without them the build keeps the template debug key. CI sets them for release builds from the repository secrets below.
- **Play bundle:** release builds also produce `engram.aab` (arm64), uploaded with the APK as the `engram-apk` artifact. From 0.9 the release job attaches it to the GitHub release as `engram-vX.Y.Z.aab`, **only when it was signed with the release key**. Without the four secrets the bundle is debug-signed, Play would refuse it, and the job leaves it off with a warning.
- **Target SDK 36** is set in `app.json` through `expo-build-properties`. Play requires 36 for new apps. Do not set `compileSdkVersion`: Expo SDK 58's libraries need 37, which is the default (a 36 override broke the build on 17 Nov).
- **In-app links** to the Privacy Policy, Terms and Contact are in Settings, under About.
- `SYSTEM_ALERT_WINDOW` is blocked in `app.json`; nothing in the app draws over other apps.
- The release job prints the merged manifest's permissions and counts Firebase and Play services entries in the APK, so they can be compared with the Play Console declarations.

## Owner steps (cannot be done by an agent)

1. **Make a keystore** on your own machine and back it up in two places. Losing the upload key is recoverable through Play support; losing a key used for GitHub APKs means every tester reinstalls.

   ```
   keytool -genkeypair -v -keystore engram-release.jks -alias engram -keyalg RSA -keysize 4096 -validity 10000
   base64 -w0 engram-release.jks     # macOS: base64 -i engram-release.jks
   ```
2. **Add four GitHub secrets** (Settings, Secrets and variables, Actions): `ENGRAM_KEYSTORE_BASE64` (the base64 output), `ENGRAM_KEYSTORE_PASSWORD`, `ENGRAM_KEY_ALIAS` (`engram`), `ENGRAM_KEY_PASSWORD`.
3. **Choose the signing arrangement** in Play Console when you create the app. Default: Play App Signing, with this key as the upload key; GitHub builds are then signed by a different key from the Play ones, so a person cannot update from one to the other. To share one signature, upload this key as the app signing key at creation (it cannot be changed later).
4. **Play Console account.** A personal account created after 13 Nov 2023 must run a closed test with 12 or more testers, opted in for 14 continuous days, before applying for production. Testers must install from Play, not from GitHub.
5. Add the **governing law** to the Privacy Policy and Terms (here and in `engram-web`).
6. **Register the package and signing fingerprint** in the Android Developer Console, which also covers Google's developer verification of sideloaded apps (enforced from 30 Sep 2026 in Brazil, Indonesia, Singapore and Thailand; global in 2027).

## What's new text for Play (v0.9.0-beta.4, under 500 characters)

```
• Restoring a backup now keeps to-dos, reminders, stars and pins
• Sharing to Engram while it's closed no longer loses the item
• Translation of notes in other languages works again
• Settings is grouped, with a search box
• The tour asks whether to link notes by meaning
• Optional anonymous usage counts, off unless you say yes
```

## Console checklist

- Store listing: title, short and full description, 512 px icon, 1024x500 feature graphic, 2 to 8 phone screenshots (`docs/screenshots`), category, contact email, website.
- Privacy policy URL: https://engrm.app/privacy
- Data safety form. Local only; optional Engram Cloud sync (off for everyone for now); no ads; the feature flags are read from Supabase at launch; model and language-pack downloads. **App activity: app interactions**, collected only if the person opts in (optional), not shared, not linked to the person's identity, used for analytics; no device or other ids. Coarse location is not stored (the IP address is never kept with the counts). Match `docs/PRIVACY.md`.
- Content rating questionnaire, target audience (not for children), no ads, no login needed.
- Permission declarations. Check against the list the release job prints. Expected: microphone, camera, calendar read and write, notifications, foreground service (media playback, for audio), biometric, internet.
- Account deletion: Engram Cloud sign-in is flagged off. If the flag is ever turned on, Play requires an in-app and a web way to delete the account.
- Production access application after the closed test, then a staged rollout.

## Open checks

- The AAB is arm64 only, like the APK. Play will then show the app only on 64-bit phones. Add armeabi-v7a only if the native libraries (executorch, ML Kit, op-sqlite) all ship it.
- 16 KB page alignment of the native libraries has not been checked. Play requires it for apps targeting Android 15 or later. Check the first AAB with `zipalign -c -P 16 4` on the extracted APK, or the Play Console pre-launch report.
- The first release signed with the real key forces one more reinstall for people on the debug-signed betas (backup, install, restore).
- Unverified features listed in `docs/STATUS.md` (backup with media restore, Devanagari text, the crash screen) should be checked on the S24 Ultra before a public release.

**Install:** download the APK below on an Android phone (Android 7 or newer, 64-bit) and open it.

**Coming from 0.7 or 0.8? One reinstall is needed.** From this release Engram is signed with its own permanent key (the same one Google Play will use), and Android won't install it over the old test-key builds. Do this once:

1. In your current Engram, open Settings, Your thoughts, **Back up**, and save the zip somewhere safe.
2. Uninstall Engram, then install this APK.
3. Open Settings, Your data, **Restore**, and pick the zip. Your to-dos, reminders and stars now come back too (see below).

Future updates install over this one as usual.

This release also includes everything from the 0.8 test build, so if you are coming from 0.7, read both lists.

**Fixed in 0.9**

- **Restoring a backup keeps your to-dos.** Before, a restore brought back the words but dropped every to-do, reminder, repeat, star, pin and "remember this" date. Now they all come back, reminders still ahead ring again, and the trash is included in backups too.
- **Sharing to Engram while it is closed works.** A share that opened Engram from cold could be lost, leaving you on Today with nothing saved. Engram now picks it up as soon as it starts.
- **Translation works for notes in other languages.** Turning it on reported "Cannot convert to a Kotlin type" for every non-English note. The message after a run no longer contradicts itself either.
- **Large or broken backups are refused safely.** A backup over 600 MB is turned down with a clear message instead of freezing the app, and files are unpacked one at a time.
- Photos with the same file name can no longer overwrite each other in a backup. Older backups still restore.
- Reading text from pictures no longer leaks memory on phones with many photos.

**New in 0.9**

- **Settings in groups, with search.** Settings is now six groups you open and close: Look and feel, Capture, Smart features, Privacy and security, Your data, and Help and about. Type in **Find a setting** at the top to jump straight to a setting. Engram remembers which groups you leave open.
- **The tour asks about linking by meaning.** New installs are asked whether to link notes by what they mean, with the download size up front. Nothing is turned on unless you say yes, and you can change it in Settings.

**From 0.8**

- **A question about usage counts.** At the end of the tour (or once on Today, the first time you open the new version), Engram asks whether you'd like to share an anonymous daily count of which features you used. Nothing is counted unless you say yes, it never includes your notes, and there is no id for you or your phone. Change your answer in Settings, Privacy and security. **What's sent** shows today's counts in plain words. Details are in the [Privacy Policy](https://engrm.app/privacy).
- Widgets, the Quick Settings tile and icon shortcuts say where they were opened from, so those counts can tell which ones people use.

**Please try these on your phone**

- Back up, then restore on another phone or a fresh install: to-dos, reminders and stars should come back, and a reminder still ahead should ring.
- Force-stop Engram, then share a link and a photo to it from another app: both should be saved.
- Turn on translation with a note in another language.
- Settings: open and close groups, search for "backup" or "theme", leave the screen and come back.

**Known limits**

- The weekly automatic backup still holds words, tags and links only, not photos or recordings.
- A backup zip is built in memory; with more than about 400 MB of media, the largest files are left out and the count is shown.

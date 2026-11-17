This is **beta 2**: the first Engram build meant for more than one tester. Expect rough edges, and please report what breaks.

**Install:** download the APK below on an Android phone (Android 7 or newer, 64-bit) and open it.

**Coming from 0.6 or earlier? Read this first.** The app's id changed to `dev.pavitra.engram`, so Android treats this as a new app: it installs beside the old Engram and starts empty.

1. Update the old app's backup: in the **old** Engram, Settings, Back up, Export. (0.6 backups hold words, tags and links, not photos or recordings.)
2. In the **new** Engram, Settings, Restore, Import that file.
3. Check your notes are there, then uninstall the old one. Widgets and the Quick Settings tile need adding again.

This build is signed with a development key. Install it only from this releases page. A proper signing key is on the way; when it arrives you will need to back up and reinstall once more.

**New in 0.7**

- **Text in pictures now works without Google Play services** and reads **Hindi and other Devanagari text** as well as Latin. The recogniser is inside the app: nothing is downloaded and it works offline. A photo with no words says so and offers "Try again".
- **Backups include your photos, recordings and files.** "Back up" makes one zip; "Restore" puts everything back.
- **A screen for when something breaks.** If a screen fails, Engram shows what happened with Try again, Copy details and Export a backup. Nothing is reported automatically, so please send the details.
- **Ask your notes** is built but switched off until it has been tested on real phones.

**Please try these on your phone; they could not be tested automatically**

- Share or scan a photo with printed text, then search for a word in it. Try one in Hindi.
- Back up, then Restore into a fresh install: do photos and recordings come back?
- Translation in a language other than English: if it fails, what does the message say?
- The Quick Settings tile, icon shortcuts, app lock, the focus timer and the morning and evening notifications.

**Known limits**

- The weekly automatic backup still holds words, tags and links only.
- A backup zip is built in memory; with more than about 400 MB of media, the largest files are left out and the count is shown.
- The trash, pins, group names and goals stay on this phone.
- Engram Cloud is still switched off.

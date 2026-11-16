This is a **beta** for testing. Expect rough edges, and please report what breaks.

**Install:** download the APK below on an Android phone (Android 7 or newer, 64-bit) and open it. It installs over version 1 and keeps your thoughts.

**New since version 1**

- **A new design.** Home is a readable stream of your thoughts; a map shows them as named groups that form on their own. Light and true-black themes.
- **Any kind of thought.** Text, voice, links, photos, videos and documents, from the + button or shared from any app.
- **To-dos and reminders.** Open a thought and tap To do. Today shows what is open.
- **Calendar.** Add a thought to your calendar from its menu. In Settings you can show today's events on Today and take notes on them.
- **Links by meaning (experimental, optional).** In Settings, turn on "Understand meaning". Engram downloads a language model once (about 130 MB) and links thoughts that mean similar things, in 50+ languages. It runs on your phone; your thoughts are never sent anywhere. **This has not yet worked in testing:** on the test emulator the model gave unusable results, and Engram detected that and kept linking by words. It may behave differently on a real phone. Engram checks the model each time it loads and tells you in Settings if it cannot be used.
- **Notepad.** A full-page editor for longer notes.
- **Save what you copied.** Home offers to save your clipboard when it has text.
- **Search** with highlights and filters, **full-screen voice notes**, and a reason shown for every link.

**Please test these on your phone; an emulator could not**

- Voice notes: recording, live transcription, playback
- A reminder actually arriving, and tapping it
- Picking photos, videos and files; opening a saved video or document
- The date and time picker for reminders
- Calendar: adding an event, and today's events on Today
- "Understand meaning": whether Settings ends on "On. Thoughts link by meaning." or reports that the model could not be used, and if it is on, whether the links make sense
- The clipboard prompt

**Known limits**

- Group names are single words and can be odd; groups cannot be renamed.
- Files are not read: a PDF links only by its name and any note you add.
- No repeating reminders.
- The share sheet appears over Engram, not over the app you shared from.
- Backups do not include files or recordings.
- Signed with a development key: fine for installing directly, not for the Play Store.

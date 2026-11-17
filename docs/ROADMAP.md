# Roadmap

> **0.6.0 shipped all 19 committed items below and most of the proposed list.** Still open: Wear OS tile, on-phone language model (ask your notes, summaries, better group names, suggested tags), place reminders, password-protected backups, share a note as an image, media in backups, inline tappable `[[links]]`. See `STATUS.md`.

What is planned, in the owner's words where possible. `STATUS.md` says what works today; this page says what comes next. When an item ships, move it to `STATUS.md` and delete it here.

Every item keeps the existing rules: works offline, nothing of the person's leaves the phone, 48 pt targets, colours from the theme.

## Committed

The owner put all of these on the build list on 16 Nov 2026.

### Catch it

1. **Reminders in plain words.** "Call the bank Friday 10am" or "renew passport in 2 weeks", typed or spoken, becomes a to-do with that reminder. Parsed on the phone, English first. The note keeps the words as written; the date is shown as a chip that can be tapped to change or remove.
   _Done when:_ the common forms (today, tonight, tomorrow, weekday names, "next week", "in N days/hours", times like 6, 6pm, 18:30, dates like 3 Dec) are parsed in `npm run check`, and a wrong guess is one tap to undo.
2. **Quick Settings tile.** A tile in the notification shade that opens a voice note, or a new note (person's choice). Needs a config plugin that adds a `TileService`.
   _Done when:_ the tile can be added from Android's tile editor and opens the right screen with the phone locked or unlocked.
3. **Add to an existing note from the share sheet.** The share screen offers "New note" and "Add to…", with recent notes and a search. Added text goes at the end of the body; files attach to the note.
   _Done when:_ sharing a link into an existing note appends it, and the note's links and search update.
4. **Shake or back-tap to start a voice note.** Constraint: Android gives apps no access to Pixel's back-tap ("Quick Tap"); the person can set Quick Tap to open an app, so Engram adds an app shortcut ("New voice note") and tells them how. Shake detection works only while Engram is open (listening in the background needs a permanent notification and drains the battery).
   _Done when:_ the app-icon shortcut and shake (in the app, off by default) open voice capture, and the help text explains Quick Tap.

### Find it

5. **Text in photos is searchable.** On-device text recognition (ML Kit) reads images when they are saved and stores the text as derived data, like translations. Search and linking read it; the photo's note shows "Text in this picture" with a copy button.
   _Done when:_ a screenshot of a receipt is found by a word on the receipt, with nothing uploaded.
6. **Rename and merge groups.** Groups stay derived, but a name the person chooses is stored against the group's members and wins over the automatic name while most of them are still together. Merging adds manual links between the two groups.
   _Done when:_ a renamed group keeps its name after new thoughts join it and after a full relink.
7. **Pin notes.** Pinned notes sit at the top of Today, in every home layout.
   _Done when:_ pinning and unpinning work from the note and from the hold menu.
8. **`[[Note]]` links in the editor.** Typing `[[` offers matching notes; choosing one makes a manual link and shows the title as a tappable link. Each note gets "Linked from".
   _Done when:_ a `[[link]]` survives editing, export and a relink, and renaming the target updates how it shows.
9. **Export as Markdown.** One `.md` file per note (title, body as Markdown, tags, links as `[[...]]`) in a zip, through the share sheet. Opens in Obsidian.
   _Done when:_ an export of the sample notes opens in Obsidian with links working.

### Bring it back

10. **On this day.** Today shows a note from one month, six months or one year ago, when there is one.
11. **Remember this.** A note marked to remember comes back after 1, 3, 7, 21 and 60 days, each time with "Still useful?" (keep, done remembering, delete).
    _Done when:_ the schedule is tested in `npm run check` and survives the app being closed.
12. **Surprise me.** A random older note, from a button on Today and a home-screen widget.

### Act on it

13. **Check boxes roll up.** Every unticked check box in any note appears on the To do list under its note's title. Ticking it there ticks it in the note, and the other way round.
    _Done when:_ the HTML round trip keeps the rest of the note untouched, and the rule for what counts as a check box (the editor's `ul data-type="checkbox"` items) is tested.
14. **Groups become projects.** A group can be given a goal and a date. It then shows progress (ticked boxes of all boxes in its notes), the next unticked step, and a reminder before the date. Needs a small stored `projects` table keyed the same way as group names.
15. **Focus timer.** "Focus for 25 minutes" on any to-do's menu. A notification counts down and offers Done or Five more minutes at the end. Each session is noted on the to-do.

### Fun

16. **Monthly recap.** The month in a few cards: notes written, most active group, busiest day, longest streak, a forgotten note. Shareable as an image (rendered on the phone).
17. **Map time-lapse.** Play the map growing week by week, from the first note to now.
18. **Link suggestions.** "These two seem related": link or dismiss, one pair at a time. Dismissals are stored, so the pair is never suggested again, and they lower the linker's score for similar pairs.

### Trust

19. **App lock.** Fingerprint, face or the phone's PIN to open Engram, after a chosen time away (immediately, 1 minute, 5 minutes). `expo-local-authentication`. Widgets and the share sheet still work; opening a note from them asks first.
    _Done when:_ the lock holds on returning to the app, and turning it off needs authentication.

## Proposed, not yet decided

Ideas from the 16 Nov brainstorm that the owner has not chosen yet. Move an item up to "Committed" when they do.

**Catch it**
- A quick-note notification that stays in the shade (optional, off by default).
- Scan paper into a note: camera, crop, text recognition. Needs the camera permission.
- Long voice notes split into sections at pauses, each with its own transcript.
- A Wear OS tile for speaking a note from the watch (a separate app target; large).

**Find it**
- Trash: deleted notes kept for 30 days, and an Undo right after deleting.
- Saved searches, such as "work to-dos due this week".
- "You wrote something like this before" when saving a near-duplicate (uses the meaning vectors).
- People: `@name` gathers every note about a person, plus a "next time I see them" list.

**Bring it back**
- A morning brief notification at a chosen time: today's to-dos, events and question.
- An evening wrap-up: "You saved 4 things today. Any to-dos in them?"
- "Months ago you wrote…" on each note: related older notes.
- Reminders by place ("when I get home"). Needs the location permission.

**Act on it**
- Waiting-for (things others owe you) and Someday lists.
- Decision journal: a Decision note asks "How did it turn out?" three months later.
- Habits: a daily check-in with a streak for each habit.

**On-phone intelligence** (one optional download of a small language model, about 1 GB, opt-in)
- Ask your notes a question and get an answer that cites them, without leaving the phone.
- Summarise a group into a paragraph and three next steps.
- Better group names than single words.
- Suggested tags when saving.

**Personal**
- Choose an accent colour.
- Share a note as a well-set card image.
- Quiet milestones (100th note, 30-day streak), no nagging.

**Trust**
- Automatic weekly backup to a folder the person picks, including photos and recordings.
- Password-protected backups.
- Import from Google Keep (Takeout), an Obsidian or Markdown folder, and plain text.

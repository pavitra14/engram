# Privacy Policy

_Effective 18 November 2026. Applies to Engram for Android, version 0.8 and later._

> The published version is at **[https://engrm.app/privacy](https://engrm.app/privacy)**, which also covers the website. Keep the two in step: the page's source is `app/privacy/page.tsx` in [pavitra14/engram-web](https://github.com/pavitra14/engram-web).

Engram is a note-taking app made by its developer, pavitra14 on GitHub ("we"). This policy says what the app does with your information. The short version: **what you write stays on your phone unless you choose to sign in to Engram Cloud.**

## The short version

- Engram has no advertising and no tracking. It never gives you, your phone or your install an id, never records what you do moment by moment, and never builds a profile of you. We do not sell, rent or share your information.
- **Usage counts are your choice.** When you first open Engram, it asks whether you'd like to send an anonymous daily count of which features you used. Nothing is counted unless you say yes, it never includes your notes, and you can change your answer any time in Settings.
- Everything you capture is stored in the app's private storage on your phone.
- You need no account. Without one, none of your notes, recordings, photos or files leave the phone.
- The app makes a few network requests that carry none of your content. They are listed below.
- If you choose to sign in to Engram Cloud (currently switched off for everyone), the items listed under "Engram Cloud" are copied to our server so your devices stay in step.

## What stays on your phone

Everything you put into Engram is stored in its private storage on your device: notes and their formatting, voice recordings and transcripts, photos, videos and files you attach, to-dos and reminders, tags and links, and your settings. The app also makes these from your notes on the phone, and they are never uploaded:

- links and groups between notes;
- "meaning" vectors used to link notes with similar meaning;
- English translations of notes in other languages;
- text read from your photos and screenshots;
- the search index.

**Backups** are files you create and send where you choose (for example, to your own cloud drive). Once you send a backup somewhere, that service's own privacy terms apply to it. Backups are not encrypted by Engram.

**Uninstalling** Engram deletes everything it stored on the phone, unless Android's own device backup has copied app data.

## Permissions, and why

Engram asks for each permission only when you use the feature that needs it. You can refuse or withdraw any of them in Android settings, and the rest of the app keeps working.

| Permission | Used for |
|---|---|
| Microphone | Recording voice notes. Speech is turned into text by Android's on-device recogniser, not by a cloud service. |
| Camera | Taking a photo or scanning paper into a note. |
| Photos and videos | Attaching the pictures and videos you choose. |
| Notifications | Reminders, the focus timer, and the optional morning and evening notes. All are scheduled on the phone. |
| Calendar | Showing today's events and adding a thought to your calendar, if you turn this on. Calendar data is read on the phone; Engram keeps only what you put in a note made from an event. |
| Fingerprint or face unlock | The optional app lock. Engram never sees your biometric data; Android only tells it whether unlocking succeeded. |

Engram also checks whether the Claude and ChatGPT apps are installed, so it can offer to open them.

## Network requests the app makes

Without an account, Engram makes only these requests. None of them carries your notes or anything you wrote.

| When | Who | What is sent |
|---|---|---|
| Each time the app starts | Engram's server (Supabase, Mumbai region) | A request for which unfinished features are switched on. It includes no account or device id. |
| Once a day, only if you said yes to usage counts | Engram's server (Supabase, Mumbai region) | A finished day's anonymous feature counts, three rough ranges and the app version. No id and no content. See "Usage counts" below. |
| Only if you turn on "Understand meaning" or download the Ask model | Hugging Face (models published by Software Mansion) | A download of the language model. The library's usage reporting is switched off. |
| Only if you turn on translation | Google ML Kit | A download of the language pack for each language. |
| Only if you install the offline speech pack | Android, through Google's speech services | Handled by Android, not by Engram. |

Like any internet request, these reveal your device's IP address and basic technical details to the service you are contacting, and that service may keep standard server logs. Reading text from pictures needs no download: the recogniser is built into the app.

**Chat with Claude or ChatGPT.** These buttons open the other app, or its website, with a draft message made from the notes you chose, and put the draft on your clipboard. Nothing is sent until you send it there. After that, Anthropic's or OpenAI's privacy terms apply.

**Opening links and files.** When you open a web link or a file from a note, it opens in another app, under that app's terms.

## Usage counts (only if you say yes)

**Why we ask.** Engram is made by one person. Knowing roughly how many people use it, and which features they use, decides what gets fixed and built next. We wanted that without watching anyone, so the app counts, and doesn't record.

**Your choice.** Engram asks once: at the end of the first-run tour, or, if you updated from an earlier version or skipped the tour, the first time you open the new version. Nothing is counted until you say yes. Closing the question without answering counts as no. Change your answer any time in **Settings, Share usage counts**. Saying no, then or later, deletes any counts waiting on your phone. Engram works exactly the same either way.

**What is sent.** At most once a day, and only for a day that has already ended:

- the date and the app version;
- how many times you used each feature from a fixed list, such as recording a voice note, searching or opening the map;
- which of a few settings are on, such as the black theme or app lock;
- three rough ranges: on how many of the last 7 days you opened Engram, how long it has been installed, and roughly how many notes you keep (for example "10 to 99").

The full list is in [METRICS.md](https://github.com/pavitra14/engram/blob/main/docs/METRICS.md). **Settings, What's sent** shows today's counts in plain words.

**What is never sent.** Your notes, titles, tags, search words, recordings, photos or file names. No id for you, your phone or this install. No time of day, no order of what you did, no location, no device model, no contacts.

**What we keep.** Only totals: for each day, how many installs used each feature and how often, added up across everyone. Your message is added to those totals and not stored as it was sent. Like any internet request, it reaches our host from your IP address; the host's gateway may keep that briefly in its request logs, but it is never stored with the counts.

**Where.** In Engram's own database at Supabase, Mumbai region. No analytics company receives it.

**How long.** The totals are kept while Engram is developed. They hold nothing that can be tied to you, so there is nothing to look up or delete for one person.

## Engram Cloud (optional, currently switched off)

Engram Cloud is an optional account that keeps your notes in step across your devices. It is built but switched off for everyone while it is tested. This section applies only if it is switched on and you sign in.

**What is sent and stored:**

- your email address and password (the password is stored by our authentication provider as a one-way hash, which cannot be turned back into the password);
- the title, body and formatting of your notes;
- to-do state, reminder times and the "important" mark;
- tags, and links you made by hand;
- technical records the service needs: row ids, timestamps, revision counters and receipts for each sync.

**What is not sent:** photos, videos, recordings and files (their notes sync, but the files stay on the phone that has them), automatic links, meaning vectors, translations, text read from pictures, pins, the trash, your settings and file paths.

**Where it is kept:** in a database run by Supabase, our hosting provider, in its Mumbai (ap-south-1) region. Supabase processes it on our behalf.

**How it is protected:** data is encrypted in transit and at rest, and database rules mean an account can read only its own rows. It is **not end-to-end encrypted**: the service operator can technically read the cloud copy. The app says so before you sign in.

**How long it is kept:** until you delete it. Deleting a note removes its content from the cloud and keeps only its id, so your other devices learn it was deleted. Deleting your account in Settings removes the account and all its cloud data. Copies already on your phones are not affected.

**Email:** we send only the emails needed for the account, such as confirming your address. No marketing emails.

## Children

Engram is not directed at children. If you are under the age at which your local law lets you consent to the use of your personal information, do not create an Engram Cloud account without a parent's or guardian's permission. The app without an account collects no personal information about anyone; usage counts, if switched on, hold nothing that identifies a person.

## Your choices and rights

- **See and export your data:** Settings, Back up, or export as Markdown.
- **Correct it:** edit any note in the app.
- **Delete it:** delete notes (they go to the trash for 30 days, then are removed), empty the trash, or uninstall the app. With Engram Cloud, sign out or delete your account in Settings.
- **Ask us:** depending on where you live, you may have the right to access, correct or erase personal information we hold, or to complain to a data protection authority. The only personal information we can hold is an Engram Cloud account. To make a request, email [contact@engrm.app](mailto:contact@engrm.app).

## Changes to this policy

When the app changes what it does with information, this page changes first. The date at the top shows the latest version, and its history is kept in this repository. Any new upload of your content will need your agreement in the app before it starts. We will never add an id, a record of individual actions, or anything you wrote to usage counts. If we add a new count, we will list it here and in METRICS.md before the version that sends it.

## Contact

Email [contact@engrm.app](mailto:contact@engrm.app), or open an issue at [github.com/pavitra14/engram/issues](https://github.com/pavitra14/engram/issues) (please leave personal details out of public issues).

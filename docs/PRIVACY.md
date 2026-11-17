# Privacy Policy

_Effective 17 November 2026. Applies to Engram for Android, version 0.7 and later._

> The published version is at **[https://engram.pavitra.dev/privacy](https://engram.pavitra.dev/privacy)**, which also covers the website. Keep the two in step: the page's source is `app/privacy/page.tsx` in [pavitra14/engram-web](https://github.com/pavitra14/engram-web).

Engram is a note-taking app made by its developer, pavitra14 on GitHub ("we"). This policy says what the app does with your information. The short version: **what you write stays on your phone unless you choose to sign in to Engram Cloud.**

## The short version

- Engram has no analytics, no advertising and no tracking. We do not sell, rent or share your information.
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

Without an account, Engram contacts other services only in these cases. None of them carries your notes or anything you wrote.

| When | Who | What is sent |
|---|---|---|
| Each time the app starts | Engram's server (Supabase, Mumbai region) | A request for which unfinished features are switched on. It includes no account or device id. |
| Only if you turn on "Understand meaning" or download the Ask model | Hugging Face (models published by Software Mansion) | A download of the language model. The library's usage reporting is switched off. |
| Only if you turn on translation | Google ML Kit | A download of the language pack for each language. |
| Only if you install the offline speech pack | Android, through Google's speech services | Handled by Android, not by Engram. |

Like any internet request, these reveal your device's IP address and basic technical details to the service you are contacting, and that service may keep standard server logs. Reading text from pictures needs no download: the recogniser is built into the app.

**Chat with Claude or ChatGPT.** These buttons open the other app, or its website, with a draft message made from the notes you chose, and put the draft on your clipboard. Nothing is sent until you send it there. After that, Anthropic's or OpenAI's privacy terms apply.

**Opening links and files.** When you open a web link or a file from a note, it opens in another app, under that app's terms.

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

Engram is not directed at children. If you are under the age at which your local law lets you consent to the use of your personal information, do not create an Engram Cloud account without a parent's or guardian's permission. The app without an account collects no personal information about anyone.

## Your choices and rights

- **See and export your data:** Settings, Back up, or export as Markdown.
- **Correct it:** edit any note in the app.
- **Delete it:** delete notes (they go to the trash for 30 days, then are removed), empty the trash, or uninstall the app. With Engram Cloud, sign out or delete your account in Settings.
- **Ask us:** depending on where you live, you may have the right to access, correct or erase personal information we hold, or to complain to a data protection authority. The only personal information we can hold is an Engram Cloud account. To make a request, email [engram@pavitra.dev](mailto:engram@pavitra.dev).

## Changes to this policy

When the app changes what it does with information, this page changes first. The date at the top shows the latest version, and its history is kept in this repository. Any new upload of your content will need your agreement in the app before it starts.

## Contact

Email [engram@pavitra.dev](mailto:engram@pavitra.dev), or open an issue at [github.com/pavitra14/engram/issues](https://github.com/pavitra14/engram/issues) (please leave personal details out of public issues).

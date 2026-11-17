# Engram Cloud

An optional copy of your notes on a server, so they appear on your other devices. It answers [issue #2](https://github.com/pavitra14/engram/issues/2). This page says what was built from that proposal, what was not, and how it works.

## The short version

- **Currently switched off for everyone.** Engram Cloud is behind the `cloud` feature flag, which is off. While it is off the Settings section is hidden and the app neither signs in nor syncs. Switch it on with `update public.feature_flags set enabled = true where key = 'cloud';` in the Supabase SQL editor; phones notice at their next start.
- **Off by default.** With no account, Engram makes no cloud request and records nothing for sending. Every existing feature works as before.
- **Turn it on** in Settings, Engram Cloud: create an account with an email and password, or sign in. Sign out, or delete the account, in the same place.
- **What is synced:** notes (title, body, formatting), to-do state and reminder times, tags, and links you make by hand.
- **What is not:** photos, videos, recordings and files (their notes sync, the bytes stay on the phone that has them), automatic links (each phone works them out again), meaning vectors, settings, alarm ids, file paths.
- **Not end-to-end encrypted.** Data is encrypted in transit and at rest by Supabase, and row level security means an account can only read its own rows, but the service operator can read the cloud copy. The app says so before sign-in.

## What was built, against the proposal

| Proposal (issue #2) | Status |
|---|---|
| Phase 0: mapping, conflict rules, privacy modes | Done, recorded in `DECISIONS.md` D33 to D35 |
| Phase 1: optional account, Postgres schema, row level security, atomic write function with receipts, sync, opt-in screen, sync status | Done, with one substitution (below) |
| Phase 1: PowerSync replication service and Sync Streams | **Not done.** No PowerSync service exists for this project; see "Why not PowerSync's service" |
| Phase 1: account-scoped database files, snapshot and verified cut-over | Not done. One local database; sign-in uploads what is on the phone. A different account on the same phone asks first |
| Phase 2: conflict handling without silent overwrite; delete beats edit with the edit kept | Done (both versions kept as notes; there is no merge screen) |
| Phase 2: delete account | Done (an Edge Function; the tables cascade) |
| Phase 2: media in Storage, version history, export from the cloud, restore drills | Not done |
| Google and Apple sign-in | Not done; email and password only |
| Phases 3 to 6: cloud search, Ask Engram, insights, web and desktop, sharing, billing | Not started. They need AI provider accounts, cost decisions and consent screens that are the owner's to make |

## Why not PowerSync's service

The proposal has PowerSync's replication service copy Postgres rows down to the phone. That service is a separate product that has to be created, connected to the database and paid for or self-hosted, and none exists for this project. So the phone talks to Supabase directly:

- **Up:** `apply_sync_batch(batch_id, changes)`, a Postgres function. It is the only way to write. It checks the caller, takes a per-person lock, applies each change with a revision check, and stores its answer under the batch id so a batch sent twice is applied once.
- **Down:** `pull_changes(after)`, which returns the caller's rows changed since a counter the phone remembers.

The local database is still PowerSync's (local-only), and `src/cloud/sync.ts` talks to a small `Remote` interface, so a PowerSync connector could replace the transport later without touching the screens.

## Rules for two devices

| Situation | What happens |
|---|---|
| The same note's words changed on two devices | The first to sync keeps the original. The second device's words are saved as a new note titled "… (from this phone)", and the person is told |
| A note deleted on one device, edited on another | The deletion stands. The edit is saved as a new note titled "… (deleted on another device)" |
| To-do state, reminder time, importance | Last change to reach the server wins |
| Tags, hand-made links | Adding and removing are each applied; last change wins |
| A reminder set on another device | This phone schedules its own alarm for it, if notifications are allowed |
| A deleted note | The server keeps its id and nothing else |

## What is on the server

Project `engram` (region ap-south-1). Schema in `supabase/migrations/0001_engram_cloud_sync.sql`:

- Tables `thoughts`, `links`, `tags`, `thought_tags`, `sync_receipts`, each row owned by a user id, with `on delete cascade` from the account.
- Row level security on all five. Signed-in users may read their own rows in the first four. Nobody may insert, update or delete directly.
- Functions `apply_sync_batch`, `pull_changes`, `delete_my_data` (execute granted to signed-in users only).
- Edge Function `delete-account` in `supabase/functions/delete-account`: verifies the caller's token, then deletes that user.

Checked against the real database, in a transaction that was rolled back: first write, replayed batch, stale edit with different words (conflict), stale edit with the same words (accepted), a second user reading nothing and unable to delete the first user's row, direct insert refused, delete then edit ("gone"), paging, `delete_my_data`, and a call with no user refused.

## Usage counts (separate from the cloud)

`supabase/migrations/0004_usage_counts.sql` adds a `usage` schema, which the Data API does not expose: `usage.metrics` (the fixed list), `usage.daily` (totals per day, version and metric) and five read-only views. The app can only call `public.record_usage(payload)`, executable by `anon`, which checks the message and adds it to the totals. Sign-in plays no part; nothing in it is tied to an account. Kill switch: the `metrics` flag. Full details, queries and the dashboard login: `docs/METRICS.md`.

## What the app needs

Two values at build time, both public by design: `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_KEY` (the **publishable** key). CI reads them from repository secrets of the same names. For a local build put them in a `.env` file, which is gitignored. A build without them works normally and shows no cloud option.

Never put the service role key in the app, the repository or these secrets.

## Things only the owner can do

1. **Confirmation emails.** New accounts must tap a link in an email. That link then opens the project's "Site URL", which by default is `http://localhost:3000`, so the person sees a browser error even though the account is confirmed. In the Supabase dashboard, Authentication, either set the Site URL to a real page that says "Confirmed, go back to Engram", or turn "Confirm email" off while testing.
2. **Email sending limits.** Supabase's built-in email sender allows only a few messages an hour. Connect your own SMTP before more than a few people sign up.
3. **Check the key.** Make sure the `EXPO_PUBLIC_SUPABASE_KEY` secret holds the publishable key.

## Not verified

- **Nothing here has been run from a phone or emulator while signed in.** The sandbox this was written in cannot reach Supabase, and the emulator test has no account. The server functions were tested in the database; the phone's sync logic was tested with two simulated phones and a stand-in server (`npm run check`); the HTTP calls in `src/cloud/api.ts` and the `delete-account` function have never been called.
- Sign-up, the confirmation email, and sign-in.
- Sync on a slow or dropping connection.

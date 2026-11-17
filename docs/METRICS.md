# Usage counts

Engram can send anonymous usage counts, **only if the person said yes**. This page lists exactly what is counted, how it travels and how to read the totals. The promise to people is in [PRIVACY.md](PRIVACY.md), "Usage counts", and on https://engrm.app/privacy. Why it is built this way: [DECISIONS.md](DECISIONS.md), D53.

## How it works

1. **Asking.** The tour's last page asks. People who updated from 0.7, or skipped the tour, get the same question once as a sheet on Today. Closing it counts as no. Settings, Privacy, "Share usage counts" changes the answer; no deletes everything waiting. Stored in `meta` as `usage` = `yes` or `no`.
2. **Counting.** `count(M.x)` in `src/lib/usage.ts` adds 1 to a local tally (`usage_counts`, derived, never synced) under the phone's local date. It does nothing unless the answer is yes.
3. **Sending.** On the first open of a new day, if the answer is yes, the `metrics` flag is on, and it is a release build, each finished day (at most 7) becomes one message. The day is deleted before sending; a failed send loses it.
4. **Storing.** `public.record_usage` (migration `0004_usage_counts.sql`) validates the message and adds it to `usage.daily`. Nothing else is kept.

## The message

```json
{"day":"2026-11-17","v":"0.8.0","a":{"1":2,"10":4,"21":1},"s":[50,53],"b":[71,81,91]}
```

- `day`: the local date the counts are for. The server accepts the last 8 days and up to 1 day ahead (time zones).
- `v`: the app version, digits and dots only.
- `a`: action id and how many times it happened that day, capped at 500.
- `s`: settings that are on.
- `b`: one range from each of the three bucket sets.

No id, no time of day, no device model, no content. Settings, "What's sent" shows today's message in plain words.

## The list

Ids are never reused. A retired metric keeps its id.

| Id | Metric | Kind | Counted in |
| --- | --- | --- | --- |
| 1 | Opened the app | action | `appOpened()`: start-up and each return to the app |
| 10 | Typed a quick thought | action | `CaptureBar` send, quick add on To do |
| 11 | Recorded a voice note | action | `useVoice` save |
| 12 | Shared something in | action | `handle-share.tsx`, per item |
| 13 | Took a photo or scan | action | `CaptureBar` scan |
| 14 | Attached or imported a file | action | `CaptureBar` attach (photos/videos, files) |
| 15 | Wrote a titled note | action | `compose.tsx` save |
| 16 | Opened from a widget | action | `?from=widget` on compose and voice links |
| 17 | Opened from the tile or an icon shortcut | action | `?from=tile`, `?from=shortcut` |
| 20 | Opened a note | action | `thought/[id].tsx` |
| 21 | Searched | action | `search.tsx`, once per visit with a query |
| 22 | Opened the map | action | `map.tsx` |
| 23 | Finished a to-do | action | `reminders.setDone(done)` |
| 24 | Set a reminder | action | the note's reminder picker, "Remind me" in the hold menu, and a reminder read from typed or spoken words (not snoozes or repeats) |
| 25 | Opened the weekly review | action | `review.tsx` |
| 26 | Opened the month recap | action | `recap.tsx` |
| 28 | Asked your notes | action | `ask.tsx` |
| 29 | Opened Chat with Claude or ChatGPT | action | `assistants.chatWith` |
| 30 | Finished a focus session | action | `focus.endFocus` at or after its end |
| 31 | Exported a backup | action | Settings, Back up |
| 32 | Restored a backup | action | Settings, Restore |
| 33 | Saw the crash screen | action | `CrashScreen` (no error text is sent) |
| 50 | Black theme | setting | `appearance` black, or system in dark mode |
| 51 | Split home layout | setting | `home_view` |
| 52 | Map home layout | setting | `home_view` |
| 53 | Understand meaning on | setting | `semantic` |
| 54 | Translation on | setting | `translate` |
| 55 | App lock on | setting | `lock` |
| 56 | Calendar on | setting | `calendar` |
| 57 | Morning or evening notes on | setting | `briefs` |
| 58 | Signed in to Engram Cloud | setting | `cloud.signedIn()` |
| 70 to 73 | Days opened in the last 7: 1, 2 to 3, 4 to 6, 7 | bucket | `usage_days` (local dates, never sent) |
| 80 to 83 | Installed: under a week, 1 to 4 weeks, 1 to 3 months, longer | bucket | `usage_since` (oldest note, or the day of saying yes) |
| 90 to 93 | Notes kept: under 10, 10 to 99, 100 to 999, 1,000 or more | bucket | `countThoughts` |

Id 27 (translation) was planned and dropped: translation runs on its own once switched on, so setting 54 covers it.

## Adding a metric

In one release: add it to `M` and `NAMES` in `src/lib/usage.logic.ts`, count it, add a row to `usage.metrics` in a **new** migration, add it to this table, and to `docs/PRIVACY.md` and `app/privacy/page.tsx` in `engram-web` if it is a new kind of thing. Only count things the person does, and only things you would act on.

## Reading the numbers

In the Supabase SQL editor (the owner's login sees everything):

```sql
select * from usage.active_daily order by day desc, version;   -- active installs per day and version
select * from usage.features_7d;                                -- features ranked by installs, last 7 days
select * from usage.features_trend where name = 'Searched' order by day;
select * from usage.settings_share where day = current_date - 1;
select * from usage.buckets where day = current_date - 1 order by name;
```

The views hide anything from fewer than 3 installs, so an early tester's day never stands out.

### A dashboard (Looker Studio or similar)

1. In the SQL editor: `alter role usage_reader with login password '<a long random password>';`. The role can read the five views and nothing else.
2. In Looker Studio: Add data, PostgreSQL. Use the **session pooler** host and port from Supabase, Project Settings, Database, database `postgres`, user `usage_reader.overhwmfzxxssatdjmdx`, that password, and SSL on.
3. Pick a view as the table. Never put the password in either repo.

## Kill switch

`update public.feature_flags set enabled = false, updated_at = now() where key = 'metrics';` stops every phone sending at its next launch. Counts keep being tallied on phones that said yes and are dropped after 7 days.

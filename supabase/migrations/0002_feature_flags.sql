-- Switches for features that are not ready for everyone. The app reads this
-- table when it starts (it is public: no account needed, and the request says
-- nothing about the person). A flag that is missing, false, or that the app has
-- never managed to read counts as off.
--
-- To switch something on:  update public.feature_flags set enabled = true, updated_at = now() where key = 'cloud';
create table public.feature_flags (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{0,40}$'),
  enabled boolean not null default false,
  description text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.feature_flags enable row level security;
grant select on public.feature_flags to anon, authenticated;
create policy feature_flags_read on public.feature_flags for select to anon, authenticated using (true);
insert into public.feature_flags (key, enabled, description) values
  ('cloud', false, 'Engram Cloud: optional account and sync. Off hides the Settings section and stops all syncing.');

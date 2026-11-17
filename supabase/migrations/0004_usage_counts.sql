-- Anonymous usage counts (0.8). See docs/METRICS.md and the "Usage counts" section of docs/PRIVACY.md.
--
-- A phone that has said yes sends at most one message a day for a finished day:
--   {"day":"2026-11-17","v":"0.8.0","a":{"1":1,"10":4},"s":[50,53],"b":[71,81,91]}
-- a = actions and how often, s = settings that are on, b = one range from each bucket set.
-- No id, no time of day, no content. record_usage adds the message to daily totals and keeps nothing else.
--
-- Everything lives in the `usage` schema, which the Data API does not expose: the app can only
-- call public.record_usage, and nobody but the owner (and the read-only usage_reader role) can read.

create schema if not exists usage;
revoke all on schema usage from public, anon, authenticated;

create table usage.metrics (
  id smallint primary key,
  kind text not null check (kind in ('action', 'setting', 'bucket')),
  name text not null
);

-- The list in docs/METRICS.md and src/lib/usage.ts. Ids are never reused.
insert into usage.metrics (id, kind, name) values
  (1,  'action',  'Opened the app'),
  (10, 'action',  'Typed a quick thought'),
  (11, 'action',  'Recorded a voice note'),
  (12, 'action',  'Shared something in'),
  (13, 'action',  'Took a photo or scan'),
  (14, 'action',  'Attached or imported a file'),
  (15, 'action',  'Wrote a titled note'),
  (16, 'action',  'Opened from a widget'),
  (17, 'action',  'Opened from the tile or an icon shortcut'),
  (20, 'action',  'Opened a note'),
  (21, 'action',  'Searched'),
  (22, 'action',  'Opened the map'),
  (23, 'action',  'Finished a to-do'),
  (24, 'action',  'Set a reminder'),
  (25, 'action',  'Opened the weekly review'),
  (26, 'action',  'Opened the month recap'),
  (28, 'action',  'Asked your notes'),
  (29, 'action',  'Opened Chat with Claude or ChatGPT'),
  (30, 'action',  'Finished a focus session'),
  (31, 'action',  'Exported a backup'),
  (32, 'action',  'Restored a backup'),
  (33, 'action',  'Saw the crash screen'),
  (50, 'setting', 'Black theme'),
  (51, 'setting', 'Split home layout'),
  (52, 'setting', 'Map home layout'),
  (53, 'setting', 'Understand meaning on'),
  (54, 'setting', 'Translation on'),
  (55, 'setting', 'App lock on'),
  (56, 'setting', 'Calendar on'),
  (57, 'setting', 'Morning or evening notes on'),
  (58, 'setting', 'Signed in to Engram Cloud'),
  (70, 'bucket',  'Days active in the last 7: 1'),
  (71, 'bucket',  'Days active in the last 7: 2 to 3'),
  (72, 'bucket',  'Days active in the last 7: 4 to 6'),
  (73, 'bucket',  'Days active in the last 7: 7'),
  (80, 'bucket',  'Installed for: under a week'),
  (81, 'bucket',  'Installed for: 1 to 4 weeks'),
  (82, 'bucket',  'Installed for: 1 to 3 months'),
  (83, 'bucket',  'Installed for: longer'),
  (90, 'bucket',  'Notes kept: under 10'),
  (91, 'bucket',  'Notes kept: 10 to 99'),
  (92, 'bucket',  'Notes kept: 100 to 999'),
  (93, 'bucket',  'Notes kept: 1,000 or more');

-- One row per day, app version and metric. Settings and buckets use version '*'.
create table usage.daily (
  day date not null,
  version text not null,
  metric smallint not null references usage.metrics (id),
  uses integer not null default 0,
  installs integer not null default 0,
  primary key (day, version, metric)
);

alter table usage.metrics enable row level security;
alter table usage.daily enable row level security;
revoke all on usage.metrics, usage.daily from public, anon, authenticated;

create or replace function public.record_usage(payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d date;
  v text;
  k text;
  n_text text;
  n integer;
  m smallint;
begin
  if jsonb_typeof(payload) is distinct from 'object' or length(payload::text) > 2000 then
    raise exception 'bad message';
  end if;

  d := (payload->>'day')::date;
  -- A finished day, at most a week old. The phone counts by its own local date, which can be a day ahead of UTC.
  if d is null or d < current_date - 8 or d > current_date + 1 then
    raise exception 'bad day';
  end if;

  v := payload->>'v';
  if v is null or v !~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$' then
    raise exception 'bad version';
  end if;

  if jsonb_typeof(payload->'a') = 'object' then
    for k, n_text in select key, value::text from jsonb_each(payload->'a') loop
      if k !~ '^[0-9]{1,3}$' or n_text !~ '^[0-9]{1,6}$' then continue; end if;
      m := k::smallint;
      n := least(n_text::integer, 500);
      if n < 1 or not exists (select 1 from usage.metrics where id = m and kind = 'action') then continue; end if;
      insert into usage.daily as t (day, version, metric, uses, installs) values (d, v, m, n, 1)
      on conflict (day, version, metric) do update set uses = t.uses + excluded.uses, installs = t.installs + 1;
    end loop;
  end if;

  -- Settings that are on, and one range from each bucket set (the set is the id's tens digit).
  for m in
    select distinct on (case when x.kind = 'bucket' then x.id / 10 else x.id end) x.id
    from jsonb_array_elements_text(coalesce(case when jsonb_typeof(payload->'s') = 'array' then payload->'s' end, '[]'::jsonb)
                                   || coalesce(case when jsonb_typeof(payload->'b') = 'array' then payload->'b' end, '[]'::jsonb)) as e(val)
    join usage.metrics x on e.val ~ '^[0-9]{1,3}$' and x.id = e.val::smallint and x.kind in ('setting', 'bucket')
    order by case when x.kind = 'bucket' then x.id / 10 else x.id end, x.id
  loop
    insert into usage.daily as t (day, version, metric, uses, installs) values (d, '*', m, 0, 1)
    on conflict (day, version, metric) do update set installs = t.installs + 1;
  end loop;
end;
$$;

revoke all on function public.record_usage(jsonb) from public;
grant execute on function public.record_usage(jsonb) to anon, authenticated;

-- Views for reading the numbers. Any figure from fewer than 3 installs is hidden.
create view usage.active_daily as
  select day, version, case when installs < 3 then null else installs end as installs
  from usage.daily where metric = 1;

create view usage.features_7d as
  select m.name, sum(d.installs) as installs, sum(d.uses) as uses
  from usage.daily d join usage.metrics m on m.id = d.metric
  where m.kind = 'action' and m.id <> 1 and d.day >= current_date - 7
  group by m.name
  having sum(d.installs) >= 3
  order by installs desc;

create view usage.features_trend as
  select d.day, m.name, sum(d.installs) as installs, sum(d.uses) as uses
  from usage.daily d join usage.metrics m on m.id = d.metric
  where m.kind = 'action'
  group by d.day, m.name
  having sum(d.installs) >= 3;

create view usage.settings_share as
  select d.day, m.name, d.installs,
         round(100.0 * d.installs / nullif(a.installs, 0)) as percent_of_active
  from usage.daily d
  join usage.metrics m on m.id = d.metric and m.kind = 'setting'
  join (select day, sum(installs) as installs from usage.daily where metric = 1 group by day) a on a.day = d.day
  where a.installs >= 3;

create view usage.buckets as
  select d.day, m.name, d.installs
  from usage.daily d join usage.metrics m on m.id = d.metric and m.kind = 'bucket'
  join (select day, sum(installs) as installs from usage.daily where metric = 1 group by day) a on a.day = d.day
  where a.installs >= 3;

-- A read-only role for a dashboard such as Looker Studio. It cannot log in until the owner gives it a password:
--   alter role usage_reader with login password '<a long random password>';
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'usage_reader') then
    create role usage_reader nologin;
  end if;
end $$;
grant usage on schema usage to usage_reader;
grant select on usage.active_daily, usage.features_7d, usage.features_trend, usage.settings_share, usage.buckets to usage_reader;

-- The kill switch. Off until the owner has tested a release build.
insert into public.feature_flags (key, enabled, description)
values ('metrics', false, 'Usage counts: phones whose owner said yes send one anonymous daily total')
on conflict (key) do nothing;

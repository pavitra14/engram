-- Engram Cloud, phase 1: the optional copy of a person's thoughts.
--
-- Shape: one row per thought, manual link, tag and tag assignment, owned by the
-- signed-in user. The phone reads rows directly (row level security: your own
-- rows only) and writes only through apply_sync_batch(), which checks revisions
-- so two phones cannot silently overwrite each other's note text.
--
-- Not stored here, by design: file contents, device file paths, alarm ids,
-- automatic links, meaning vectors, settings.

create sequence public.sync_seq as bigint;

create table public.thoughts (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 100),
  kind text not null default 'text' check (kind in ('text', 'voice', 'link', 'image', 'video', 'file')),
  title text check (char_length(title) <= 2000),
  body text not null default '' check (char_length(body) <= 500000),
  body_html text check (char_length(body_html) <= 1000000),
  url text check (char_length(url) <= 4000),
  source text,
  duration_ms bigint,
  file_name text,
  mime_type text,
  file_size bigint,
  todo smallint not null default 0,
  remind_at bigint,
  repeat text check (repeat in ('daily', 'weekly', 'monthly')),
  priority smallint not null default 0,
  done_at bigint,
  event_id text,
  event_title text,
  event_at bigint,
  -- The phone's clock, in milliseconds. Kept for display; never used to order changes.
  created_at bigint not null,
  updated_at bigint not null,
  -- Server-side ordering: revision counts accepted changes to this row, seq orders
  -- every change the owner has made across all tables.
  revision bigint not null default 1 check (revision > 0),
  seq bigint not null,
  deleted boolean not null default false,
  server_updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);
create index thoughts_owner_seq on public.thoughts (owner_id, seq);

-- Only links the person made by hand. Automatic links are worked out again on each phone.
create table public.links (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 210),
  a_id text not null,
  b_id text not null,
  weight real not null default 1,
  seq bigint not null,
  deleted boolean not null default false,
  server_updated_at timestamptz not null default now(),
  primary key (owner_id, id),
  check (a_id < b_id)
);
create index links_owner_seq on public.links (owner_id, seq);

create table public.tags (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 100),
  name text not null check (char_length(name) between 1 and 64),
  seq bigint not null,
  deleted boolean not null default false,
  server_updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);
create index tags_owner_seq on public.tags (owner_id, seq);

create table public.thought_tags (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 210),
  thought_id text not null,
  tag_id text not null,
  seq bigint not null,
  deleted boolean not null default false,
  server_updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);
create index thought_tags_owner_seq on public.thought_tags (owner_id, seq);

-- What the server answered to each batch, so a batch sent twice (a lost reply) is applied once.
create table public.sync_receipts (
  owner_id uuid not null references auth.users (id) on delete cascade,
  batch_id text not null check (char_length(batch_id) between 1 and 100),
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, batch_id)
);

alter table public.thoughts enable row level security;
alter table public.links enable row level security;
alter table public.tags enable row level security;
alter table public.thought_tags enable row level security;
alter table public.sync_receipts enable row level security;

revoke all on public.thoughts, public.links, public.tags, public.thought_tags, public.sync_receipts from anon, authenticated;
revoke all on sequence public.sync_seq from anon, authenticated;
grant select on public.thoughts, public.links, public.tags, public.thought_tags to authenticated;

create policy thoughts_read_own on public.thoughts for select to authenticated using ((select auth.uid()) = owner_id);
create policy links_read_own on public.links for select to authenticated using ((select auth.uid()) = owner_id);
create policy tags_read_own on public.tags for select to authenticated using ((select auth.uid()) = owner_id);
create policy thought_tags_read_own on public.thought_tags for select to authenticated using ((select auth.uid()) = owner_id);
-- sync_receipts has no policy: nobody reads it except apply_sync_batch().

-- The only way to write. Runs with the table owner's rights, so every statement
-- names the caller's id explicitly; nothing here trusts an owner sent by the phone.
--
-- p_ops is a list of changes: {"t": table, "id": row id, "del": true|false,
-- "base": the revision the phone last saw (thoughts only), "row": the columns}.
-- Each gets an answer: "ok" (with the new revision), "conflict" (someone else
-- changed this note's words since; the phone keeps its version as a copy), or
-- "gone" (it was deleted elsewhere).
create function public.apply_sync_batch(p_batch_id text, p_ops jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_op jsonb;
  v_row jsonb;
  v_table text;
  v_id text;
  v_del boolean;
  v_base bigint;
  v_results jsonb := '[]'::jsonb;
  v_stored jsonb;
  v_found boolean;
  v_rev bigint;
  v_deleted boolean;
  v_title text;
  v_body text;
  v_html text;
  v_out jsonb;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_batch_id is null or char_length(p_batch_id) not between 1 and 100 then
    raise exception 'bad batch id' using errcode = '22023';
  end if;
  if p_ops is null or jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) > 500 then
    raise exception 'a batch is a list of at most 500 changes' using errcode = '22023';
  end if;

  -- One batch at a time per person, so seq always grows in the order changes commit.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text, 0));

  select r.result into v_stored from public.sync_receipts r where r.owner_id = v_uid and r.batch_id = p_batch_id;
  if found then
    return v_stored;
  end if;

  for v_op in select * from pg_catalog.jsonb_array_elements(p_ops) loop
    v_table := v_op ->> 't';
    v_id := v_op ->> 'id';
    v_del := coalesce((v_op ->> 'del')::boolean, false);
    v_base := (v_op ->> 'base')::bigint;
    v_row := coalesce(v_op -> 'row', '{}'::jsonb);
    if v_id is null or v_id = '' then
      raise exception 'a change has no id' using errcode = '22023';
    end if;

    if v_table = 'thoughts' then
      select t.revision, t.deleted, t.title, t.body, t.body_html
        into v_rev, v_deleted, v_title, v_body, v_html
        from public.thoughts t where t.owner_id = v_uid and t.id = v_id for update;
      v_found := found;
      if v_del then
        if v_found and not v_deleted then
          -- A deleted thought keeps its id and nothing else.
          update public.thoughts t set
            deleted = true, title = null, body = '', body_html = null, url = null, source = null,
            file_name = null, mime_type = null, file_size = null, duration_ms = null,
            event_id = null, event_title = null, event_at = null,
            todo = 0, remind_at = null, repeat = null, priority = 0, done_at = null,
            revision = t.revision + 1, seq = nextval('public.sync_seq'), server_updated_at = now()
          where t.owner_id = v_uid and t.id = v_id;
        end if;
        v_out := jsonb_build_object('s', 'ok');
      elsif not v_found then
        insert into public.thoughts (
          owner_id, id, kind, title, body, body_html, url, source, duration_ms, file_name, mime_type, file_size,
          todo, remind_at, repeat, priority, done_at, event_id, event_title, event_at, created_at, updated_at, revision, seq
        ) values (
          v_uid, v_id, coalesce(v_row ->> 'kind', 'text'), v_row ->> 'title', coalesce(v_row ->> 'body', ''), v_row ->> 'body_html',
          v_row ->> 'url', v_row ->> 'source', (v_row ->> 'duration_ms')::bigint, v_row ->> 'file_name', v_row ->> 'mime_type',
          (v_row ->> 'file_size')::bigint, coalesce((v_row ->> 'todo')::smallint, 0), (v_row ->> 'remind_at')::bigint, v_row ->> 'repeat',
          coalesce((v_row ->> 'priority')::smallint, 0), (v_row ->> 'done_at')::bigint, v_row ->> 'event_id', v_row ->> 'event_title',
          (v_row ->> 'event_at')::bigint, coalesce((v_row ->> 'created_at')::bigint, 0), coalesce((v_row ->> 'updated_at')::bigint, 0),
          1, nextval('public.sync_seq')
        );
        v_out := jsonb_build_object('s', 'ok', 'rev', 1);
      elsif v_deleted then
        -- Deleted on another phone. The deletion stands; the phone keeps its edit as a new note.
        v_out := jsonb_build_object('s', 'gone');
      elsif v_base is distinct from v_rev
        and (coalesce(v_title, ''), v_body, coalesce(v_html, ''))
          is distinct from (coalesce(v_row ->> 'title', ''), coalesce(v_row ->> 'body', ''), coalesce(v_row ->> 'body_html', '')) then
        -- The words changed here since this phone last saw them, and the phone's words differ. Keep the server's.
        v_out := jsonb_build_object('s', 'conflict', 'rev', v_rev);
      else
        update public.thoughts t set
          kind = coalesce(v_row ->> 'kind', t.kind), title = v_row ->> 'title', body = coalesce(v_row ->> 'body', ''),
          body_html = v_row ->> 'body_html', url = v_row ->> 'url', source = v_row ->> 'source',
          duration_ms = (v_row ->> 'duration_ms')::bigint, file_name = v_row ->> 'file_name', mime_type = v_row ->> 'mime_type',
          file_size = (v_row ->> 'file_size')::bigint, todo = coalesce((v_row ->> 'todo')::smallint, 0),
          remind_at = (v_row ->> 'remind_at')::bigint, repeat = v_row ->> 'repeat',
          priority = coalesce((v_row ->> 'priority')::smallint, 0), done_at = (v_row ->> 'done_at')::bigint,
          event_id = v_row ->> 'event_id', event_title = v_row ->> 'event_title', event_at = (v_row ->> 'event_at')::bigint,
          updated_at = coalesce((v_row ->> 'updated_at')::bigint, t.updated_at),
          revision = t.revision + 1, seq = nextval('public.sync_seq'), server_updated_at = now()
        where t.owner_id = v_uid and t.id = v_id
        returning t.revision into v_rev;
        v_out := jsonb_build_object('s', 'ok', 'rev', v_rev);
      end if;

    elsif v_table = 'links' then
      if v_del then
        update public.links l set deleted = true, seq = nextval('public.sync_seq'), server_updated_at = now()
        where l.owner_id = v_uid and l.id = v_id and not l.deleted;
      else
        insert into public.links (owner_id, id, a_id, b_id, weight, seq)
        values (v_uid, v_id, v_row ->> 'a_id', v_row ->> 'b_id', coalesce((v_row ->> 'weight')::real, 1), nextval('public.sync_seq'))
        on conflict (owner_id, id) do update set
          weight = excluded.weight, deleted = false, seq = excluded.seq, server_updated_at = now();
      end if;
      v_out := jsonb_build_object('s', 'ok');

    elsif v_table = 'tags' then
      if v_del then
        update public.tags g set deleted = true, seq = nextval('public.sync_seq'), server_updated_at = now()
        where g.owner_id = v_uid and g.id = v_id and not g.deleted;
      else
        insert into public.tags (owner_id, id, name, seq)
        values (v_uid, v_id, v_row ->> 'name', nextval('public.sync_seq'))
        on conflict (owner_id, id) do update set
          name = excluded.name, deleted = false, seq = excluded.seq, server_updated_at = now();
      end if;
      v_out := jsonb_build_object('s', 'ok');

    elsif v_table = 'thought_tags' then
      if v_del then
        update public.thought_tags x set deleted = true, seq = nextval('public.sync_seq'), server_updated_at = now()
        where x.owner_id = v_uid and x.id = v_id and not x.deleted;
      else
        insert into public.thought_tags (owner_id, id, thought_id, tag_id, seq)
        values (v_uid, v_id, v_row ->> 'thought_id', v_row ->> 'tag_id', nextval('public.sync_seq'))
        on conflict (owner_id, id) do update set
          deleted = false, seq = excluded.seq, server_updated_at = now();
      end if;
      v_out := jsonb_build_object('s', 'ok');

    else
      raise exception 'unknown table in a change' using errcode = '22023';
    end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object('t', v_table, 'id', v_id) || v_out);
  end loop;

  v_stored := jsonb_build_object('results', v_results);
  insert into public.sync_receipts (owner_id, batch_id, result) values (v_uid, p_batch_id, v_stored);
  delete from public.sync_receipts r where r.owner_id = v_uid and r.created_at < now() - interval '30 days';
  return v_stored;
end;
$$;

-- Everything of the caller's that changed after p_after, oldest first. Runs with
-- the caller's own rights, so row level security applies as well as the filter.
create function public.pull_changes(p_after bigint, p_limit integer default 500)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with lim as (select least(greatest(coalesce(p_limit, 500), 1), 1000) as n),
  changed as (
    select th.seq, (to_jsonb(th) - 'owner_id' - 'server_updated_at') || jsonb_build_object('t', 'thoughts') as d
      from public.thoughts th where th.owner_id = (select auth.uid()) and th.seq > coalesce(p_after, 0)
    union all
    select l.seq, (to_jsonb(l) - 'owner_id' - 'server_updated_at') || jsonb_build_object('t', 'links')
      from public.links l where l.owner_id = (select auth.uid()) and l.seq > coalesce(p_after, 0)
    union all
    select g.seq, (to_jsonb(g) - 'owner_id' - 'server_updated_at') || jsonb_build_object('t', 'tags')
      from public.tags g where g.owner_id = (select auth.uid()) and g.seq > coalesce(p_after, 0)
    union all
    select x.seq, (to_jsonb(x) - 'owner_id' - 'server_updated_at') || jsonb_build_object('t', 'thought_tags')
      from public.thought_tags x where x.owner_id = (select auth.uid()) and x.seq > coalesce(p_after, 0)
  ),
  page as (select c.seq, c.d from changed c order by c.seq limit (select n from lim))
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(page.d order by page.seq), '[]'::jsonb),
    'cursor', coalesce(max(page.seq), coalesce(p_after, 0)),
    'more', count(*) >= (select n from lim)
  ) from page;
$$;

-- Removes the caller's whole cloud copy. Their phone keeps everything.
create function public.delete_my_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  delete from public.thought_tags x where x.owner_id = v_uid;
  delete from public.tags g where g.owner_id = v_uid;
  delete from public.links l where l.owner_id = v_uid;
  delete from public.thoughts t where t.owner_id = v_uid;
  delete from public.sync_receipts r where r.owner_id = v_uid;
end;
$$;

revoke all on function public.apply_sync_batch(text, jsonb) from public, anon;
revoke all on function public.pull_changes(bigint, integer) from public, anon;
revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.apply_sync_batch(text, jsonb) to authenticated;
grant execute on function public.pull_changes(bigint, integer) to authenticated;
grant execute on function public.delete_my_data() to authenticated;

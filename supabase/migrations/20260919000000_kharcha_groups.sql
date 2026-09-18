-- Evenly shared groups (phase 1)
-- Run once in Supabase → SQL Editor, after 20260915000000_kharcha_sync.sql.
--
-- Groups, members and invites are relational and protected by RLS + server functions.
-- Shared expenses and payments live in group_records as JSON documents with the same
-- last-write-wins + revision design as personal sync. Every accepted write is logged in group_activity.

-- ───────────────────────── Tables ─────────────────────────

create table if not exists public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url   text,
  upi_id       text check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,64}$'),
  updated_at   timestamptz not null default now()
);

create table if not exists public.groups (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 60),
  kind           text not null default 'other' check (kind in ('home', 'trip', 'couple', 'work', 'friends', 'other')),
  simplify_debts boolean not null default true,
  created_by     uuid not null references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.group_members (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  user_id      uuid references auth.users (id) on delete set null, -- null = added by name, not joined yet
  display_name text not null check (char_length(display_name) between 1 and 60),
  role         text not null default 'member' check (role in ('owner', 'member')),
  joined_at    timestamptz,
  left_at      timestamptz,
  created_at   timestamptz not null default now(),
  unique (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members (user_id);
create index if not exists group_members_group_idx on public.group_members (group_id);

create table if not exists public.group_invites (
  token      text primary key,
  group_id   uuid not null references public.groups (id) on delete cascade,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  max_uses   integer,
  uses       integer not null default 0,
  revoked_at timestamptz
);

create sequence if not exists public.group_records_rev_seq;

create table if not exists public.group_records (
  group_id          uuid not null references public.groups (id) on delete cascade,
  kind              text not null check (kind in ('expense', 'settlement')),
  id                text not null,
  data              jsonb,
  deleted           boolean not null default false,
  client_updated_at bigint not null,
  rev               bigint not null default nextval('public.group_records_rev_seq'),
  updated_by        uuid references auth.users (id) on delete set null,
  server_updated_at timestamptz not null default now(),
  primary key (group_id, kind, id)
);
create index if not exists group_records_group_rev_idx on public.group_records (group_id, rev);

create table if not exists public.group_activity (
  id         bigint generated always as identity primary key,
  group_id   uuid not null references public.groups (id) on delete cascade,
  actor      uuid references auth.users (id) on delete set null,
  action     text not null,
  record_id  text,
  summary    jsonb,
  created_at timestamptz not null default now()
);
create index if not exists group_activity_group_idx on public.group_activity (group_id, id desc);

-- ───────────────────────── Membership helpers ─────────────────────────
-- security definer so RLS policies can use them without recursing into group_members' own policy.

create or replace function public.is_group_member(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = p_group and m.user_id = (select auth.uid()) and m.left_at is null
  )
$$;

create or replace function public.shares_group_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members a
    join public.group_members b on b.group_id = a.group_id
    where a.user_id = (select auth.uid()) and a.left_at is null and b.user_id = p_user
  )
$$;

create or replace function public.kharcha_require_member(p_group uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_member uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  select m.id into v_member from public.group_members m
  where m.group_id = p_group and m.user_id = auth.uid() and m.left_at is null;
  if v_member is null then
    raise exception 'You are not a member of this group' using errcode = '42501';
  end if;
  return v_member;
end;
$$;

create or replace function public.kharcha_valid_invite(p_token text) returns public.group_invites
language plpgsql stable security definer set search_path = '' as $$
declare
  v_inv public.group_invites;
begin
  select * into v_inv from public.group_invites where token = p_token;
  if not found or v_inv.revoked_at is not null then
    raise exception 'This invite link is not valid' using errcode = 'P0002';
  end if;
  if v_inv.expires_at is not null and v_inv.expires_at < now() then
    raise exception 'This invite link has expired. Ask for a new one.' using errcode = 'P0002';
  end if;
  if v_inv.max_uses is not null and v_inv.uses >= v_inv.max_uses then
    raise exception 'This invite link has already been used up' using errcode = 'P0002';
  end if;
  return v_inv;
end;
$$;

-- ───────────────────────── Row Level Security ─────────────────────────

alter table public.profiles       enable row level security;
alter table public.groups         enable row level security;
alter table public.group_members  enable row level security;
alter table public.group_invites  enable row level security;
alter table public.group_records  enable row level security;
alter table public.group_activity enable row level security;

drop policy if exists "Profiles: read self or group mates" on public.profiles;
create policy "Profiles: read self or group mates" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()) or public.shares_group_with(user_id));
drop policy if exists "Profiles: insert own" on public.profiles;
create policy "Profiles: insert own" on public.profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Profiles: update own" on public.profiles;
create policy "Profiles: update own" on public.profiles
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "Groups: members read" on public.groups;
create policy "Groups: members read" on public.groups
  for select to authenticated using (public.is_group_member(id));
drop policy if exists "Group members: members read" on public.group_members;
create policy "Group members: members read" on public.group_members
  for select to authenticated using (public.is_group_member(group_id));
drop policy if exists "Group invites: members read" on public.group_invites;
create policy "Group invites: members read" on public.group_invites
  for select to authenticated using (public.is_group_member(group_id));
drop policy if exists "Group records: members read" on public.group_records;
create policy "Group records: members read" on public.group_records
  for select to authenticated using (public.is_group_member(group_id));
drop policy if exists "Group activity: members read" on public.group_activity;
create policy "Group activity: members read" on public.group_activity
  for select to authenticated using (public.is_group_member(group_id));

revoke all on public.profiles, public.groups, public.group_members, public.group_invites,
              public.group_records, public.group_activity from anon, authenticated;
grant select on public.profiles, public.groups, public.group_members, public.group_invites,
                 public.group_records, public.group_activity to authenticated;
grant insert, update on public.profiles to authenticated;

-- ───────────────────────── Server functions (all writes go through these) ─────────────────────────

create or replace function public.create_group(p_name text, p_kind text, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_group uuid;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  insert into public.groups (name, kind, created_by)
  values (btrim(p_name), coalesce(nullif(p_kind, ''), 'other'), v_uid)
  returning id into v_group;
  insert into public.group_members (group_id, user_id, display_name, role, joined_at)
  values (v_group, v_uid, left(btrim(coalesce(nullif(btrim(p_display_name), ''), 'Me')), 60), 'owner', now());
  insert into public.group_activity (group_id, actor, action, summary)
  values (v_group, v_uid, 'group.created', jsonb_build_object('name', btrim(p_name)));
  return v_group;
end;
$$;

create or replace function public.update_group(p_group uuid, p_name text, p_kind text, p_simplify boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.kharcha_require_member(p_group);
  update public.groups set
    name = coalesce(nullif(btrim(p_name), ''), name),
    kind = coalesce(p_kind, kind),
    simplify_debts = coalesce(p_simplify, simplify_debts),
    updated_at = now()
  where id = p_group;
  insert into public.group_activity (group_id, actor, action, summary)
  values (p_group, auth.uid(), 'group.updated', jsonb_build_object('name', p_name, 'simplify', p_simplify));
end;
$$;

create or replace function public.add_placeholder(p_group uuid, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid;
begin
  perform public.kharcha_require_member(p_group);
  if (select count(*) from public.group_members where group_id = p_group and left_at is null) >= 50 then
    raise exception 'A group can have at most 50 people' using errcode = 'P0001';
  end if;
  insert into public.group_members (group_id, user_id, display_name, role)
  values (p_group, null, left(btrim(p_name), 60), 'member')
  returning id into v_member;
  insert into public.group_activity (group_id, actor, action, record_id, summary)
  values (p_group, auth.uid(), 'member.added', v_member::text, jsonb_build_object('name', btrim(p_name)));
  return v_member;
end;
$$;

create or replace function public.remove_member(p_member uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_target public.group_members;
begin
  select * into v_target from public.group_members where id = p_member;
  if not found then raise exception 'Member not found' using errcode = 'P0002'; end if;
  perform public.kharcha_require_member(v_target.group_id);
  if v_target.user_id is not null and v_target.user_id <> auth.uid() and not exists (
    select 1 from public.group_members
    where group_id = v_target.group_id and user_id = auth.uid() and role = 'owner' and left_at is null
  ) then
    raise exception 'Only the group owner can remove someone who has joined' using errcode = '42501';
  end if;
  update public.group_members set left_at = now() where id = p_member;
  insert into public.group_activity (group_id, actor, action, record_id, summary)
  values (v_target.group_id, auth.uid(), 'member.removed', p_member::text, jsonb_build_object('name', v_target.display_name));
end;
$$;

create or replace function public.leave_group(p_group uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid;
begin
  v_member := public.kharcha_require_member(p_group);
  update public.group_members set left_at = now() where id = v_member;
  insert into public.group_activity (group_id, actor, action, record_id)
  values (p_group, auth.uid(), 'member.left', v_member::text);
end;
$$;

create or replace function public.create_invite(p_group uuid, p_days integer default 30)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_token text;
begin
  perform public.kharcha_require_member(p_group);
  v_token := replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  insert into public.group_invites (token, group_id, created_by, expires_at)
  values (v_token, p_group, auth.uid(), case when p_days is null then null else now() + make_interval(days => p_days) end);
  return v_token;
end;
$$;

create or replace function public.revoke_invite(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.group_invites set revoked_at = now()
  where token = p_token and public.is_group_member(group_id);
end;
$$;

create or replace function public.preview_invite(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_inv public.group_invites;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  v_inv := public.kharcha_valid_invite(p_token);
  return (
    select jsonb_build_object(
      'group_id', g.id,
      'name', g.name,
      'kind', g.kind,
      'already_member', exists (
        select 1 from public.group_members
        where group_id = g.id and user_id = auth.uid() and left_at is null
      ),
      'members', coalesce((
        select jsonb_agg(jsonb_build_object('id', m.id, 'display_name', m.display_name, 'placeholder', m.user_id is null) order by m.created_at)
        from public.group_members m where m.group_id = g.id and m.left_at is null
      ), '[]'::jsonb)
    )
    from public.groups g where g.id = v_inv.group_id
  );
end;
$$;

create or replace function public.join_group(p_token text, p_claim uuid default null, p_display_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.group_invites;
  v_existing public.group_members;
  v_name text;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  v_inv := public.kharcha_valid_invite(p_token);

  select * into v_existing from public.group_members where group_id = v_inv.group_id and user_id = v_uid;
  if found then
    if v_existing.left_at is not null then
      update public.group_members set left_at = null, joined_at = now() where id = v_existing.id;
      insert into public.group_activity (group_id, actor, action, record_id, summary)
      values (v_inv.group_id, v_uid, 'member.joined', v_existing.id::text, jsonb_build_object('name', v_existing.display_name));
    end if;
    return v_inv.group_id;
  end if;

  if (select count(*) from public.group_members where group_id = v_inv.group_id and left_at is null) >= 50 then
    raise exception 'This group is full' using errcode = 'P0001';
  end if;

  if p_claim is not null then
    update public.group_members set user_id = v_uid, joined_at = now()
    where id = p_claim and group_id = v_inv.group_id and user_id is null and left_at is null
    returning display_name into v_name;
    if not found then
      raise exception 'That person has already joined. Choose "I''m new" instead.' using errcode = 'P0001';
    end if;
  else
    v_name := left(btrim(coalesce(nullif(btrim(p_display_name), ''), 'Member')), 60);
    insert into public.group_members (group_id, user_id, display_name, joined_at)
    values (v_inv.group_id, v_uid, v_name, now());
  end if;

  update public.group_invites set uses = uses + 1 where token = p_token;
  insert into public.group_activity (group_id, actor, action, summary)
  values (v_inv.group_id, v_uid, 'member.joined', jsonb_build_object('name', v_name));
  return v_inv.group_id;
end;
$$;

-- Batch upsert of shared expenses/payments with last-write-wins; logs each accepted change.
create or replace function public.group_push(p_group uuid, p_records jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_applied integer;
begin
  perform public.kharcha_require_member(p_group);

  with incoming as (
    select r.kind, r.id, r.data, coalesce(r.deleted, false) as deleted, r.client_updated_at
    from jsonb_to_recordset(p_records) as r(kind text, id text, data jsonb, deleted boolean, client_updated_at bigint)
  ),
  upserted as (
    insert into public.group_records as k (group_id, kind, id, data, deleted, client_updated_at, updated_by)
    select p_group, i.kind, i.id, i.data, i.deleted, i.client_updated_at, v_uid from incoming i
    on conflict (group_id, kind, id) do update
      set data              = coalesce(excluded.data, k.data),
          deleted           = excluded.deleted,
          client_updated_at = excluded.client_updated_at,
          rev               = nextval('public.group_records_rev_seq'),
          updated_by        = excluded.updated_by,
          server_updated_at = now()
      where excluded.client_updated_at >= k.client_updated_at
    returning k.kind, k.id, k.data, k.deleted, (k.xmax = 0) as inserted
  ),
  logged as (
    insert into public.group_activity (group_id, actor, action, record_id, summary)
    select p_group, v_uid,
           u.kind || '.' || case when u.deleted then 'deleted' when u.inserted then 'created' else 'updated' end,
           u.id,
           jsonb_build_object('title', u.data ->> 'title', 'amount', u.data -> 'amount',
                              'from', u.data -> 'from', 'to', u.data -> 'to', 'status', u.data -> 'status')
    from upserted u
    returning 1
  )
  select count(*)::integer into v_applied from logged;

  return v_applied;
end;
$$;

-- ───────────────────────── Function permissions ─────────────────────────

revoke execute on function public.is_group_member(uuid), public.shares_group_with(uuid) from public, anon;
grant execute on function public.is_group_member(uuid), public.shares_group_with(uuid) to authenticated;

revoke execute on function public.kharcha_require_member(uuid), public.kharcha_valid_invite(text) from public, anon, authenticated;

revoke execute on function
  public.create_group(text, text, text), public.update_group(uuid, text, text, boolean),
  public.add_placeholder(uuid, text), public.remove_member(uuid), public.leave_group(uuid),
  public.create_invite(uuid, integer), public.revoke_invite(text), public.preview_invite(text),
  public.join_group(text, uuid, text), public.group_push(uuid, jsonb)
from public, anon;
grant execute on function
  public.create_group(text, text, text), public.update_group(uuid, text, text, boolean),
  public.add_placeholder(uuid, text), public.remove_member(uuid), public.leave_group(uuid),
  public.create_invite(uuid, integer), public.revoke_invite(text), public.preview_invite(text),
  public.join_group(text, uuid, text), public.group_push(uuid, jsonb)
to authenticated;

-- ───────────────────────── Realtime ─────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array['group_records', 'group_members', 'groups'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

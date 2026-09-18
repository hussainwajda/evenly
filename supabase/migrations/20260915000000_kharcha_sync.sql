-- Evenly cloud sync
-- Run once in Supabase → SQL Editor (or `supabase db push`).
--
-- One row per local record. The app is offline-first: IndexedDB on the phone is the working copy;
-- this table is the per-user cloud copy used for backup and multi-device sync.
-- Conflicts: last write wins by the device's change time (client_updated_at, epoch ms).
-- Every accepted write gets a new `rev` so devices can pull "everything since rev N".

create sequence if not exists public.kharcha_records_rev_seq;

create table if not exists public.kharcha_records (
  user_id           uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  table_name        text        not null check (table_name in (
                      'settings', 'categories', 'paymentMethods', 'budgets', 'transactions',
                      'people', 'ledger', 'recurring', 'importBatches')),
  id                text        not null,
  data              jsonb,
  deleted           boolean     not null default false,
  client_updated_at bigint      not null,
  rev               bigint      not null default nextval('public.kharcha_records_rev_seq'),
  server_updated_at timestamptz not null default now(),
  primary key (user_id, table_name, id)
);

create index if not exists kharcha_records_user_rev_idx on public.kharcha_records (user_id, rev);

-- Row Level Security: each Google account only ever sees and changes its own rows.
alter table public.kharcha_records enable row level security;

drop policy if exists "Own records: select" on public.kharcha_records;
create policy "Own records: select" on public.kharcha_records
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Own records: insert" on public.kharcha_records;
create policy "Own records: insert" on public.kharcha_records
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Own records: update" on public.kharcha_records;
create policy "Own records: update" on public.kharcha_records
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Own records: delete" on public.kharcha_records;
create policy "Own records: delete" on public.kharcha_records
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.kharcha_records from anon;
grant select, insert, update, delete on public.kharcha_records to authenticated;
grant usage, select on sequence public.kharcha_records_rev_seq to authenticated;

-- Batch upsert with last-write-wins. Runs as the calling user, so RLS still applies.
create or replace function public.kharcha_push(records jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  applied integer;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  with incoming as (
    select r.table_name, r.id, r.data, coalesce(r.deleted, false) as deleted, r.client_updated_at
    from jsonb_to_recordset(records) as r(table_name text, id text, data jsonb, deleted boolean, client_updated_at bigint)
  ),
  upserted as (
    insert into public.kharcha_records as k (user_id, table_name, id, data, deleted, client_updated_at)
    select uid, i.table_name, i.id, case when i.deleted then null else i.data end, i.deleted, i.client_updated_at
    from incoming i
    on conflict (user_id, table_name, id) do update
      set data              = excluded.data,
          deleted           = excluded.deleted,
          client_updated_at = excluded.client_updated_at,
          rev               = nextval('public.kharcha_records_rev_seq'),
          server_updated_at = now()
      where excluded.client_updated_at >= k.client_updated_at
    returning 1
  )
  select count(*)::integer into applied from upserted;

  return applied;
end;
$$;

revoke execute on function public.kharcha_push(jsonb) from public, anon;
grant execute on function public.kharcha_push(jsonb) to authenticated;

-- Realtime: lets other signed-in devices know to pull straight away.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kharcha_records'
  ) then
    alter publication supabase_realtime add table public.kharcha_records;
  end if;
end;
$$;

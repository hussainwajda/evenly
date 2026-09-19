-- Evenly: clearer balances & payment history
-- Run once in Supabase → SQL Editor, after 20260919000000_kharcha_groups.sql. Safe to run again.
--
-- 1. Simplify debts is off by default, and existing groups are switched to direct balances
--    (anyone can still turn it on for a group from the group's ⋮ menu).
-- 2. The server enforces who may change a payment:
--      • only the receiver can confirm a payment or mark it "not received";
--      • only the person who recorded it, or the receiver, can edit, delete or restore it;
--      • a new payment can be recorded as already confirmed only by its receiver.
--    Changes that break these rules are skipped, not stored.
-- 3. The activity log keeps more detail per payment (method, bill, previous amount and status),
--    so every payment's history can be shown.

-- ───────────────────────── 1. Simplify off by default ─────────────────────────

alter table public.groups alter column simplify_debts set default false;
update public.groups set simplify_debts = false where simplify_debts;

-- ───────────────────────── 2. Payment rules ─────────────────────────

create or replace function public.evenly_can_manage_payment(p_me text, p_old jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select p_me is not null and (
    p_old ->> 'to' = p_me
    or p_old ->> 'createdBy' = p_me
    -- payments recorded before history existed don't say who recorded them: either side may
    or (coalesce(p_old ->> 'createdBy', '') = '' and p_old ->> 'from' = p_me)
  )
$$;

create or replace function public.evenly_payment_change_ok(
  p_me text, p_old jsonb, p_old_deleted boolean, p_new jsonb, p_new_deleted boolean
) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  v_new jsonb := coalesce(p_new, p_old);
  v_ignore text[] := array['status', 'history', 'updatedAt', 'deletedAt'];
begin
  if p_me is null then return false; end if;

  if p_old is null then
    -- New payment: may only start out confirmed when the receiver records it.
    return coalesce(v_new ->> 'status', 'recorded') <> 'confirmed' or v_new ->> 'to' = p_me;
  end if;

  if (v_new ->> 'status') is distinct from (p_old ->> 'status') and p_old ->> 'to' <> p_me then
    return false;
  end if;

  if p_new_deleted is distinct from p_old_deleted
     or (v_new - v_ignore) is distinct from (p_old - v_ignore) then
    return public.evenly_can_manage_payment(p_me, p_old);
  end if;

  return true;
end;
$$;

-- ───────────────────────── 3. group_push with rules + richer activity ─────────────────────────

create or replace function public.group_push(p_group uuid, p_records jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_me text := public.kharcha_require_member(p_group)::text;
  v_applied integer;
begin
  with incoming as (
    select r.kind, r.id, r.data, coalesce(r.deleted, false) as deleted, r.client_updated_at
    from jsonb_to_recordset(p_records) as r(kind text, id text, data jsonb, deleted boolean, client_updated_at bigint)
  ),
  prior as (
    select k.kind, k.id, k.data, k.deleted
    from public.group_records k
    join incoming i on i.kind = k.kind and i.id = k.id
    where k.group_id = p_group
  ),
  allowed as (
    select i.*
    from incoming i
    left join prior b on b.kind = i.kind and b.id = i.id
    where i.kind <> 'settlement'
       or public.evenly_payment_change_ok(v_me, b.data, b.deleted, i.data, i.deleted)
  ),
  upserted as (
    insert into public.group_records as k (group_id, kind, id, data, deleted, client_updated_at, updated_by)
    select p_group, a.kind, a.id, a.data, a.deleted, a.client_updated_at, v_uid from allowed a
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
           u.kind || '.' || case
             when u.deleted and not coalesce(b.deleted, false) then 'deleted'
             when u.deleted then 'updated'
             when coalesce(b.deleted, false) then 'restored'
             when u.inserted then 'created'
             else 'updated' end,
           u.id,
           jsonb_strip_nulls(jsonb_build_object(
             'title', u.data ->> 'title', 'amount', u.data -> 'amount',
             'from', u.data -> 'from', 'to', u.data -> 'to', 'status', u.data -> 'status',
             'method', u.data -> 'method', 'expenseId', u.data -> 'expenseId',
             'prevAmount', case when (b.data -> 'amount') is distinct from (u.data -> 'amount') then b.data -> 'amount' end,
             'prevStatus', case when (b.data -> 'status') is distinct from (u.data -> 'status') then b.data -> 'status' end))
    from upserted u
    left join prior b on b.kind = u.kind and b.id = u.id
    returning 1
  )
  select count(*)::integer into v_applied from logged;

  return v_applied;
end;
$$;

revoke execute on function public.evenly_can_manage_payment(text, jsonb),
  public.evenly_payment_change_ok(text, jsonb, boolean, jsonb, boolean) from public, anon;
grant execute on function public.evenly_can_manage_payment(text, jsonb),
  public.evenly_payment_change_ok(text, jsonb, boolean, jsonb, boolean) to authenticated;

-- Fast lookup of one record's history.
create index if not exists group_activity_record_idx on public.group_activity (group_id, record_id, id);

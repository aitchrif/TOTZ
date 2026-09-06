begin;

create or replace function public.forge_claim_entry_write_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.forge_claim_epochs
  where id = new.epoch_id
  for update;

  if v_status is null then
    raise exception 'FORGE epoch not found' using errcode = '23503';
  end if;
  if v_status <> 'uploading' then
    raise exception 'FORGE claim entries are immutable after publication' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists forge_claim_entries_write_guard on public.forge_claim_entries;
create trigger forge_claim_entries_write_guard
before insert or update on public.forge_claim_entries
for each row execute function public.forge_claim_entry_write_guard();

create or replace function public.forge_finalize_claim_epoch(
  p_epoch_id uuid,
  p_expected_entries integer,
  p_expected_total text
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_eligible integer;
  v_committed_total text;
  v_count bigint;
  v_sum numeric;
begin
  if p_expected_entries is null or p_expected_entries < 1 or p_expected_entries > 20000 then
    raise exception 'Invalid expected entry count' using errcode = '22023';
  end if;
  if p_expected_total is null or p_expected_total !~ '^[0-9]+$' or p_expected_total::numeric <= 0 then
    raise exception 'Invalid expected allocation total' using errcode = '22023';
  end if;

  select status, eligible_wallets, total_allocated_units
    into v_status, v_eligible, v_committed_total
  from public.forge_claim_epochs
  where id = p_epoch_id
  for update;

  if not found then return false; end if;
  if v_status <> 'uploading' then return false; end if;
  if v_eligible <> p_expected_entries or v_committed_total <> p_expected_total then
    raise exception 'Epoch commitment changed before finalization' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.forge_claim_entries
    where epoch_id = p_epoch_id and amount_units !~ '^[0-9]+$'
  ) then
    raise exception 'Invalid stored allocation units' using errcode = '22023';
  end if;

  select count(*), coalesce(sum(amount_units::numeric), 0)
    into v_count, v_sum
  from public.forge_claim_entries
  where epoch_id = p_epoch_id;

  if v_count <> p_expected_entries or v_sum <> p_expected_total::numeric then
    raise exception 'Stored claim package does not match committed count/total' using errcode = '55000';
  end if;

  update public.forge_claim_epochs
  set status = 'published', published_at = now(), uploaded_entries = v_count::integer
  where id = p_epoch_id and status = 'uploading';

  if not found then return false; end if;
  return true;
end;
$$;

revoke all on function public.forge_finalize_claim_epoch(uuid,integer,text) from public;
revoke all on function public.forge_finalize_claim_epoch(uuid,integer,text) from anon;
revoke all on function public.forge_finalize_claim_epoch(uuid,integer,text) from authenticated;
grant execute on function public.forge_finalize_claim_epoch(uuid,integer,text) to service_role;

commit;

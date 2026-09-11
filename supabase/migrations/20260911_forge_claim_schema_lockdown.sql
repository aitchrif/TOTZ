-- Canonical FORGE claim database guards captured in source control for release review.
-- This migration is intentionally fail-closed and does not enable Mainnet writes.

alter table public.forge_claim_epochs enable row level security;
alter table public.forge_claim_entries enable row level security;
alter table public.forge_claim_provenance_authorizations enable row level security;
alter table public.forge_release_flags enable row level security;
alter table public.forge_release_config enable row level security;

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

create or replace function public.forge_enforce_claim_release_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mainnet_enabled boolean := false;
  release_mode text := 'locked';
  canary_sponsor text := '';
  canary_max_wallets integer := 0;
  canary_expires_raw text := '';
  canary_expires_at timestamptz;
begin
  if new.claim_chain_id not in (46630, 4663) then
    raise exception 'Unsupported FORGE claim chain %.', new.claim_chain_id
      using errcode = '22023';
  end if;

  if new.claim_chain_id = 4663 then
    select enabled into mainnet_enabled
    from public.forge_release_flags
    where key = 'mainnet_claims_enabled';

    if coalesce(mainnet_enabled, false) is not true then
      raise exception 'FORGE mainnet claims are locked by the production release gate.' using errcode = '42501';
    end if;

    select lower(trim(value)) into release_mode
    from public.forge_release_config
    where key = 'mainnet_release_mode';
    release_mode := coalesce(nullif(release_mode, ''), 'locked');

    if release_mode = 'locked' then
      raise exception 'FORGE mainnet release mode is locked.' using errcode = '42501';
    elsif release_mode = 'canary' then
      select lower(trim(value)) into canary_sponsor
      from public.forge_release_config
      where key = 'mainnet_canary_sponsor';

      select case when trim(value) ~ '^[0-9]+$' then trim(value)::integer else 0 end
      into canary_max_wallets
      from public.forge_release_config
      where key = 'mainnet_canary_max_wallets';

      select trim(value) into canary_expires_raw
      from public.forge_release_config
      where key = 'mainnet_canary_expires_at';

      canary_sponsor := coalesce(canary_sponsor, '');
      canary_max_wallets := coalesce(canary_max_wallets, 0);
      canary_expires_raw := coalesce(canary_expires_raw, '');

      if canary_sponsor !~ '^0x[0-9a-f]{40}$' then
        raise exception 'FORGE mainnet Canary sponsor is not configured.' using errcode = '42501';
      end if;
      if lower(coalesce(new.creator_wallet, '')) <> canary_sponsor then
        raise exception 'FORGE mainnet Canary is restricted to the configured sponsor wallet.' using errcode = '42501';
      end if;
      if canary_max_wallets < 1 or canary_max_wallets > 100 then
        raise exception 'FORGE mainnet Canary wallet limit is invalid.' using errcode = '42501';
      end if;
      if coalesce(new.eligible_wallets, 0) < 1 or new.eligible_wallets > canary_max_wallets then
        raise exception 'FORGE mainnet Canary exceeds the configured wallet limit (%).', canary_max_wallets using errcode = '42501';
      end if;
      if canary_expires_raw = '' then
        raise exception 'FORGE mainnet Canary expiry is not configured.' using errcode = '42501';
      end if;
      begin
        canary_expires_at := canary_expires_raw::timestamptz;
      exception when others then
        raise exception 'FORGE mainnet Canary expiry is invalid.' using errcode = '42501';
      end;
      if canary_expires_at <= now() then
        raise exception 'FORGE mainnet Canary authorization has expired.' using errcode = '42501';
      end if;
      if canary_expires_at > now() + interval '24 hours' then
        raise exception 'FORGE mainnet Canary authorization cannot exceed 24 hours.' using errcode = '42501';
      end if;
    elsif release_mode <> 'public' then
      raise exception 'FORGE mainnet release mode is invalid.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- Sensitive claim writes are server-only. RLS is retained as a second boundary.
revoke all on table public.forge_claim_provenance_authorizations from anon, authenticated;
revoke insert, update, delete, truncate on table public.forge_claim_epochs from anon, authenticated;
revoke insert, update, delete, truncate on table public.forge_claim_entries from anon, authenticated;
revoke insert, update, delete, truncate on table public.forge_release_flags from anon, authenticated;
revoke insert, update, delete, truncate on table public.forge_release_config from anon, authenticated;

revoke execute on function public.forge_claim_entry_write_guard() from public, anon, authenticated;
revoke execute on function public.forge_enforce_claim_release_gate() from public, anon, authenticated;
revoke execute on function public.forge_apply_claim_provenance_authorization() from public, anon, authenticated;
revoke execute on function public.forge_finalize_claim_epoch(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.forge_finalize_claim_epoch(uuid, integer, text) to service_role;

drop trigger if exists forge_claim_entries_write_guard on public.forge_claim_entries;
create trigger forge_claim_entries_write_guard
before insert or update on public.forge_claim_entries
for each row execute function public.forge_claim_entry_write_guard();

drop trigger if exists forge_claim_epoch_release_gate on public.forge_claim_epochs;
create trigger forge_claim_epoch_release_gate
before insert or update of claim_chain_id, creator_wallet, eligible_wallets on public.forge_claim_epochs
for each row execute function public.forge_enforce_claim_release_gate();

drop trigger if exists forge_claim_epoch_provenance_gate on public.forge_claim_epochs;
create trigger forge_claim_epoch_provenance_gate
before insert on public.forge_claim_epochs
for each row execute function public.forge_apply_claim_provenance_authorization();

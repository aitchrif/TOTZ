-- TOTZ FORGE Mainnet Canary expiry.
-- Canary authorization must be explicitly time-bounded. This migration remains
-- fail-closed by default: the expiry value is blank until an operator prepares
-- a Canary while the master release gate is still OFF.

insert into public.forge_release_config (key, value)
values ('mainnet_canary_expires_at', '')
on conflict (key) do nothing;

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
    select enabled
      into mainnet_enabled
      from public.forge_release_flags
     where key = 'mainnet_claims_enabled';

    if coalesce(mainnet_enabled, false) is not true then
      raise exception 'FORGE mainnet claims are locked by the production release gate.'
        using errcode = '42501';
    end if;

    select lower(trim(value))
      into release_mode
      from public.forge_release_config
     where key = 'mainnet_release_mode';

    release_mode := coalesce(nullif(release_mode, ''), 'locked');

    if release_mode = 'locked' then
      raise exception 'FORGE mainnet release mode is locked.'
        using errcode = '42501';
    elsif release_mode = 'canary' then
      select lower(trim(value))
        into canary_sponsor
        from public.forge_release_config
       where key = 'mainnet_canary_sponsor';

      select case
               when trim(value) ~ '^[0-9]+$' then trim(value)::integer
               else 0
             end
        into canary_max_wallets
        from public.forge_release_config
       where key = 'mainnet_canary_max_wallets';

      select trim(value)
        into canary_expires_raw
        from public.forge_release_config
       where key = 'mainnet_canary_expires_at';

      canary_sponsor := coalesce(canary_sponsor, '');
      canary_max_wallets := coalesce(canary_max_wallets, 0);
      canary_expires_raw := coalesce(canary_expires_raw, '');

      if canary_sponsor !~ '^0x[0-9a-f]{40}$' then
        raise exception 'FORGE mainnet Canary sponsor is not configured.'
          using errcode = '42501';
      end if;

      if lower(coalesce(new.creator_wallet, '')) <> canary_sponsor then
        raise exception 'FORGE mainnet Canary is restricted to the configured sponsor wallet.'
          using errcode = '42501';
      end if;

      if canary_max_wallets < 1 or canary_max_wallets > 100 then
        raise exception 'FORGE mainnet Canary wallet limit is invalid.'
          using errcode = '42501';
      end if;

      if coalesce(new.eligible_wallets, 0) < 1 or new.eligible_wallets > canary_max_wallets then
        raise exception 'FORGE mainnet Canary exceeds the configured wallet limit (%).', canary_max_wallets
          using errcode = '42501';
      end if;

      if canary_expires_raw = '' then
        raise exception 'FORGE mainnet Canary expiry is not configured.'
          using errcode = '42501';
      end if;

      begin
        canary_expires_at := canary_expires_raw::timestamptz;
      exception when others then
        raise exception 'FORGE mainnet Canary expiry is invalid.'
          using errcode = '42501';
      end;

      if canary_expires_at <= now() then
        raise exception 'FORGE mainnet Canary authorization has expired.'
          using errcode = '42501';
      end if;

      if canary_expires_at > now() + interval '24 hours' then
        raise exception 'FORGE mainnet Canary authorization cannot exceed 24 hours.'
          using errcode = '42501';
      end if;
    elsif release_mode <> 'public' then
      raise exception 'FORGE mainnet release mode is invalid.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.forge_enforce_claim_release_gate() from public;

drop trigger if exists forge_claim_epoch_release_gate on public.forge_claim_epochs;
create trigger forge_claim_epoch_release_gate
before insert or update of claim_chain_id, creator_wallet, eligible_wallets
on public.forge_claim_epochs
for each row
execute function public.forge_enforce_claim_release_gate();

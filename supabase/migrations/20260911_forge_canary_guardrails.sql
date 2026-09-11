-- Additional fail-closed guardrails for a tightly controlled FORGE Mainnet Canary.
-- This migration does NOT enable Mainnet writes. The existing master flag and release mode remain authoritative.

insert into public.forge_release_config(key, value)
values ('mainnet_canary_max_token_amount', '0')
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
  canary_max_token_amount_raw text := '';
  canary_max_token_amount numeric := 0;
  canary_max_units numeric := 0;
  requested_total_units numeric := 0;
  other_active_epoch boolean := false;
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

      select trim(value) into canary_max_token_amount_raw
      from public.forge_release_config
      where key = 'mainnet_canary_max_token_amount';

      canary_sponsor := coalesce(canary_sponsor, '');
      canary_max_wallets := coalesce(canary_max_wallets, 0);
      canary_expires_raw := coalesce(canary_expires_raw, '');
      canary_max_token_amount_raw := coalesce(canary_max_token_amount_raw, '');

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

      -- Require an explicit human-token funding ceiling. A missing/zero/invalid cap fails closed.
      if canary_max_token_amount_raw !~ '^[0-9]+(\.[0-9]{1,18})?$' then
        raise exception 'FORGE mainnet Canary funding cap is not configured.' using errcode = '42501';
      end if;
      begin
        canary_max_token_amount := canary_max_token_amount_raw::numeric;
      exception when others then
        raise exception 'FORGE mainnet Canary funding cap is invalid.' using errcode = '42501';
      end;
      if canary_max_token_amount <= 0 then
        raise exception 'FORGE mainnet Canary funding cap must be positive.' using errcode = '42501';
      end if;
      if new.reward_decimals is null or new.reward_decimals < 0 or new.reward_decimals > 36 then
        raise exception 'FORGE mainnet Canary reward decimals are invalid.' using errcode = '42501';
      end if;
      if coalesce(new.total_allocated_units, '') !~ '^[0-9]+$' then
        raise exception 'FORGE mainnet Canary total allocation is invalid.' using errcode = '42501';
      end if;
      requested_total_units := new.total_allocated_units::numeric;
      canary_max_units := trunc(canary_max_token_amount * power(10::numeric, new.reward_decimals));
      if canary_max_units < 1 then
        raise exception 'FORGE mainnet Canary funding cap resolves below one token unit.' using errcode = '42501';
      end if;
      if requested_total_units > canary_max_units then
        raise exception 'FORGE mainnet Canary allocation exceeds the configured funding cap (% token units at % decimals).', canary_max_token_amount_raw, new.reward_decimals using errcode = '42501';
      end if;

      -- Serialize Canary epoch creation/update so concurrent operators cannot open two live epochs.
      perform pg_advisory_xact_lock(hashtext('totz_forge_mainnet_canary_epoch'));
      if new.status in ('uploading', 'published') and new.deadline > now() then
        select exists (
          select 1
          from public.forge_claim_epochs e
          where e.claim_chain_id = 4663
            and e.id <> new.id
            and e.status in ('uploading', 'published')
            and e.deadline > now()
        ) into other_active_epoch;
        if other_active_epoch then
          raise exception 'FORGE mainnet Canary permits only one active epoch at a time.' using errcode = '55000';
        end if;
      end if;
    elsif release_mode <> 'public' then
      raise exception 'FORGE mainnet release mode is invalid.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.forge_enforce_claim_release_gate() from public, anon, authenticated;

drop trigger if exists forge_claim_epoch_release_gate on public.forge_claim_epochs;
create trigger forge_claim_epoch_release_gate
before insert or update of claim_chain_id, creator_wallet, eligible_wallets, total_allocated_units, reward_decimals, status, deadline
on public.forge_claim_epochs
for each row execute function public.forge_enforce_claim_release_gate();

-- TOTZ FORGE emergency / default lockdown.
-- Safe to run repeatedly. This NEVER enables mainnet.
-- It closes the master gate first, then resets staged release policy.

begin;

update public.forge_release_flags
set enabled = false,
    updated_at = now()
where key = 'mainnet_claims_enabled';

insert into public.forge_release_flags (key, enabled, updated_at)
values ('mainnet_claims_enabled', false, now())
on conflict (key) do update
set enabled = excluded.enabled,
    updated_at = excluded.updated_at;

insert into public.forge_release_config (key, value, updated_at)
values
  ('mainnet_release_mode', 'locked', now()),
  ('mainnet_canary_sponsor', '', now()),
  ('mainnet_canary_max_wallets', '10', now())
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

commit;

-- Expected final state:
-- mainnet_claims_enabled   = false
-- mainnet_release_mode     = locked
-- mainnet_canary_sponsor   = <blank>
-- mainnet_canary_max_wallets = 10

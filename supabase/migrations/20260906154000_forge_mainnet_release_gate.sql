-- TOTZ FORGE mainnet release gate.
-- Defense in depth: even if a client or edge-function regression submits a
-- Robinhood Chain mainnet epoch, Postgres rejects it until the release flag
-- is explicitly enabled by an operator.

create table if not exists public.forge_release_flags (
  key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.forge_release_flags enable row level security;

insert into public.forge_release_flags (key, enabled)
values ('mainnet_claims_enabled', false)
on conflict (key) do nothing;

create or replace function public.forge_enforce_claim_release_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mainnet_enabled boolean := false;
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
  end if;

  return new;
end;
$$;

revoke all on function public.forge_enforce_claim_release_gate() from public;
revoke all on table public.forge_release_flags from anon, authenticated;

drop trigger if exists forge_claim_epoch_release_gate on public.forge_claim_epochs;
create trigger forge_claim_epoch_release_gate
before insert or update of claim_chain_id
on public.forge_claim_epochs
for each row
execute function public.forge_enforce_claim_release_gate();

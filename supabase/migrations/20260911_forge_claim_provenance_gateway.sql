alter table public.forge_claim_epochs
  add column if not exists snapshot_block_hash text,
  add column if not exists snapshot_complete boolean not null default false,
  add column if not exists snapshot_source text,
  add column if not exists snapshot_provenance jsonb,
  add column if not exists distribution_fingerprint text,
  add column if not exists provenance_verified_at timestamptz;

do $$ begin
  alter table public.forge_claim_epochs
    add constraint forge_claim_epochs_snapshot_block_hash_check
    check (snapshot_block_hash is null or snapshot_block_hash ~ '^0x[0-9a-f]{64}$') not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.forge_claim_epochs
    add constraint forge_claim_epochs_distribution_fingerprint_check
    check (distribution_fingerprint is null or distribution_fingerprint ~ '^0x[0-9a-f]{64}$') not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.forge_claim_epochs
    add constraint forge_claim_epochs_package_fingerprint_check
    check (package_fingerprint is null or package_fingerprint ~ '^0x[0-9a-f]{64}$') not valid;
exception when duplicate_object then null; end $$;

create table if not exists public.forge_claim_provenance_authorizations (
  slug text primary key,
  creator_wallet text not null,
  source_chain text not null,
  source_chain_id integer not null,
  source_contract text not null,
  snapshot_block bigint not null,
  snapshot_block_hash text not null,
  snapshot_complete boolean not null default true,
  snapshot_source text,
  snapshot_provenance jsonb,
  distribution_fingerprint text not null,
  package_fingerprint text not null,
  merkle_root text not null,
  total_allocated_units text not null,
  eligible_wallets integer not null,
  upload_token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  check (creator_wallet ~ '^0x[0-9a-f]{40}$'),
  check (source_contract ~ '^0x[0-9a-f]{40}$'),
  check (snapshot_block > 0),
  check (snapshot_block_hash ~ '^0x[0-9a-f]{64}$'),
  check (snapshot_complete is true),
  check (distribution_fingerprint ~ '^0x[0-9a-f]{64}$'),
  check (package_fingerprint ~ '^0x[0-9a-f]{64}$'),
  check (merkle_root ~ '^0x[0-9a-f]{64}$'),
  check (total_allocated_units ~ '^[0-9]+$'),
  check (eligible_wallets between 1 and 20000),
  check (upload_token_hash ~ '^[0-9a-f]{64}$')
);
alter table public.forge_claim_provenance_authorizations enable row level security;

create or replace function public.forge_apply_claim_provenance_authorization()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a public.forge_claim_provenance_authorizations%rowtype;
begin
  select * into a
  from public.forge_claim_provenance_authorizations
  where slug = new.slug
  for update;

  if not found then
    raise exception 'FORGE server provenance authorization is required.' using errcode = '42501';
  end if;
  if a.consumed_at is not null or a.expires_at <= now() then
    raise exception 'FORGE server provenance authorization is expired or already consumed.' using errcode = '42501';
  end if;

  if lower(new.creator_wallet) <> a.creator_wallet
     or lower(new.source_chain) <> a.source_chain
     or new.source_chain_id <> a.source_chain_id
     or lower(new.source_contract) <> a.source_contract
     or new.snapshot_block is distinct from a.snapshot_block
     or lower(new.merkle_root) <> a.merkle_root
     or new.total_allocated_units <> a.total_allocated_units
     or new.eligible_wallets <> a.eligible_wallets
     or lower(coalesce(new.package_fingerprint,'')) <> a.package_fingerprint
     or lower(new.upload_token_hash) <> a.upload_token_hash then
    raise exception 'FORGE claim metadata does not match the server provenance authorization.' using errcode = '42501';
  end if;

  new.snapshot_block_hash := a.snapshot_block_hash;
  new.snapshot_complete := true;
  new.snapshot_source := a.snapshot_source;
  new.snapshot_provenance := a.snapshot_provenance;
  new.distribution_fingerprint := a.distribution_fingerprint;
  new.package_fingerprint := a.package_fingerprint;
  new.provenance_verified_at := null;

  update public.forge_claim_provenance_authorizations
  set consumed_at = now()
  where slug = a.slug;

  return new;
end;
$$;

revoke execute on function public.forge_apply_claim_provenance_authorization() from public, anon, authenticated;
revoke execute on function public.forge_enforce_claim_release_gate() from public, anon, authenticated;
revoke execute on function public.forge_claim_entry_write_guard() from public, anon, authenticated;

drop trigger if exists forge_claim_epoch_provenance_gate on public.forge_claim_epochs;
create trigger forge_claim_epoch_provenance_gate
before insert on public.forge_claim_epochs
for each row execute function public.forge_apply_claim_provenance_authorization();

create or replace function public.forge_finalize_claim_epoch(p_epoch_id uuid, p_expected_entries integer, p_expected_total text)
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
  v_snapshot_complete boolean;
  v_snapshot_hash text;
  v_distribution_fingerprint text;
  v_package_fingerprint text;
  v_provenance_verified_at timestamptz;
begin
  if p_expected_entries is null or p_expected_entries < 1 or p_expected_entries > 20000 then
    raise exception 'Invalid expected entry count' using errcode = '22023';
  end if;
  if p_expected_total is null or p_expected_total !~ '^[0-9]+$' or p_expected_total::numeric <= 0 then
    raise exception 'Invalid expected allocation total' using errcode = '22023';
  end if;

  select status, eligible_wallets, total_allocated_units,
         snapshot_complete, snapshot_block_hash, distribution_fingerprint,
         package_fingerprint, provenance_verified_at
    into v_status, v_eligible, v_committed_total,
         v_snapshot_complete, v_snapshot_hash, v_distribution_fingerprint,
         v_package_fingerprint, v_provenance_verified_at
  from public.forge_claim_epochs
  where id = p_epoch_id
  for update;

  if not found then return false; end if;
  if v_status <> 'uploading' then return false; end if;
  if v_eligible <> p_expected_entries or v_committed_total <> p_expected_total then
    raise exception 'Epoch commitment changed before finalization' using errcode = '55000';
  end if;

  if v_snapshot_complete is not true
     or coalesce(v_snapshot_hash,'') !~ '^0x[0-9a-f]{64}$'
     or coalesce(v_distribution_fingerprint,'') !~ '^0x[0-9a-f]{64}$'
     or coalesce(v_package_fingerprint,'') !~ '^0x[0-9a-f]{64}$' then
    raise exception 'FORGE snapshot provenance is incomplete.' using errcode = '42501';
  end if;
  if v_provenance_verified_at is null or v_provenance_verified_at < now() - interval '2 minutes' then
    raise exception 'FORGE publish provenance verification is missing or stale.' using errcode = '42501';
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

revoke execute on function public.forge_finalize_claim_epoch(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.forge_finalize_claim_epoch(uuid, integer, text) to service_role;
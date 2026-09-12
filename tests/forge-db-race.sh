#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:=postgresql://postgres:postgres@localhost:5432/postgres}"
PSQL=(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -q)

A_ID='11111111-1111-4111-8111-111111111111'
B_ID='22222222-2222-4222-8222-222222222222'

"${PSQL[@]}" <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create table public.forge_release_flags (
  key text primary key,
  enabled boolean not null default false
);
create table public.forge_release_config (
  key text primary key,
  value text not null default ''
);
create table public.forge_claim_epochs (
  id uuid primary key,
  slug text unique,
  creator_wallet text not null,
  source_chain text not null,
  source_chain_id integer not null,
  source_contract text not null,
  snapshot_block bigint,
  reward_token text,
  reward_symbol text,
  reward_decimals integer,
  merkle_root text not null,
  total_allocated_units text not null,
  eligible_wallets integer not null,
  claim_chain_id integer not null,
  claim_contract text,
  deadline timestamptz not null,
  package_fingerprint text,
  upload_token_hash text not null,
  status text not null,
  uploaded_entries integer not null default 0,
  created_at timestamptz not null default now(),
  published_at timestamptz
);
create table public.forge_claim_entries (
  epoch_id uuid not null,
  wallet text not null,
  amount_units text not null,
  leaf text,
  proof jsonb,
  primary key (epoch_id, wallet)
);

-- These functions exist before the reviewed migrations in production. Minimal stubs
-- let the exact checked-in migrations be replayed on this isolated PostgreSQL fixture.
create function public.forge_enforce_claim_release_gate() returns trigger language plpgsql as $$ begin return new; end $$;
create function public.forge_claim_entry_write_guard() returns trigger language plpgsql as $$ begin return new; end $$;

insert into public.forge_release_flags(key, enabled) values ('mainnet_claims_enabled', false);
insert into public.forge_release_config(key, value) values
  ('mainnet_release_mode', 'locked'),
  ('mainnet_canary_sponsor', ''),
  ('mainnet_canary_max_wallets', '1'),
  ('mainnet_canary_expires_at', '');

-- Two pre-existing testnet uploading epochs avoid the provenance-insert gate while
-- still exercising the exact production entry guard and finalizer after migrations.
insert into public.forge_claim_epochs(
  id, slug, creator_wallet, source_chain, source_chain_id, source_contract,
  snapshot_block, reward_token, reward_symbol, reward_decimals, merkle_root,
  total_allocated_units, eligible_wallets, claim_chain_id, claim_contract,
  deadline, package_fingerprint, upload_token_hash, status
) values
  ('11111111-1111-4111-8111-111111111111', 'race-upload-first', '0x1111111111111111111111111111111111111111', 'robinhood-testnet', 46630, '0x2222222222222222222222222222222222222222',
   123, '0x3333333333333333333333333333333333333333', 'TEST', 6, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
   '100', 2, 46630, '0x4444444444444444444444444444444444444444', now() + interval '1 day',
   '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', 'uploading'),
  ('22222222-2222-4222-8222-222222222222', 'race-finalize-first', '0x1111111111111111111111111111111111111111', 'robinhood-testnet', 46630, '0x2222222222222222222222222222222222222222',
   124, '0x3333333333333333333333333333333333333333', 'TEST', 6, '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
   '100', 2, 46630, '0x5555555555555555555555555555555555555555', now() + interval '1 day',
   '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 'uploading');
SQL

# Replay the exact production migrations that define provenance finalization,
# the entry write guard, and the current Canary release trigger.
"${PSQL[@]}" -f supabase/migrations/20260911_forge_claim_provenance_gateway.sql

"${PSQL[@]}" <<SQL
update public.forge_claim_epochs
set snapshot_block_hash = '0x${A_ID//-/}00000000000000000000000000000000',
    snapshot_complete = true,
    snapshot_source = 'race-fixture',
    snapshot_provenance = '{}'::jsonb,
    distribution_fingerprint = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab',
    provenance_verified_at = now()
where id = '$A_ID';
update public.forge_claim_epochs
set snapshot_block_hash = '0x${B_ID//-/}00000000000000000000000000000000',
    snapshot_complete = true,
    snapshot_source = 'race-fixture',
    snapshot_provenance = '{}'::jsonb,
    distribution_fingerprint = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbc',
    provenance_verified_at = now()
where id = '$B_ID';
SQL

"${PSQL[@]}" -f supabase/migrations/20260911_forge_claim_schema_lockdown.sql
"${PSQL[@]}" -f supabase/migrations/20260911_forge_canary_guardrails.sql

"${PSQL[@]}" <<SQL
insert into public.forge_claim_entries(epoch_id, wallet, amount_units)
values ('$A_ID', '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '40');
insert into public.forge_claim_entries(epoch_id, wallet, amount_units)
values ('$B_ID', '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '40');
SQL

# Race 1: uploader owns the epoch row lock while inserting the final entry.
# The independent finalizer must wait, then observe the committed entry and publish.
("${PSQL[@]}" <<SQL
begin;
insert into public.forge_claim_entries(epoch_id, wallet, amount_units)
values ('$A_ID', '0xcccccccccccccccccccccccccccccccccccccccc', '60');
select pg_sleep(2);
commit;
SQL
) >/tmp/forge-race-upload-a.log 2>&1 &
UPLOAD_A_PID=$!
sleep 0.25

FINALIZE_A=$("${PSQL[@]}" -Atc "select public.forge_finalize_claim_epoch('$A_ID', 2, '100');")
wait "$UPLOAD_A_PID"
[[ "$FINALIZE_A" == "t" ]] || { echo "Race A finalizer did not succeed after the uploader committed."; exit 1; }

A_STATE=$("${PSQL[@]}" -Atc "select status || ':' || uploaded_entries || ':' || (select count(*) from public.forge_claim_entries where epoch_id='$A_ID') from public.forge_claim_epochs where id='$A_ID';")
[[ "$A_STATE" == "published:2:2" ]] || { echo "Race A ended in unexpected state: $A_STATE"; exit 1; }

set +e
"${PSQL[@]}" -c "insert into public.forge_claim_entries(epoch_id,wallet,amount_units) values ('$A_ID','0xdddddddddddddddddddddddddddddddddddddddd','1');" >/tmp/forge-race-post-publish.log 2>&1
POST_PUBLISH_RC=$?
set -e
[[ $POST_PUBLISH_RC -ne 0 ]] || { echo "Post-publication entry write unexpectedly succeeded."; exit 1; }
grep -q 'immutable after publication' /tmp/forge-race-post-publish.log || { cat /tmp/forge-race-post-publish.log; exit 1; }

# Race 2: finalizer owns the epoch row lock while the package is incomplete.
# It must fail closed; the waiting uploader must then commit, and a clean retry must publish.
set +e
("${PSQL[@]}" <<SQL
begin;
select id from public.forge_claim_epochs where id='$B_ID' for update;
select pg_sleep(2);
select public.forge_finalize_claim_epoch('$B_ID', 2, '100');
commit;
SQL
) >/tmp/forge-race-finalize-b.log 2>&1 &
FINALIZE_B_PID=$!
set -e
sleep 0.25

("${PSQL[@]}" <<SQL
begin;
insert into public.forge_claim_entries(epoch_id, wallet, amount_units)
values ('$B_ID', '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', '60');
commit;
SQL
) >/tmp/forge-race-upload-b.log 2>&1 &
UPLOAD_B_PID=$!

set +e
wait "$FINALIZE_B_PID"
FINALIZE_B_RC=$?
set -e
wait "$UPLOAD_B_PID"
[[ $FINALIZE_B_RC -ne 0 ]] || { echo "Race B incomplete finalization unexpectedly succeeded."; exit 1; }
grep -q 'Stored claim package does not match committed count/total' /tmp/forge-race-finalize-b.log || { cat /tmp/forge-race-finalize-b.log; exit 1; }

B_BEFORE=$("${PSQL[@]}" -Atc "select status || ':' || (select count(*) from public.forge_claim_entries where epoch_id='$B_ID') from public.forge_claim_epochs where id='$B_ID';")
[[ "$B_BEFORE" == "uploading:2" ]] || { echo "Race B did not preserve the uploading epoch after fail-closed finalization: $B_BEFORE"; exit 1; }

FINALIZE_B_RETRY=$("${PSQL[@]}" -Atc "select public.forge_finalize_claim_epoch('$B_ID', 2, '100');")
[[ "$FINALIZE_B_RETRY" == "t" ]] || { echo "Race B finalization retry failed after upload completion."; exit 1; }
B_STATE=$("${PSQL[@]}" -Atc "select status || ':' || uploaded_entries from public.forge_claim_epochs where id='$B_ID';")
[[ "$B_STATE" == "published:2" ]] || { echo "Race B ended in unexpected state: $B_STATE"; exit 1; }

echo 'FORGE TWO-SESSION DB RACE: PASS · upload-first serialized · finalize-first failed closed · retry published · post-publish writes rejected'

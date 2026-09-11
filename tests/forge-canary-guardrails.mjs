import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sql = fs.readFileSync('supabase/migrations/20260911_forge_canary_guardrails.sql', 'utf8');

assert(sql.includes("mainnet_canary_max_token_amount"), 'Canary funding cap config must be source-controlled.');
assert(sql.includes("values ('mainnet_canary_max_token_amount', '0')"), 'Funding cap must default fail-closed.');
assert(sql.includes("canary_max_token_amount_raw !~ '^[0-9]+(\\.[0-9]{1,18})?$'"), 'Funding cap must be strictly validated.');
assert(sql.includes('canary_max_token_amount <= 0'), 'Zero/negative Canary funding caps must fail closed.');
assert(sql.includes('requested_total_units > canary_max_units'), 'Canary total allocation must be compared against the configured cap.');
assert(sql.includes("power(10::numeric, new.reward_decimals)"), 'Funding cap must be normalized using token decimals.');

assert(sql.includes("pg_advisory_xact_lock(hashtext('totz_forge_mainnet_canary_epoch'))"), 'Canary epoch creation must be serialized across concurrent operators.');
assert(sql.includes("e.status in ('uploading', 'published')"), 'Single-epoch guard must include uploading and published epochs.');
assert(sql.includes('e.deadline > now()'), 'Expired epochs must not block a later Canary epoch.');
assert(sql.includes('e.id <> new.id'), 'Single-epoch guard must exclude the row being updated.');
assert(sql.includes('permits only one active epoch at a time'), 'Single-epoch rejection must be explicit.');

assert(sql.includes('before insert or update of claim_chain_id, creator_wallet, eligible_wallets, total_allocated_units, reward_decimals, status, deadline'), 'Release trigger must re-check all Canary-sensitive epoch fields.');
assert(sql.includes('revoke execute on function public.forge_enforce_claim_release_gate() from public, anon, authenticated'), 'Release-gate function must remain server-only.');

console.log('FORGE CANARY GUARDRAILS: PASS · explicit token cap + serialized single active epoch');

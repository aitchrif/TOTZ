import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sql = fs.readFileSync('supabase/migrations/20260911_forge_canary_guardrails.sql', 'utf8');
const core = fs.readFileSync('supabase/functions/forge-claims/index.ts', 'utf8');
const launcher = fs.readFileSync('forge-claim-launcher.js', 'utf8');

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

assert(core.includes('mainnet_canary_max_token_amount'), 'Backend status/policy must load the Canary funding cap.');
assert(core.includes('decimalAmountToUnits'), 'Backend must normalize Canary cap to token units.');
assert(core.includes('canarySlotAvailable'), 'Backend status must expose whether a Canary epoch slot is available.');
assert(core.includes('totalAllocatedUnits: expected.totalUnits, rewardDecimals: expected.rewardDecimals'), 'On-chain verification must re-check the Canary allocation against the cap.');
assert(launcher.includes('state.canaryFundingCapConfigured!==true'), 'Launcher must fail closed before Mainnet transactions when the Canary cap is unavailable.');
assert(launcher.includes('total>maxUnits'), 'Launcher must block an oversized Canary package before deployment/funding.');
assert(launcher.includes('state.canarySlotAvailable!==true'), 'Launcher must block when another Canary epoch is active.');

assert(launcher.includes('let activeUploadSession = null;'), 'Launcher must retain an in-memory protected upload session for safe retry.');
assert(launcher.includes('const resuming=Boolean(activeUploadSession&&uploadToken);'), 'Launcher must detect a protected-session publication retry.');
assert(launcher.includes('resumeSession:resuming'), 'Canary preflight must distinguish a retry from a new epoch launch.');
assert(launcher.includes('activeUploadSession={slug,claimContract:live.claimAddress,packageFingerprint:createBody.packageFingerprint,snapshotBlockHash:createBody.snapshotBlockHash};'), 'Launcher must bind the resume session to the exact claim deployment and package fingerprint.');
assert(launcher.includes('Resuming the existing protected upload session. No new deployment, funding transfer or publication session will be created.'), 'Retry UX must explicitly forbid a second deploy/fund/session.');
assert(launcher.includes('const existing=await getPublishedClaim(slug);'), 'Retry must detect publication that succeeded before a lost client response.');
assert(launcher.includes('if(existing){finishPublished(slug,Number(existing.uploaded_entries||pkg.eligibleWallets||0));return;}'), 'Already-published retry must become idempotent in the client.');
assert((launcher.match(/await api\('create',createBody\);/g)||[]).length===1, 'Protected-session retries must not create a second publication session.');
assert(launcher.includes('if(activeUploadSession&&uploadToken){status(\'verifyStatus\''), 'Launcher must prevent loading another package while a protected upload session is recoverable in the current tab.');

console.log('FORGE CANARY GUARDRAILS: PASS · server/client token cap + serialized single active epoch + protected publication resume');
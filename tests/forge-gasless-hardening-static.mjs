import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const [runtime, claimUi, claimHtml, relayWrapper, relayCore, migration] = await Promise.all([
  readFile('forge-runtime-config.js', 'utf8'),
  readFile('forge-claim.js', 'utf8'),
  readFile('forge-claim.html', 'utf8'),
  readFile('supabase/functions/forge-gasless-relay/index.ts', 'utf8'),
  readFile('supabase/functions/forge-gasless-relay/relay-core.ts', 'utf8'),
  readFile('supabase/migrations/20260907224600_forge_gasless_v2_hardening.sql', 'utf8'),
]);
const relay = `${relayWrapper}\n${relayCore}`;

// Product mode is now direct-claim only. Keep the hardened relay code/audit path
// test-covered, but make it unreachable from the public holder runtime and UI.
assert.match(runtime, /gaslessRelay:\s*''/, 'public runtime must keep the gasless relay unreachable');
assert.match(runtime, /const mainnetClaimsEnabled = false;/, 'client Mainnet launch gate must stay locked');
assert.match(runtime, /const claimNetwork = networks\.testnet;/, 'Testnet must remain the default claim launch network');

assert.doesNotMatch(claimHtml, /id="gaslessClaimBtn"/, 'public holder UI must not expose a sponsored claim button');
assert.match(claimHtml, /id="claimBtn"[^>]*>CLAIM<\/button>/, 'public holder UI must expose the direct claim button');
assert.match(claimUi, /authorizationNonces/, 'dormant V2 holder code must retain nonce support if re-enabled in a future isolated build');
assert.match(claimUi, /signTypedData/, 'dormant V2 holder code must retain EIP-712 authorization if re-enabled');
assert.match(claimUi, /route:'status'/, 'dormant V2 holder code must still gate relay status server-side');
assert.match(claimUi, /route=relay/, 'dormant V2 holder code must still submit signed authorization only to the relay');
assert.match(claimUi, /c\.claim\(claimUnits,claimData\.proof\)/, 'direct on-chain claim path must remain available');
assert.match(claimUi, /Direct claim is still available/, 'gasless failure code must never silently auto-spend gas');

assert.match(relay, /gasless_testnet_enabled/, 'relay must have an independent Testnet gasless gate');
assert.match(relay, /gasless_mainnet_enabled/, 'relay must have an independent Mainnet gasless gate');
assert.match(relay, /mainnet_claims_enabled/, 'relay Mainnet must remain behind the master claims gate');
assert.match(relay, /mainnet_release_mode/, 'relay Mainnet must verify production release mode');
assert.match(relay, /!== "public"/, 'gasless Mainnet must not run in locked or canary mode');
assert.match(relay, /from\("forge_claim_entries"\)/, 'relay must source allocation/proof server-side');
assert.doesNotMatch(relay, /body\?\.(amount|proof|nonce)/, 'relay must not trust client allocation/proof/nonce');
assert.match(relay, /provider\.call\(\{ from: smartAccount, to: claimAddress, data: claimForData \}\)/, 'holder authorization/proof must simulate before sponsorship');
assert.match(relay, /handleOps\.staticCall/, 'full EntryPoint simulation must pass before broadcast');
assert.match(relay, /forge_reserve_gasless_request/, 'relay must reserve an auditable idempotency/rate-limit record');
assert.match(relay, /eth_sendUserOperation/, 'relay must use the ERC-4337 bundler submission path');
assert.match(relay, /eth_getUserOperationReceipt/, 'relay must reconcile bundler receipt');
assert.match(relay, /claim\.claimed\(wallet\)/, 'relay must reconcile final on-chain claim state');
assert.doesNotMatch(relay, /fa5148b5-2fe3-41fe-aa83-cfc993f2a295/i, 'Gas Manager policy IDs must not be hardcoded in application source');
assert.doesNotMatch(relay, /0x[a-fA-F0-9]{64}/, 'private keys or opaque 32-byte secrets must not be hardcoded in relay source');

assert.match(migration, /'gasless_testnet_enabled',false/, 'Testnet gasless gate must default off');
assert.match(migration, /'gasless_mainnet_enabled',false/, 'Mainnet gasless gate must default off');
assert.match(migration, /alter table public\.forge_gasless_requests enable row level security;/, 'gasless request audit must have RLS enabled');
assert.match(migration, /revoke all on public\.forge_gasless_requests from anon,authenticated;/, 'gasless audit table must not be client-writable');
assert.match(migration, /grant execute on function public\.forge_reserve_gasless_request[\s\S]* to service_role;/, 'reservation function must be service-role only');
assert.match(migration, /p_max_attempts integer default 2/, 'rate-limit attempt cap must be explicit');
assert.match(migration, /request_hash text not null unique/, 'gasless requests must have an idempotency key');

console.log('PASS FORGE gasless infrastructure hardening (public runtime disabled)');

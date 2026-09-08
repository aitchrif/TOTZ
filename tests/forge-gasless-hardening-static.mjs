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

assert.match(runtime, /gaslessRelay:\s*'https:\/\/yymwpnztjlyfxongwmsw\.supabase\.co\/functions\/v1\/forge-gasless-relay'/, 'runtime must expose the gasless relay service');
assert.match(runtime, /const mainnetClaimsEnabled = false;/, 'client Mainnet launch gate must stay locked');
assert.match(runtime, /const claimNetwork = networks\.testnet;/, 'Testnet must remain the default claim launch network');

assert.match(claimHtml, /id="gaslessClaimBtn"[^>]*hidden[^>]*disabled/, 'sponsored button must fail closed in markup');
assert.match(claimUi, /authorizationNonces/, 'holder UI must detect V2 nonce support');
assert.match(claimUi, /signTypedData/, 'holder UI must use EIP-712 authorization');
assert.match(claimUi, /route:'status'/, 'holder UI must read server gasless status before enabling');
assert.match(claimUi, /slug:String\(epoch\.slug\|\|''\)/, 'holder gasless status must be scoped to the published epoch slug');
assert.match(claimUi, /route=relay/, 'holder UI must submit signed authorization to relay');
assert.match(claimUi, /c\.claim\(claimUnits,claimData\.proof\)/, 'direct on-chain claim fallback must remain available');
assert.match(claimUi, /Direct claim is still available/, 'gasless failure must not silently auto-spend gas');

assert.match(relay, /gasless_testnet_enabled/, 'relay must have an independent Testnet gasless gate');
assert.match(relay, /gasless_mainnet_enabled/, 'relay must have an independent Mainnet gasless gate');
assert.match(relay, /mainnet_claims_enabled/, 'relay Mainnet must remain behind the master claims gate');
assert.match(relay, /mainnet_release_mode/, 'relay Mainnet must verify production release mode');
assert.match(relay, /mainnet_canary_sponsor/, 'relay must read the Mainnet Canary sponsor restriction');
assert.match(relay, /mainnet_canary_max_wallets/, 'relay must read the Mainnet Canary wallet cap');
assert.match(relay, /mainnet_canary_expires_at/, 'relay must read the Mainnet Canary expiry');
assert.match(relay, /MAX_MAINNET_CANARY_WINDOW_MS/, 'relay must cap the Mainnet Canary authorization window');
assert.match(relay, /mode !== "canary" \|\| !epoch/, 'Mainnet Canary must fail closed without an epoch policy context');
assert.match(relay, /creator === canary\.sponsor/, 'Mainnet Canary must match the configured sponsor');
assert.match(relay, /eligible <= canary\.maxWallets/, 'Mainnet Canary must enforce the configured eligible-wallet cap');
assert.match(relay, /epochChainId === net\.chainId/, 'Mainnet Canary epoch must match the requested chain');
assert.match(relay, /\.eq\("slug", slug\)\.eq\("status", "published"\)/, 'Canary status must resolve only a published epoch by slug');
assert.match(relay, /select\("id,slug,status,creator_wallet,eligible_wallets,reward_token/, 'relay execution must include eligible wallet count in epoch policy context');
assert.match(relay, /enabledForNetwork\(net, policy, epoch\)/, 'relay execution must enforce epoch-scoped Mainnet policy before sponsorship');
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

console.log('PASS FORGE gasless V2 hardening static invariants');

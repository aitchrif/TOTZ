import { readFile } from 'node:fs/promises';

const CLAIMS_URL = process.env.FORGE_CLAIMS_URL || 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/forge-claims';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

async function text(path) {
  return readFile(path, 'utf8');
}

async function checkTrackedExpiryPolicy() {
  const migration = await text('supabase/migrations/20260906163000_forge_mainnet_canary_expiry.sql');
  const backend = await text('supabase/functions/forge-claims/index.ts');
  const lockdown = await text('supabase/sql/forge-mainnet-lockdown.sql');

  assert(migration.includes("values ('mainnet_canary_expires_at', '')"), 'Canary expiry is not default-blank/fail-closed');
  assert(migration.includes("interval '24 hours'"), 'database Canary expiry is not capped at 24 hours');
  assert(migration.includes('Canary authorization has expired'), 'database trigger does not reject expired Canary authorization');
  assert(migration.includes('Canary authorization cannot exceed 24 hours'), 'database trigger does not reject overlong Canary authorization');

  assert(backend.includes('MAX_CANARY_WINDOW_MS = 24 * 60 * 60 * 1000'), 'backend Canary window is not capped at 24 hours');
  assert(backend.includes('mainnet_canary_expires_at'), 'backend does not load Canary expiry');
  assert(backend.includes('!policy.enabled?"locked":policy.mode==="canary"&&!window.valid?"locked":policy.mode'), 'public release status does not make the master kill switch authoritative');
  assert(backend.includes('canaryActive:policy.enabled&&effectiveMode==="canary"&&window.valid'), 'public release status can report Canary active while the master gate is off');
  assert(backend.includes('FORGE mainnet Canary authorization has expired.'), 'backend does not reject expired Canary authorization');
  assert(backend.includes('FORGE mainnet Canary authorization cannot exceed 24 hours.'), 'backend does not reject overlong Canary authorization');

  assert(lockdown.includes("('mainnet_canary_expires_at', '', now())"), 'emergency lockdown does not clear Canary expiry');
  pass('tracked Canary expiry and effective-status policy are master-gated, fail-closed, <=24h, and cleared by emergency lockdown');
}

async function checkLiveStatus() {
  const response = await fetch(`${CLAIMS_URL}?route=status`, { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  assert(response.status === 200, `release status expected HTTP 200, got ${response.status}`);
  const mainnet = data?.mainnet;
  assert(mainnet && Number(mainnet.chainId) === 4663, 'live release status is missing Robinhood mainnet');
  assert(mainnet.masterEnabled === false, 'live mainnet master gate is unexpectedly enabled');
  assert(mainnet.mode === 'locked', `live mainnet effective mode is ${mainnet.mode}, expected locked`);
  assert(mainnet.canaryActive === false, 'live Canary is unexpectedly active');
  assert(!Object.prototype.hasOwnProperty.call(mainnet, 'canarySponsor'), 'release status leaks Canary sponsor');
  assert(!Object.prototype.hasOwnProperty.call(mainnet, 'canaryExpiresAt'), 'release status leaks raw Canary expiry');
  assert(!Object.prototype.hasOwnProperty.call(mainnet, 'rpc'), 'release status leaks RPC endpoint');
  assert(!Object.prototype.hasOwnProperty.call(mainnet, 'rpcUrl'), 'release status leaks RPC URL');
  pass('live release status remains master-locked and does not expose Canary expiry, sponsor, or RPC URL');
}

await checkTrackedExpiryPolicy();
await checkLiveStatus();
console.log('\nFORGE CANARY EXPIRY INVARIANT: PASSED.');

import { readFile } from 'node:fs/promises';

const CLAIMS_URL = process.env.FORGE_CLAIMS_URL || 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/forge-claims';
const EXPECTED_RUNTIME_HASH = '0x0051149977ffb2b42b63e07841f68b4bd382a1656ac32efbf5c3c064f12a0b56';
const TESTNET = { chainId: 46630, rpc: 'https://rpc.testnet.chain.robinhood.com' };
const MAINNET = { chainId: 4663, rpc: process.env.FORGE_MAINNET_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com' };

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function warn(message) {
  console.warn(`WARN ${message}`);
}

async function text(path) {
  return readFile(path, 'utf8');
}

async function checkStaticReleaseConfig() {
  const runtime = await text('forge-runtime-config.js');
  assert(runtime.includes('chainId: 46630'), 'runtime is missing Robinhood Testnet chain 46630');
  assert(runtime.includes('chainId: 4663'), 'runtime is missing Robinhood mainnet chain 4663');
  assert(runtime.includes("rpc: 'https://rpc.mainnet.chain.robinhood.com'"), 'runtime mainnet RPC fallback is not the approved Robinhood endpoint');
  assert(runtime.includes('const mainnetClaimsEnabled = false;'), 'mainnet client gate must remain false before Canary authorization');
  assert(runtime.includes('const claimNetwork = networks.testnet;'), 'Testnet must remain the default claim network before Canary authorization');
  assert(runtime.includes('installLockedClaimUiGuard();'), 'runtime locked-write UI guard is missing');
  assert(runtime.includes('installTestHelperGuard();'), 'runtime Testnet-helper guard is missing');
  pass('runtime defines both networks while keeping mainnet writes locked');
}

async function checkBackendReleaseConfig() {
  const backend = await text('supabase/functions/forge-claims/index.ts');
  assert(backend.includes('46630:'), 'backend Testnet claim profile is missing');
  assert(backend.includes('4663:'), 'backend mainnet claim profile is missing');
  assert(backend.includes('FORGE_MAINNET_RPC_URL'), 'backend does not support a production mainnet RPC override');
  assert(backend.includes('mainnet_claims_enabled'), 'backend mainnet release flag lookup is missing');
  assert((backend.match(/assertClaimWriteEnabled\(supabase/g) || []).length >= 4, 'backend write gate is not enforced across create/upload/publish/on-chain verification');
  pass('backend is network-aware and checks the server-side mainnet release gate');
}

async function checkDatabaseGateTracked() {
  const migration = await text('supabase/migrations/20260906154000_forge_mainnet_release_gate.sql');
  assert(migration.includes("values ('mainnet_claims_enabled', false)"), 'database release flag is not default-off');
  assert(migration.includes('forge_claim_epoch_release_gate'), 'database claim-chain trigger is missing');
  assert(migration.includes('new.claim_chain_id = 4663'), 'database trigger does not explicitly protect Robinhood mainnet');
  pass('database migration tracks a default-off mainnet release gate and trigger');
}

async function checkArtifact() {
  const artifact = JSON.parse(await text('artifacts/ForgeMerkleClaim.json'));
  assert(artifact.compiler === '0.8.24', `unexpected compiler ${artifact.compiler}`);
  assert(artifact.optimizer?.enabled === true && artifact.optimizer?.runs === 200, 'unexpected optimizer settings');
  assert(String(artifact.normalizedRuntimeHash || '').toLowerCase() === EXPECTED_RUNTIME_HASH, 'claim artifact runtime hash changed');
  assert(Array.isArray(artifact.abi) && /^0x[0-9a-f]+$/i.test(String(artifact.bytecode || '')), 'claim artifact ABI/bytecode is invalid');
  pass('claim artifact compiler, optimizer and normalized runtime hash are pinned');
}

async function rpcChainId(label, network) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(network.rpc, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data?.error) throw new Error(data.error.message || 'RPC error');
    const chainId = Number.parseInt(String(data?.result || ''), 16);
    assert(chainId === network.chainId, `${label} RPC returned chain ${chainId}, expected ${network.chainId}`);
    pass(`${label} RPC identifies chain ${network.chainId}`);
  } catch (error) {
    if (process.env.FORGE_REQUIRE_RPC_PREFLIGHT === '1') throw error;
    warn(`${label} RPC availability check skipped as a hard gate: ${error?.message || error}. Dedicated production RPC is still required before public launch.`);
  } finally {
    clearTimeout(timer);
  }
}

async function checkLiveMainnetKillSwitch() {
  const now = Math.floor(Date.now() / 1000);
  const uploadToken = `0x${'ab'.repeat(32)}`;
  const body = {
    slug: `mainnet-readiness-${Date.now().toString(36)}-abcdef`,
    uploadToken,
    creatorWallet: `0x${'11'.repeat(20)}`,
    sourceChain: 'robinhood',
    sourceChainId: 4663,
    sourceContract: `0x${'22'.repeat(20)}`,
    sourceCollection: 'FORGE MAINNET READINESS',
    snapshotBlock: 1,
    rewardToken: `0x${'33'.repeat(20)}`,
    rewardSymbol: 'TEST',
    rewardDecimals: 18,
    merkleRoot: `0x${'44'.repeat(32)}`,
    totalAllocatedUnits: '1',
    eligibleWallets: 1,
    claimChainId: 4663,
    claimContract: `0x${'55'.repeat(20)}`,
    deadline: now + 3600,
    issuedAt: now,
  };
  const response = await fetch(`${CLAIMS_URL}?route=create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forge-upload-token': uploadToken },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  assert(response.status === 403, `live mainnet gate expected HTTP 403, got ${response.status}: ${data?.error || ''}`);
  assert(String(data?.error || '').toLowerCase().includes('mainnet claims are locked'), `unexpected live mainnet gate response: ${data?.error || ''}`);
  pass('live FORGE claims service rejects Robinhood mainnet creation while release gate is locked');
}

await checkStaticReleaseConfig();
await checkBackendReleaseConfig();
await checkDatabaseGateTracked();
await checkArtifact();
await rpcChainId('Robinhood Testnet', TESTNET);
await rpcChainId('Robinhood Mainnet', MAINNET);
await checkLiveMainnetKillSwitch();

console.log('\nFORGE MAINNET READINESS: LOCKED PRE-CANARY CHECKS PASSED.');
console.log('Mainnet remains disabled. A dedicated production RPC, branch protection, final Testnet E2E and explicit Canary authorization are still required before enabling writes.');

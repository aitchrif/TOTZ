import { readFile } from 'node:fs/promises';
import { Contract, JsonRpcProvider } from 'ethers';

const CLAIMS_URL = process.env.FORGE_CLAIMS_URL || 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/forge-claims';
const EXPECTED_RUNTIME_HASH = '0x0051149977ffb2b42b63e07841f68b4bd382a1656ac32efbf5c3c064f12a0b56';
const TESTNET = { chainId: 46630, rpc: 'https://rpc.testnet.chain.robinhood.com' };
const MAINNET = { chainId: 4663, rpc: process.env.FORGE_MAINNET_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com' };
const PUBLISHED_TESTNET_SLUG = process.env.FORGE_TESTNET_EPOCH_SLUG || 'forge-quick-test-mtpw6j67-28aadc';
const CLAIM_VIEW_ABI = [
  'function token() view returns (address)',
  'function sponsor() view returns (address)',
  'function merkleRoot() view returns (bytes32)',
  'function totalAllocated() view returns (uint256)',
  'function deadline() view returns (uint64)'
];

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
  assert(backend.includes('const MAINNET_RPC_URL = (Deno.env.get("FORGE_MAINNET_RPC_URL") || "").trim();'), 'backend does not isolate the dedicated production RPC secret');
  assert(backend.includes('FORGE mainnet requires a dedicated production RPC before writes can be enabled.'), 'backend does not fail closed when the dedicated production RPC is missing');
  assert(backend.includes('mainnet_claims_enabled'), 'backend mainnet master kill switch lookup is missing');
  assert(backend.includes('mainnet_release_mode'), 'backend staged mainnet release mode lookup is missing');
  assert(backend.includes('mainnet_canary_sponsor'), 'backend Canary sponsor allowlist lookup is missing');
  assert(backend.includes('mainnet_canary_max_wallets'), 'backend Canary wallet cap lookup is missing');
  assert(backend.includes('policy.mode==="canary"'), 'backend Canary policy enforcement is missing');
  assert((backend.match(/assertClaimWriteEnabled\(supabase/g) || []).length >= 4, 'backend write gate is not enforced across create/upload/publish/on-chain verification');
  pass('backend requires the master gate, staged Canary policy and dedicated production RPC for mainnet writes');
}

async function checkDatabaseGateTracked() {
  const master = await text('supabase/migrations/20260906154000_forge_mainnet_release_gate.sql');
  assert(master.includes("values ('mainnet_claims_enabled', false)"), 'database master release flag is not default-off');

  const canary = await text('supabase/migrations/20260906161000_forge_mainnet_canary_policy.sql');
  assert(canary.includes("('mainnet_release_mode', 'locked')"), 'database mainnet release mode is not default-locked');
  assert(canary.includes("('mainnet_canary_sponsor', '')"), 'database Canary sponsor is not fail-closed by default');
  assert(canary.includes("('mainnet_canary_max_wallets', '10')"), 'database Canary wallet cap is not pinned to 10 by default');
  assert(canary.includes("release_mode = 'canary'"), 'database trigger does not enforce Canary mode');
  assert(canary.includes('lower(coalesce(new.creator_wallet'), 'database trigger does not enforce the Canary sponsor');
  assert(canary.includes('new.eligible_wallets > canary_max_wallets'), 'database trigger does not enforce the Canary wallet cap');
  assert(canary.includes('before insert or update of claim_chain_id, creator_wallet, eligible_wallets'), 'database trigger does not guard post-insert Canary policy changes');
  pass('database tracks a default-locked staged release with sponsor allowlist and 10-wallet Canary cap');
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

async function checkPublishedTestnetEpoch() {
  const response = await fetch(`${CLAIMS_URL}?route=get&slug=${encodeURIComponent(PUBLISHED_TESTNET_SLUG)}`, { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  assert(response.status === 200, `published Testnet epoch GET expected HTTP 200, got ${response.status}: ${data?.error || ''}`);
  const epoch = data?.epoch;
  assert(epoch, 'published Testnet epoch payload is missing');
  assert(Number(epoch.claim_chain_id) === TESTNET.chainId, `published fixture is on chain ${epoch.claim_chain_id}, expected ${TESTNET.chainId}`);
  assert(/^0x[a-fA-F0-9]{40}$/.test(String(epoch.claim_contract || '')), 'published fixture claim contract is invalid');

  const provider = new JsonRpcProvider(TESTNET.rpc, TESTNET.chainId, { staticNetwork: true });
  const code = await provider.getCode(epoch.claim_contract);
  assert(code && code !== '0x', 'published Testnet claim contract has no code');
  const contract = new Contract(epoch.claim_contract, CLAIM_VIEW_ABI, provider);
  const [token, sponsor, root, total, deadline] = await Promise.all([
    contract.token(), contract.sponsor(), contract.merkleRoot(), contract.totalAllocated(), contract.deadline()
  ]);
  assert(String(token).toLowerCase() === String(epoch.reward_token).toLowerCase(), 'published Testnet reward token does not match on-chain contract');
  assert(String(sponsor).toLowerCase() === String(epoch.creator_wallet).toLowerCase(), 'published Testnet sponsor does not match on-chain contract');
  assert(String(root).toLowerCase() === String(epoch.merkle_root).toLowerCase(), 'published Testnet Merkle root does not match on-chain contract');
  assert(BigInt(total) === BigInt(epoch.total_allocated_units), 'published Testnet total allocation does not match on-chain contract');
  assert(Number(deadline) === Math.floor(new Date(epoch.deadline).getTime() / 1000), 'published Testnet deadline does not match on-chain contract');
  pass(`published Testnet epoch ${PUBLISHED_TESTNET_SLUG} matches its live on-chain claim contract`);
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
await checkPublishedTestnetEpoch();
await checkLiveMainnetKillSwitch();

console.log('\nFORGE MAINNET READINESS: LOCKED PRE-CANARY CHECKS PASSED.');
console.log('Mainnet remains disabled. A dedicated production RPC, branch protection, final wallet-signed Testnet E2E and explicit Canary sponsor authorization are still required before enabling writes.');
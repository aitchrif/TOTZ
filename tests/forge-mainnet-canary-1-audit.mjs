import { Contract, JsonRpcProvider } from 'ethers';

const SERVICE = process.env.FORGE_CLAIMS_URL || 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/forge-claims';
const RPC = process.env.FORGE_MAINNET_AUDIT_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';
const CHAIN_ID = 4663;
const SLUG = 'totz-forge-mainnet-canary-oper-mtq6gy8l-ae44bc';
const WALLET = '0xf3e2e7362f38daf68662ff9f963a20bd9602011f';
const CONTRACT = '0xe621de9d09ea603229f31e220d191e2c431362c7';
const USDG = '0x5fc5360d0400a0fd4f2af552add042d716f1d168';
const ROOT = '0xbd15cde0c32340c80e04c28df7274f6d1a3386919eba05e8f0a65e402b58d759';
const TOTAL = 10_000n;

const ABI = [
  'function token() view returns (address)',
  'function sponsor() view returns (address)',
  'function merkleRoot() view returns (bytes32)',
  'function totalAllocated() view returns (uint256)',
  'function totalClaimed() view returns (uint256)',
  'function claimCount() view returns (uint256)',
  'function claimed(address) view returns (bool)',
  'function contractBalance() view returns (uint256)',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function getJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  assert(response.ok, `HTTP ${response.status}: ${data?.error || 'request failed'}`);
  return data;
}

async function main() {
  const release = await getJson(`${SERVICE}?route=status&wallet=${WALLET}`);
  const mainnet = release?.mainnet || {};
  assert(Number(mainnet.chainId) === CHAIN_ID, 'Release status is not Robinhood Mainnet.');
  assert(mainnet.masterEnabled === false, 'Mainnet launch master gate must remain OFF after Canary #1.');
  assert(String(mainnet.mode || '') === 'locked', 'Mainnet release mode must remain locked after Canary #1.');
  assert(mainnet.canaryActive === false, 'No Canary authorization should remain active after Canary #1.');
  assert(mainnet.rpcReady === true, 'Production Mainnet RPC is not ready.');

  const published = await getJson(`${SERVICE}?route=get&slug=${encodeURIComponent(SLUG)}&wallet=${WALLET}`);
  const epoch = published?.epoch;
  const claim = published?.claim;
  assert(epoch, 'First Mainnet Canary epoch is missing from the claims service.');
  assert(String(epoch.status) === 'published', 'First Mainnet Canary epoch is not published.');
  assert(Number(epoch.claim_chain_id) === CHAIN_ID, 'Canary claim chain changed.');
  assert(String(epoch.claim_contract).toLowerCase() === CONTRACT, 'Canary claim contract changed.');
  assert(String(epoch.reward_token).toLowerCase() === USDG, 'Canary reward token changed.');
  assert(String(epoch.merkle_root).toLowerCase() === ROOT, 'Canary Merkle root changed.');
  assert(BigInt(epoch.total_allocated_units) === TOTAL, 'Canary total allocation changed.');
  assert(Number(epoch.eligible_wallets) === 1, 'Canary eligible-wallet count changed.');
  assert(String(epoch.creator_wallet).toLowerCase() === WALLET, 'Canary sponsor changed.');
  assert(claim, 'Canary wallet proof is no longer retrievable.');
  assert(BigInt(claim.amount_units) === TOTAL, 'Canary wallet allocation changed.');
  assert(Array.isArray(claim.proof) && claim.proof.length === 0, 'Single-leaf Canary proof changed.');

  const provider = new JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });
  const contract = new Contract(CONTRACT, ABI, provider);
  const [token, sponsor, root, totalAllocated, totalClaimed, claimCount, alreadyClaimed, balance] = await Promise.all([
    contract.token(),
    contract.sponsor(),
    contract.merkleRoot(),
    contract.totalAllocated(),
    contract.totalClaimed(),
    contract.claimCount(),
    contract.claimed(WALLET),
    contract.contractBalance(),
  ]);

  assert(String(token).toLowerCase() === USDG, 'On-chain Canary token mismatch.');
  assert(String(sponsor).toLowerCase() === WALLET, 'On-chain Canary sponsor mismatch.');
  assert(String(root).toLowerCase() === ROOT, 'On-chain Canary root mismatch.');
  assert(BigInt(totalAllocated) === TOTAL, 'On-chain Canary allocation mismatch.');
  assert(Boolean(alreadyClaimed) === true, 'Canary wallet is not marked claimed on-chain.');
  assert(BigInt(totalClaimed) === TOTAL, 'Canary did not claim the exact 0.01 USDG allocation.');
  assert(BigInt(claimCount) === 1n, 'Canary claim count is not exactly one.');
  assert(BigInt(balance) === 0n, 'Canary contract still holds reward tokens after the successful claim.');

  console.log('FORGE MAINNET CANARY #1 AUDIT: PASSED');
  console.log(`Epoch: ${SLUG}`);
  console.log(`Claim contract: ${CONTRACT}`);
  console.log('Verified: backend locked + published proof retained + claimed=true + totalClaimed=0.01 USDG + claimCount=1 + contract balance=0.');
}

main().catch(error => {
  console.error(`FORGE MAINNET CANARY #1 AUDIT: FAILED — ${error?.message || error}`);
  process.exitCode = 1;
});

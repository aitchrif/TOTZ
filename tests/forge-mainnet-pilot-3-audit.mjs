import { readFile } from 'node:fs/promises';
import { Contract, JsonRpcProvider, keccak256 } from 'ethers';

const SERVICE = process.env.FORGE_CLAIMS_URL || 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/forge-claims';
const RPC = process.env.FORGE_MAINNET_AUDIT_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';
const CHAIN_ID = 4663;
const SLUG = 'totz-forge-mainnet-pilot-3-ope-mtrczp4x-4c233f';
const CONTRACT = '0x03592523431e56473264f12f6b0cdb85a7ecfda4';
const USDG = '0x5fc5360d0400a0fd4f2af552add042d716f1d168';
const SPONSOR = '0xf3e2e7362f38daf68662ff9f963a20bd9602011f';
const ROOT = '0xbd2c784bffbe0bfd2e96edc72a6961f114e5d99fc9199b54b8321b6c42aacd56';
const DEADLINE = 1788804000n; // 2026-09-07T18:00:00Z
const PER_WALLET = 10_000n;
const TOTAL = 120_000n;
const WALLETS = [
  '0x02f87b7e6c1c1ad42b2832cd5baf9be713b71353',
  '0x62457e9cf7d9d7fcbc39bd79af06c36d2b693899',
  '0x65d9b34477d5e96b9bf37ad5f6f563e0331cd88b',
  '0x7fb768248b3befd38b26b44a9ebe5df3a94aa9e7',
  '0xa14c1b3720e8ce177c2ff7ccadd2610dc50c218f',
  '0xa82e9d1f4ab84b14c8e9f0058054f32ff89f0af0',
  '0xae017599af8b889faa2319361587b820dd6f34c1',
  '0xca5ff301ada7af7d569e81789c05ac7425bcd304',
  '0xcdac1d3b5ada4cda7049238bca474d44aeea3a2f',
  '0xd0f105d723691b0fb00d6c4080241f37bb36bd61',
  '0xd771242fd9222da2303daad958f4f595bae3c5a5',
  '0xf3e2e7362f38daf68662ff9f963a20bd9602011f',
];

const ABI = [
  'function token() view returns (address)',
  'function sponsor() view returns (address)',
  'function merkleRoot() view returns (bytes32)',
  'function totalAllocated() view returns (uint256)',
  'function deadline() view returns (uint64)',
  'function totalClaimed() view returns (uint256)',
  'function claimCount() view returns (uint256)',
  'function claimed(address) view returns (bool)',
  'function contractBalance() view returns (uint256)',
  'function isFullyFunded() view returns (bool)',
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

function normalizedRuntimeHash(code, immutableReferences) {
  const bytes = Buffer.from(String(code).replace(/^0x/, ''), 'hex');
  for (const ranges of Object.values(immutableReferences || {})) {
    for (const { start, length } of ranges) bytes.fill(0, start, start + length);
  }
  return keccak256(`0x${bytes.toString('hex')}`);
}

async function main() {
  const release = await getJson(`${SERVICE}?route=status&wallet=${SPONSOR}`);
  const mainnet = release?.mainnet || {};
  assert(Number(mainnet.chainId) === CHAIN_ID, 'Release status is not Robinhood Mainnet.');
  assert(mainnet.masterEnabled === false, 'Mainnet launch master gate must remain OFF after Pilot #3.');
  assert(String(mainnet.mode || '') === 'locked', 'Mainnet release mode must remain locked after Pilot #3.');
  assert(mainnet.canaryActive === false, 'No Mainnet Canary authorization should remain active after Pilot #3.');
  assert(mainnet.rpcReady === true, 'Production Mainnet RPC is not ready.');

  const published = await getJson(`${SERVICE}?route=get&slug=${encodeURIComponent(SLUG)}&wallet=${SPONSOR}`);
  const epoch = published?.epoch;
  assert(epoch, 'Mainnet Pilot #3 epoch is missing from the claims service.');
  assert(String(epoch.status) === 'published', 'Mainnet Pilot #3 epoch is not published.');
  assert(Number(epoch.claim_chain_id) === CHAIN_ID, 'Pilot #3 claim chain changed.');
  assert(String(epoch.claim_contract).toLowerCase() === CONTRACT, 'Pilot #3 claim contract changed.');
  assert(String(epoch.reward_token).toLowerCase() === USDG, 'Pilot #3 reward token changed.');
  assert(String(epoch.merkle_root).toLowerCase() === ROOT, 'Pilot #3 Merkle root changed.');
  assert(BigInt(epoch.total_allocated_units) === TOTAL, 'Pilot #3 total allocation changed.');
  assert(Number(epoch.eligible_wallets) === WALLETS.length, 'Pilot #3 eligible-wallet count changed.');
  assert(String(epoch.creator_wallet).toLowerCase() === SPONSOR, 'Pilot #3 sponsor changed.');
  assert(BigInt(Math.floor(new Date(epoch.deadline).getTime() / 1000)) === DEADLINE, 'Pilot #3 deadline changed.');

  for (const wallet of WALLETS) {
    const data = await getJson(`${SERVICE}?route=get&slug=${encodeURIComponent(SLUG)}&wallet=${wallet}`);
    const claim = data?.claim;
    assert(claim, `Pilot #3 proof missing for ${wallet}.`);
    assert(BigInt(claim.amount_units) === PER_WALLET, `Pilot #3 allocation changed for ${wallet}.`);
    assert(Array.isArray(claim.proof) && claim.proof.length >= 3, `Pilot #3 proof is malformed for ${wallet}.`);
  }

  const artifact = JSON.parse(await readFile('artifacts/ForgeMerkleClaim.json', 'utf8'));
  const provider = new JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });
  const code = await provider.getCode(CONTRACT);
  assert(code && code !== '0x', 'Pilot #3 claim contract has no runtime code.');
  assert(
    normalizedRuntimeHash(code, artifact.immutableReferences).toLowerCase() === String(artifact.normalizedRuntimeHash).toLowerCase(),
    'Pilot #3 deployed runtime no longer matches the pinned ForgeMerkleClaim artifact.'
  );

  const contract = new Contract(CONTRACT, ABI, provider);
  const [token, sponsor, root, totalAllocated, deadline, totalClaimed, claimCount, balance, fullyFunded, ...claimedFlags] = await Promise.all([
    contract.token(),
    contract.sponsor(),
    contract.merkleRoot(),
    contract.totalAllocated(),
    contract.deadline(),
    contract.totalClaimed(),
    contract.claimCount(),
    contract.contractBalance(),
    contract.isFullyFunded(),
    ...WALLETS.map(wallet => contract.claimed(wallet)),
  ]);

  assert(String(token).toLowerCase() === USDG, 'On-chain Pilot #3 token mismatch.');
  assert(String(sponsor).toLowerCase() === SPONSOR, 'On-chain Pilot #3 sponsor mismatch.');
  assert(String(root).toLowerCase() === ROOT, 'On-chain Pilot #3 root mismatch.');
  assert(BigInt(totalAllocated) === TOTAL, 'On-chain Pilot #3 allocation mismatch.');
  assert(BigInt(deadline) === DEADLINE, 'On-chain Pilot #3 deadline mismatch.');
  assert(BigInt(totalClaimed) === TOTAL, 'Pilot #3 did not claim the exact 0.12 USDG pool.');
  assert(BigInt(claimCount) === BigInt(WALLETS.length), 'Pilot #3 claim count is not exactly twelve.');
  assert(BigInt(balance) === 0n, 'Pilot #3 contract still holds reward tokens after all twelve claims.');
  assert(Boolean(fullyFunded) === true, 'Pilot #3 final funding invariant is false.');
  claimedFlags.forEach((claimed, index) => {
    assert(Boolean(claimed) === true, `Pilot #3 wallet is not marked claimed: ${WALLETS[index]}`);
  });

  console.log('FORGE MAINNET PILOT #3 AUDIT: PASSED');
  console.log(`Epoch: ${SLUG}`);
  console.log(`Claim contract: ${CONTRACT}`);
  console.log('Verified: backend locked + pinned runtime + 12 proofs retained + 12/12 claimed + totalClaimed=0.12 USDG + claimCount=12 + contract balance=0.');
}

main().catch(error => {
  console.error(`FORGE MAINNET PILOT #3 AUDIT: FAILED — ${error?.message || error}`);
  process.exitCode = 1;
});

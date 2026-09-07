import { Contract, JsonRpcProvider } from 'ethers';

const SERVICE = process.env.FORGE_CLAIMS_URL || 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/forge-claims';
const RPC = process.env.FORGE_MAINNET_AUDIT_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';
const CHAIN_ID = 4663;
const SLUG = 'totz-forge-mainnet-pilot-2-ope-mtr8sa7f-3e0f5a';
const CONTRACT = '0x1b97dd2493afa59b4ffa547709abeaaa47eb2b33';
const USDG = '0x5fc5360d0400a0fd4f2af552add042d716f1d168';
const SPONSOR = '0xf3e2e7362f38daf68662ff9f963a20bd9602011f';
const ROOT = '0xed0f17309d622aef8cfc92d3c8a2c4eb1211d60d69e645a334a1b515df9f59bd';
const PER_WALLET = 10_000n;
const TOTAL = 50_000n;
const WALLETS = [
  '0xccd4c628dbe676c71bb64af459e6dc58591228db',
  '0x4ce033094a855f12e797963f958d2b7fea3d9682',
  '0xbd80f477b97ce087f869d17b4b78602af73ace1c',
  '0x01a9be5c86df4e41e66b1b4c734ac9528d98dd94',
  '0xf3e2e7362f38daf68662ff9f963a20bd9602011f',
];

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
  const release = await getJson(`${SERVICE}?route=status&wallet=${SPONSOR}`);
  const mainnet = release?.mainnet || {};
  assert(Number(mainnet.chainId) === CHAIN_ID, 'Release status is not Robinhood Mainnet.');
  assert(mainnet.masterEnabled === false, 'Mainnet launch master gate must remain OFF after Pilot #2.');
  assert(String(mainnet.mode || '') === 'locked', 'Mainnet release mode must remain locked after Pilot #2.');
  assert(mainnet.canaryActive === false, 'No Mainnet Canary authorization should remain active after Pilot #2.');
  assert(mainnet.rpcReady === true, 'Production Mainnet RPC is not ready.');

  const published = await getJson(`${SERVICE}?route=get&slug=${encodeURIComponent(SLUG)}&wallet=${SPONSOR}`);
  const epoch = published?.epoch;
  assert(epoch, 'Mainnet Pilot #2 epoch is missing from the claims service.');
  assert(String(epoch.status) === 'published', 'Mainnet Pilot #2 epoch is not published.');
  assert(Number(epoch.claim_chain_id) === CHAIN_ID, 'Pilot #2 claim chain changed.');
  assert(String(epoch.claim_contract).toLowerCase() === CONTRACT, 'Pilot #2 claim contract changed.');
  assert(String(epoch.reward_token).toLowerCase() === USDG, 'Pilot #2 reward token changed.');
  assert(String(epoch.merkle_root).toLowerCase() === ROOT, 'Pilot #2 Merkle root changed.');
  assert(BigInt(epoch.total_allocated_units) === TOTAL, 'Pilot #2 total allocation changed.');
  assert(Number(epoch.eligible_wallets) === WALLETS.length, 'Pilot #2 eligible-wallet count changed.');
  assert(String(epoch.creator_wallet).toLowerCase() === SPONSOR, 'Pilot #2 sponsor changed.');

  for (const wallet of WALLETS) {
    const data = await getJson(`${SERVICE}?route=get&slug=${encodeURIComponent(SLUG)}&wallet=${wallet}`);
    const claim = data?.claim;
    assert(claim, `Pilot #2 proof missing for ${wallet}.`);
    assert(BigInt(claim.amount_units) === PER_WALLET, `Pilot #2 allocation changed for ${wallet}.`);
    assert(Array.isArray(claim.proof), `Pilot #2 proof is malformed for ${wallet}.`);
  }

  const provider = new JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });
  const contract = new Contract(CONTRACT, ABI, provider);
  const [token, sponsor, root, totalAllocated, totalClaimed, claimCount, balance, ...claimedFlags] = await Promise.all([
    contract.token(),
    contract.sponsor(),
    contract.merkleRoot(),
    contract.totalAllocated(),
    contract.totalClaimed(),
    contract.claimCount(),
    contract.contractBalance(),
    ...WALLETS.map(wallet => contract.claimed(wallet)),
  ]);

  assert(String(token).toLowerCase() === USDG, 'On-chain Pilot #2 token mismatch.');
  assert(String(sponsor).toLowerCase() === SPONSOR, 'On-chain Pilot #2 sponsor mismatch.');
  assert(String(root).toLowerCase() === ROOT, 'On-chain Pilot #2 root mismatch.');
  assert(BigInt(totalAllocated) === TOTAL, 'On-chain Pilot #2 allocation mismatch.');
  assert(BigInt(totalClaimed) === TOTAL, 'Pilot #2 did not claim the exact 0.05 USDG pool.');
  assert(BigInt(claimCount) === BigInt(WALLETS.length), 'Pilot #2 claim count is not exactly five.');
  assert(BigInt(balance) === 0n, 'Pilot #2 contract still holds reward tokens after all five claims.');
  claimedFlags.forEach((claimed, index) => {
    assert(Boolean(claimed) === true, `Pilot #2 wallet is not marked claimed: ${WALLETS[index]}`);
  });

  console.log('FORGE MAINNET PILOT #2 AUDIT: PASSED');
  console.log(`Epoch: ${SLUG}`);
  console.log(`Claim contract: ${CONTRACT}`);
  console.log('Verified: backend locked + 5 proofs retained + 5/5 claimed + totalClaimed=0.05 USDG + claimCount=5 + contract balance=0.');
}

main().catch(error => {
  console.error(`FORGE MAINNET PILOT #2 AUDIT: FAILED — ${error?.message || error}`);
  process.exitCode = 1;
});

import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { AbiCoder, concat, getAddress, keccak256 } from 'ethers';

const SERVICE = process.env.FORGE_CLAIMS_URL || 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/forge-claims';
const RAW_WALLETS = String(process.env.FORGE_PILOT_WALLETS || '');
const SNAPSHOT_BLOCK = Number(process.env.FORGE_PILOT_SNAPSHOT_BLOCK || 0);
const OUTPUT = String(process.env.FORGE_PILOT_OUTPUT || '').trim();
const GENESIS = '0x107c4e7cf931b18e022d40184d03d00b4ec99d5a';
const USDG = '0x5fc5360d0400a0fd4f2af552add042d716f1d168';
const DECIMALS = 6;
const UNITS_PER_WALLET = 10_000n; // 0.01 USDG
const WALLET_COUNT = 5;
const TOTAL_UNITS = UNITS_PER_WALLET * BigInt(WALLET_COUNT); // 0.05 USDG

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function compareHex(a, b) {
  const A = BigInt(a), B = BigInt(b);
  return A === B ? 0 : (A < B ? -1 : 1);
}

function pairHash(a, b) {
  const ordered = compareHex(a, b) <= 0 ? [a, b] : [b, a];
  return keccak256(concat(ordered));
}

function claimLeaf(address, units) {
  const inner = keccak256(AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [getAddress(address), units]));
  return keccak256(inner);
}

function makeMerkle(entries) {
  const leaves = entries.map(entry => claimLeaf(entry.address, entry.units));
  const layers = [leaves];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) next.push(i + 1 < prev.length ? pairHash(prev[i], prev[i + 1]) : prev[i]);
    layers.push(next);
  }
  const root = layers[layers.length - 1][0];
  const claims = entries.map((entry, index) => {
    let idx = index;
    const proof = [];
    for (let level = 0; level < layers.length - 1; level++) {
      const layer = layers[level];
      const sibling = idx % 2 === 0 ? idx + 1 : idx - 1;
      if (sibling < layer.length) proof.push(layer[sibling]);
      idx = Math.floor(idx / 2);
    }
    return { ...entry, leaf: leaves[index], proof };
  });
  return { root, claims };
}

function verifyProof(leaf, proof, root) {
  let hash = leaf;
  for (const sibling of proof) hash = pairHash(hash, sibling);
  return hash.toLowerCase() === root.toLowerCase();
}

function parseWallets() {
  const raw = RAW_WALLETS.split(/[\s,;]+/).map(v => v.trim()).filter(Boolean);
  assert(raw.length === WALLET_COUNT, `Pilot #2 requires exactly ${WALLET_COUNT} wallet addresses.`);
  const wallets = raw.map(value => getAddress(value).toLowerCase());
  assert(new Set(wallets).size === WALLET_COUNT, 'Pilot #2 wallet list contains duplicates.');
  return wallets.sort();
}

async function assertLockedReleaseState() {
  const response = await fetch(`${SERVICE}?route=status`, { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  assert(response.status === 200, `FORGE release status failed (${response.status}).`);
  const mainnet = data?.mainnet || {};
  assert(Number(mainnet.chainId) === 4663, 'Release status is not Robinhood Mainnet.');
  assert(mainnet.masterEnabled === false, 'Mainnet master gate must be OFF while generating Pilot #2 package.');
  assert(mainnet.mode === 'locked', `Pilot #2 package generation requires locked mode, got ${mainnet.mode || 'unknown'}.`);
  assert(mainnet.canaryActive === false, 'A Mainnet release authorization is already active.');
  assert(mainnet.rpcReady === true, 'Dedicated production RPC is not ready.');
}

async function main() {
  assert(Number.isSafeInteger(SNAPSHOT_BLOCK) && SNAPSHOT_BLOCK > 0, 'FORGE_PILOT_SNAPSHOT_BLOCK must be a positive pinned Robinhood Mainnet block.');
  const wallets = parseWallets();
  await assertLockedReleaseState();

  const entries = wallets.map(address => ({ address, units: UNITS_PER_WALLET }));
  const tree = makeMerkle(entries);

  for (const claim of tree.claims) assert(verifyProof(claim.leaf, claim.proof, tree.root), `Generated proof failed self-check for ${claim.address}.`);
  const allocated = entries.reduce((sum, entry) => sum + entry.units, 0n);
  assert(allocated === TOTAL_UNITS, 'Pilot #2 exact reward total invariant failed.');

  const canonical = [
    'phase=pilot-2',
    'chain=robinhood',
    'chainId=4663',
    `source=${GENESIS}`,
    `snapshotBlock=${SNAPSHOT_BLOCK}`,
    `rewardToken=${USDG}`,
    `unitsPerWallet=${UNITS_PER_WALLET}`,
    `totalUnits=${TOTAL_UNITS}`,
    ...entries.map(entry => `${entry.address}:${entry.units}`),
  ].join('\n');
  const distributionFingerprint = `0x${createHash('sha256').update(canonical).digest('hex')}`;
  const claims = {};
  for (const claim of tree.claims) {
    claims[claim.address] = {
      amountUnits: claim.units.toString(),
      amount: '0.01',
      leaf: claim.leaf,
      proof: claim.proof,
    };
  }

  const pkg = {
    format: 'TOTZ_FORGE_MERKLE_V1',
    leafEncoding: 'keccak256(bytes.concat(keccak256(abi.encode(address,uint256))))',
    pairHashing: 'sorted-keccak256',
    root: tree.root,
    network: { name: 'Robinhood Chain', chainId: 4663, key: 'robinhood' },
    source: {
      contract: GENESIS,
      collection: 'TOTZ FORGE MAINNET PILOT #2 · OPERATOR ONLY',
      snapshotBlock: SNAPSHOT_BLOCK,
      snapshotUTC: new Date().toISOString(),
    },
    reward: { symbol: 'USDG', decimals: DECIMALS, totalUnits: TOTAL_UNITS.toString(), total: '0.05' },
    eligibleWallets: WALLET_COUNT,
    distributionFingerprint,
    createdUTC: new Date().toISOString(),
    claims,
  };

  const json = `${JSON.stringify(pkg, null, 2)}\n`;
  if (OUTPUT) {
    await writeFile(OUTPUT, json, 'utf8');
    console.error(`FORGE PILOT #2 PACKAGE: WROTE ${OUTPUT}`);
  } else {
    process.stdout.write(json);
  }
  console.error(`FORGE PILOT #2 PACKAGE: VALIDATED · ${WALLET_COUNT} wallets · 0.01 USDG each · 0.05 USDG exact pool · root ${tree.root}`);
}

main().catch(error => {
  console.error(`FORGE PILOT #2 PACKAGE: BLOCKED — ${error?.message || error}`);
  process.exitCode = 1;
});

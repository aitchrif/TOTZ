const assert = require('node:assert/strict');
const ganache = require('ganache');
const { ethers } = require('ethers');
const fs = require('node:fs');

const claimArtifact = JSON.parse(fs.readFileSync('artifacts/ForgeMerkleClaim.json', 'utf8'));
const tokenArtifact = JSON.parse(fs.readFileSync('artifacts/ForgeTestUSDG.json', 'utf8'));
const abi = ethers.AbiCoder.defaultAbiCoder();

function leaf(address, amount) {
  const inner = ethers.keccak256(abi.encode(['address', 'uint256'], [ethers.getAddress(address), BigInt(amount)]));
  return ethers.keccak256(inner);
}

function pairHash(a, b) {
  return BigInt(a) <= BigInt(b)
    ? ethers.keccak256(ethers.concat([a, b]))
    : ethers.keccak256(ethers.concat([b, a]));
}

function merkle(entries) {
  const leaves = entries.map((entry) => leaf(entry.address, entry.amount));
  const layers = [leaves];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      next.push(i + 1 < prev.length ? pairHash(prev[i], prev[i + 1]) : prev[i]);
    }
    layers.push(next);
  }
  const proofs = entries.map((_, index) => {
    let idx = index;
    const proof = [];
    for (let level = 0; level < layers.length - 1; level++) {
      const layer = layers[level];
      const sibling = idx % 2 === 0 ? idx + 1 : idx - 1;
      if (sibling < layer.length) proof.push(layer[sibling]);
      idx = Math.floor(idx / 2);
    }
    return proof;
  });
  return { root: layers[layers.length - 1][0], proofs };
}

async function expectRevert(action, label) {
  let reverted = false;
  try {
    await action();
  } catch (_) {
    reverted = true;
  }
  assert.equal(reverted, true, label);
}

async function deployClaim(factory, token, root, total, deadline, sponsor) {
  const contract = await factory.deploy(token, root, total, deadline, sponsor);
  await contract.waitForDeployment();
  return contract;
}

(async () => {
  const eip1193 = ganache.provider({
    logging: { quiet: true },
    wallet: { totalAccounts: 6, defaultBalance: 1000 },
    chain: { hardfork: 'shanghai' }
  });
  const provider = new ethers.BrowserProvider(eip1193);
  const sponsor = await provider.getSigner(0);
  const alice = await provider.getSigner(1);
  const bob = await provider.getSigner(2);
  const outsider = await provider.getSigner(3);
  const sponsorAddress = await sponsor.getAddress();
  const aliceAddress = await alice.getAddress();
  const bobAddress = await bob.getAddress();
  const outsiderAddress = await outsider.getAddress();

  const tokenFactory = new ethers.ContractFactory(tokenArtifact.abi, tokenArtifact.bytecode, sponsor);
  const token = await tokenFactory.deploy(6);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  const claimFactory = new ethers.ContractFactory(claimArtifact.abi, claimArtifact.bytecode, sponsor);
  const now = Number((await provider.getBlock('latest')).timestamp);

  // Happy path: exact funding, valid claims, and double-claim protection.
  const entries = [
    { address: aliceAddress, amount: 1_000n },
    { address: bobAddress, amount: 2_000n }
  ];
  const tree = merkle(entries);
  const claim = await deployClaim(claimFactory, tokenAddress, tree.root, 3_000n, now + 3600, sponsorAddress);
  const claimAddress = await claim.getAddress();
  assert.equal(await claim.isFullyFunded(), false, 'claim starts unfunded');
  await (await token.transfer(claimAddress, 3_000n)).wait();
  assert.equal(await claim.isFullyFunded(), true, 'exact pool marks claim fully funded');

  await expectRevert(
    async () => { await (await claim.connect(outsider).claim(1_000n, tree.proofs[0])).wait(); },
    'invalid wallet/proof must revert'
  );

  const aliceBefore = await token.balanceOf(aliceAddress);
  await (await claim.connect(alice).claim(1_000n, tree.proofs[0])).wait();
  assert.equal((await token.balanceOf(aliceAddress)) - aliceBefore, 1_000n, 'alice receives exact allocation');
  assert.equal(await claim.totalClaimed(), 1_000n, 'totalClaimed updates after first claim');
  assert.equal(await claim.claimCount(), 1n, 'claimCount updates after first claim');
  assert.equal(await claim.claimed(aliceAddress), true, 'claimed flag is persisted');
  await expectRevert(
    async () => { await (await claim.connect(alice).claim(1_000n, tree.proofs[0])).wait(); },
    'double claim must revert'
  );

  await (await claim.connect(bob).claim(2_000n, tree.proofs[1])).wait();
  assert.equal(await claim.totalClaimed(), 3_000n, 'all allocations can be claimed exactly');
  assert.equal(await claim.claimCount(), 2n, 'claimCount equals successful wallet claims');
  assert.equal(await claim.contractBalance(), 0n, 'fully claimed contract has no reward balance');
  assert.equal(await claim.isFullyFunded(), true, 'zero remaining obligation is solvent');
  await expectRevert(
    async () => { await (await claim.recoverUnclaimed()).wait(); },
    'sponsor cannot recover before deadline'
  );

  // Partial claim + deadline recovery: sponsor can recover only the remaining balance after expiry.
  const recoveryEntries = [
    { address: aliceAddress, amount: 400n },
    { address: bobAddress, amount: 600n }
  ];
  const recoveryTree = merkle(recoveryEntries);
  const recovery = await deployClaim(claimFactory, tokenAddress, recoveryTree.root, 1_000n, now + 120, sponsorAddress);
  const recoveryAddress = await recovery.getAddress();
  await (await token.transfer(recoveryAddress, 1_000n)).wait();
  await (await recovery.connect(alice).claim(400n, recoveryTree.proofs[0])).wait();
  assert.equal(await recovery.contractBalance(), 600n, 'unclaimed balance remains in contract');

  await provider.send('evm_increaseTime', [180]);
  await provider.send('evm_mine', []);
  await expectRevert(
    async () => { await (await recovery.connect(outsider).recoverUnclaimed()).wait(); },
    'non-sponsor recovery must revert'
  );
  await expectRevert(
    async () => { await (await recovery.connect(bob).claim(600n, recoveryTree.proofs[1])).wait(); },
    'claims must close after deadline'
  );
  const sponsorBeforeRecovery = await token.balanceOf(sponsorAddress);
  await (await recovery.recoverUnclaimed()).wait();
  assert.equal(await recovery.contractBalance(), 0n, 'recovery empties remaining reward balance');
  assert.equal((await token.balanceOf(sponsorAddress)) - sponsorBeforeRecovery, 600n, 'sponsor recovers only unclaimed amount');

  // Defense in depth: malformed roots cannot push accounting beyond declared pool.
  const overTree = merkle([{ address: aliceAddress, amount: 101n }]);
  const over = await deployClaim(claimFactory, tokenAddress, overTree.root, 100n, now + 7200, sponsorAddress);
  await (await token.transfer(await over.getAddress(), 101n)).wait();
  await expectRevert(
    async () => { await (await over.connect(alice).claim(101n, [])).wait(); },
    'claim above remaining declared allocation must revert'
  );
  assert.equal(await over.totalClaimed(), 0n, 'failed oversized claim cannot mutate accounting');

  // Zero-value leaves are rejected even if a proof is valid.
  const zeroTree = merkle([{ address: aliceAddress, amount: 0n }]);
  const zero = await deployClaim(claimFactory, tokenAddress, zeroTree.root, 1n, now + 7200, sponsorAddress);
  await (await token.transfer(await zero.getAddress(), 1n)).wait();
  await expectRevert(
    async () => { await (await zero.connect(alice).claim(0n, [])).wait(); },
    'zero amount claim must revert'
  );

  // Constructor rejects an EOA masquerading as the reward-token contract.
  await expectRevert(
    async () => {
      const bad = await claimFactory.deploy(outsiderAddress, tree.root, 1n, now + 7200, sponsorAddress);
      await bad.waitForDeployment();
    },
    'non-contract reward token address must revert at deployment'
  );

  console.log('FORGE claim contract tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

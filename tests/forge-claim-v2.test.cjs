const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const solc = require('solc');
const ganache = require('ganache');
const { ethers } = require('ethers');

function compile() {
  const sources = {
    'contracts/ForgeMerkleClaimV2.sol': {
      content: fs.readFileSync('contracts/ForgeMerkleClaimV2.sol', 'utf8')
    },
    'contracts/ForgeTestUSDG.sol': {
      content: fs.readFileSync('contracts/ForgeTestUSDG.sol', 'utf8')
    }
  };
  const input = {
    language: 'Solidity',
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } }
    }
  };
  function findImports(importPath) {
    try {
      return { contents: fs.readFileSync(path.resolve('node_modules', importPath), 'utf8') };
    } catch (_) {
      return { error: `Import not found: ${importPath}` };
    }
  }
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  const errors = (output.errors || []).filter((entry) => entry.severity === 'error');
  if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage).join('\n'));
  function artifact(source, name) {
    const contract = output.contracts[source][name];
    return { abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}` };
  }
  return {
    claim: artifact('contracts/ForgeMerkleClaimV2.sol', 'ForgeMerkleClaimV2'),
    token: artifact('contracts/ForgeTestUSDG.sol', 'ForgeTestUSDG')
  };
}

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

const TYPES = {
  ClaimAuthorization: [
    { name: 'account', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'authorizationDeadline', type: 'uint256' }
  ]
};
function domain(chainId, verifyingContract) {
  return {
    name: 'TOTZ FORGE Claim',
    version: '2',
    chainId,
    verifyingContract
  };
}
async function signAuthorization(signer, chainId, verifyingContract, value) {
  return signer.signTypedData(domain(chainId, verifyingContract), TYPES, value);
}

(async () => {
  const artifacts = compile();
  const eip1193 = ganache.provider({
    logging: { quiet: true },
    wallet: { totalAccounts: 8, defaultBalance: 1000 },
    chain: { hardfork: 'shanghai', chainId: 46630 }
  });
  const provider = new ethers.BrowserProvider(eip1193);
  const sponsor = await provider.getSigner(0);
  const alice = await provider.getSigner(1);
  const bob = await provider.getSigner(2);
  const relayer = await provider.getSigner(3);
  const outsider = await provider.getSigner(4);

  const sponsorAddress = await sponsor.getAddress();
  const aliceAddress = await alice.getAddress();
  const bobAddress = await bob.getAddress();
  const relayerAddress = await relayer.getAddress();
  const outsiderAddress = await outsider.getAddress();
  const chainId = Number((await provider.getNetwork()).chainId);
  assert.equal(chainId, 46630, 'test harness must exercise Robinhood Testnet chain ID');

  const tokenFactory = new ethers.ContractFactory(artifacts.token.abi, artifacts.token.bytecode, sponsor);
  const token = await tokenFactory.deploy(6);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  const claimFactory = new ethers.ContractFactory(artifacts.claim.abi, artifacts.claim.bytecode, sponsor);
  const now = Number((await provider.getBlock('latest')).timestamp);

  async function deployEpoch(entries, ttl = 3600) {
    const tree = merkle(entries);
    const total = entries.reduce((sum, entry) => sum + BigInt(entry.amount), 0n);
    const claim = await claimFactory.deploy(tokenAddress, tree.root, total, now + ttl, sponsorAddress);
    await claim.waitForDeployment();
    await (await token.transfer(await claim.getAddress(), total)).wait();
    return { claim, tree, total };
  }

  // 1) V1-compatible direct claim remains available and advances the relay nonce.
  const directEpoch = await deployEpoch([{ address: aliceAddress, amount: 1_000n }]);
  assert.equal(await directEpoch.claim.authorizationNonces(aliceAddress), 0n, 'direct claimant starts at nonce zero');
  const aliceBefore = await token.balanceOf(aliceAddress);
  await (await directEpoch.claim.connect(alice).claim(1_000n, [])).wait();
  assert.equal((await token.balanceOf(aliceAddress)) - aliceBefore, 1_000n, 'direct claim pays exact allocation');
  assert.equal(await directEpoch.claim.authorizationNonces(aliceAddress), 1n, 'direct claim invalidates old relay authorizations');

  // 2) Holder signs EIP-712 authorization; an unrelated relayer submits it and receives nothing.
  const relayEpoch = await deployEpoch([
    { address: bobAddress, amount: 2_000n },
    { address: outsiderAddress, amount: 500n }
  ]);
  const relayAddress = await relayEpoch.claim.getAddress();
  const authDeadline = now + 1800;
  const authorization = {
    account: bobAddress,
    amount: 2_000n,
    nonce: 0n,
    authorizationDeadline: authDeadline
  };
  const signature = await signAuthorization(bob, chainId, relayAddress, authorization);
  const offchainDigest = ethers.TypedDataEncoder.hash(domain(chainId, relayAddress), TYPES, authorization);
  const onchainDigest = await relayEpoch.claim.claimAuthorizationDigest(
    bobAddress,
    2_000n,
    0n,
    authDeadline
  );
  assert.equal(onchainDigest, offchainDigest, 'on-chain and wallet EIP-712 digests must match exactly');

  const bobBefore = await token.balanceOf(bobAddress);
  const relayerBefore = await token.balanceOf(relayerAddress);
  await (await relayEpoch.claim.connect(relayer).claimFor(
    bobAddress,
    2_000n,
    relayEpoch.tree.proofs[0],
    0n,
    authDeadline,
    signature
  )).wait();
  assert.equal((await token.balanceOf(bobAddress)) - bobBefore, 2_000n, 'relayed claim pays holder exactly');
  assert.equal((await token.balanceOf(relayerAddress)) - relayerBefore, 0n, 'relayer cannot receive holder rewards');
  assert.equal(await relayEpoch.claim.authorizationNonces(bobAddress), 1n, 'successful relay consumes nonce');
  assert.equal(await relayEpoch.claim.claimed(bobAddress), true, 'relayed holder is marked claimed');

  // 3) Exact replay of a consumed authorization must fail.
  await expectRevert(
    async () => {
      await (await relayEpoch.claim.connect(relayer).claimFor(
        bobAddress,
        2_000n,
        relayEpoch.tree.proofs[0],
        0n,
        authDeadline,
        signature
      )).wait();
    },
    'consumed EIP-712 authorization must not replay'
  );

  // 4) A relayer cannot redirect a valid holder signature to itself or any other account.
  const redirectEpoch = await deployEpoch([{ address: bobAddress, amount: 777n }]);
  const redirectAddress = await redirectEpoch.claim.getAddress();
  const redirectAuthorization = {
    account: bobAddress,
    amount: 777n,
    nonce: 0n,
    authorizationDeadline: authDeadline
  };
  const redirectSignature = await signAuthorization(bob, chainId, redirectAddress, redirectAuthorization);
  const outsiderBefore = await token.balanceOf(outsiderAddress);
  await expectRevert(
    async () => {
      await (await redirectEpoch.claim.connect(relayer).claimFor(
        outsiderAddress,
        777n,
        [],
        0n,
        authDeadline,
        redirectSignature
      )).wait();
    },
    'relayer must not redirect holder authorization to a different account'
  );
  assert.equal(await token.balanceOf(outsiderAddress), outsiderBefore, 'redirect target receives no reward');
  assert.equal(await redirectEpoch.claim.contractBalance(), 777n, 'failed redirect leaves reward pool untouched');
  assert.equal(await redirectEpoch.claim.authorizationNonces(bobAddress), 0n, 'failed redirect does not consume holder nonce');

  // 5) Domain separation blocks cross-contract replay even when root, holder and amount match.
  await expectRevert(
    async () => {
      await (await redirectEpoch.claim.connect(relayer).claimFor(
        bobAddress,
        2_000n,
        [],
        0n,
        authDeadline,
        signature
      )).wait();
    },
    'signature from another claim contract must not validate here'
  );

  // 6) Wrong nonce and expired authorizations fail before any reward or nonce mutation.
  const wrongNonceAuthorization = {
    account: bobAddress,
    amount: 777n,
    nonce: 1n,
    authorizationDeadline: authDeadline
  };
  const wrongNonceSignature = await signAuthorization(bob, chainId, redirectAddress, wrongNonceAuthorization);
  await expectRevert(
    async () => {
      await (await redirectEpoch.claim.connect(relayer).claimFor(
        bobAddress,
        777n,
        [],
        1n,
        authDeadline,
        wrongNonceSignature
      )).wait();
    },
    'future nonce must be rejected'
  );
  const expiredDeadline = now - 1;
  const expiredAuthorization = {
    account: bobAddress,
    amount: 777n,
    nonce: 0n,
    authorizationDeadline: expiredDeadline
  };
  const expiredSignature = await signAuthorization(bob, chainId, redirectAddress, expiredAuthorization);
  await expectRevert(
    async () => {
      await (await redirectEpoch.claim.connect(relayer).claimFor(
        bobAddress,
        777n,
        [],
        0n,
        expiredDeadline,
        expiredSignature
      )).wait();
    },
    'expired holder authorization must be rejected'
  );
  assert.equal(await redirectEpoch.claim.authorizationNonces(bobAddress), 0n, 'failed auth checks cannot consume nonce');

  // 7) A valid signature with a bad Merkle proof reverts atomically and can still be retried correctly.
  await expectRevert(
    async () => {
      await (await redirectEpoch.claim.connect(relayer).claimFor(
        bobAddress,
        777n,
        [ethers.ZeroHash],
        0n,
        authDeadline,
        redirectSignature
      )).wait();
    },
    'bad proof must revert even with a valid holder signature'
  );
  assert.equal(await redirectEpoch.claim.authorizationNonces(bobAddress), 0n, 'bad proof must not burn authorization nonce');
  const bobBeforeRetry = await token.balanceOf(bobAddress);
  await (await redirectEpoch.claim.connect(relayer).claimFor(
    bobAddress,
    777n,
    [],
    0n,
    authDeadline,
    redirectSignature
  )).wait();
  assert.equal((await token.balanceOf(bobAddress)) - bobBeforeRetry, 777n, 'same authorization can succeed after proof correction');

  // 8) Sponsor recovery boundary is unchanged from V1.
  const recoveryEpoch = await deployEpoch([{ address: outsiderAddress, amount: 333n }], 120);
  await expectRevert(
    async () => { await (await recoveryEpoch.claim.recoverUnclaimed()).wait(); },
    'sponsor cannot recover while claim window is open'
  );
  await provider.send('evm_increaseTime', [180]);
  await provider.send('evm_mine', []);
  await expectRevert(
    async () => { await (await recoveryEpoch.claim.connect(relayer).recoverUnclaimed()).wait(); },
    'non-sponsor cannot recover expired pool'
  );
  const sponsorBeforeRecovery = await token.balanceOf(sponsorAddress);
  await (await recoveryEpoch.claim.recoverUnclaimed()).wait();
  assert.equal((await token.balanceOf(sponsorAddress)) - sponsorBeforeRecovery, 333n, 'sponsor recovers exact unclaimed balance');

  console.log('FORGE Merkle Claim V2 EIP-712 / relay security tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

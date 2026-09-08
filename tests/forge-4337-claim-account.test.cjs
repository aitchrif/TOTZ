const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const solc = require('solc');
const ganache = require('ganache');
const {
  BrowserProvider,
  ContractFactory,
  Interface,
  Wallet,
  ZeroHash,
  getBytes,
  id,
} = require('ethers');

const ACCOUNT_FILE = 'contracts/Forge4337ClaimAccount.sol';
const MOCK_FILE = 'contracts/Forge4337ClaimTargetMock.sol';
const MOCK_SOURCE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
contract Forge4337ClaimTargetMock {
    uint256 public count;
    address public lastAccount;
    uint256 public lastAmount;
    function claimFor(
        address account,
        uint256 amount,
        bytes32[] calldata,
        uint256,
        uint256,
        bytes calldata
    ) external {
        count += 1;
        lastAccount = account;
        lastAmount = amount;
    }
    function wrongSelector() external {}
}`;

function compile() {
  const input = {
    language: 'Solidity',
    sources: {
      [ACCOUNT_FILE]: { content: fs.readFileSync(ACCOUNT_FILE, 'utf8') },
      [MOCK_FILE]: { content: MOCK_SOURCE },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
    },
  };
  function findImports(importPath) {
    try { return { contents: fs.readFileSync(path.resolve('node_modules', importPath), 'utf8') }; }
    catch (_) { return { error: `Import not found: ${importPath}` }; }
  }
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  const errors = (output.errors || []).filter((entry) => entry.severity === 'error');
  if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage).join('\n'));
  const account = output.contracts[ACCOUNT_FILE].Forge4337ClaimAccount;
  const mock = output.contracts[MOCK_FILE].Forge4337ClaimTargetMock;
  return {
    account: { abi: account.abi, bytecode: `0x${account.evm.bytecode.object}`, runtime: `0x${account.evm.deployedBytecode.object}` },
    mock: { abi: mock.abi, bytecode: `0x${mock.evm.bytecode.object}` },
  };
}

async function expectRevert(promise, label) {
  let reverted = false;
  try { await promise; } catch (_) { reverted = true; }
  assert.equal(reverted, true, label);
}

async function main() {
  const built = compile();
  assert.notEqual(built.account.runtime, '0x', 'account runtime must compile');

  const eip1193 = ganache.provider({
    logging: { quiet: true },
    wallet: { totalAccounts: 5 },
    chain: { chainId: 1337 },
  });
  const provider = new BrowserProvider(eip1193);
  const initialAccounts = Object.values(eip1193.getInitialAccounts());
  assert.ok(initialAccounts.length >= 4, 'Ganache must expose deterministic local test accounts');

  // Use Ganache JSON-RPC signers for transactions so nonce handling stays authoritative.
  // Use isolated in-memory wallets only for the message signatures validated by the account.
  const owner = await provider.getSigner(0);
  const entryPoint = await provider.getSigner(1);
  const outsider = await provider.getSigner(2);
  const holder = await provider.getSigner(3);
  const ownerSigningWallet = new Wallet(initialAccounts[0].secretKey);
  const outsiderSigningWallet = new Wallet(initialAccounts[2].secretKey);

  assert.equal(ownerSigningWallet.address.toLowerCase(), (await owner.getAddress()).toLowerCase());
  assert.equal(outsiderSigningWallet.address.toLowerCase(), (await outsider.getAddress()).toLowerCase());

  const mockFactory = new ContractFactory(built.mock.abi, built.mock.bytecode, owner);
  const mock = await mockFactory.deploy();
  await mock.waitForDeployment();

  const accountFactory = new ContractFactory(built.account.abi, built.account.bytecode, owner);
  const account = await accountFactory.deploy(await owner.getAddress(), await entryPoint.getAddress());
  await account.waitForDeployment();

  assert.equal((await account.owner()).toLowerCase(), (await owner.getAddress()).toLowerCase());
  assert.equal((await account.entryPoint()).toLowerCase(), (await entryPoint.getAddress()).toLowerCase());

  const claimIface = new Interface([
    'function claimFor(address,uint256,bytes32[],uint256,uint256,bytes)',
    'function wrongSelector()',
  ]);
  const claimData = claimIface.encodeFunctionData('claimFor', [
    await holder.getAddress(),
    123n,
    [],
    0n,
    9999999999n,
    '0x1234',
  ]);

  await (await account.connect(owner).execute(await mock.getAddress(), 0n, claimData)).wait();
  assert.equal(await mock.count(), 1n, 'approved claimFor call should execute');
  assert.equal((await mock.lastAccount()).toLowerCase(), (await holder.getAddress()).toLowerCase());
  assert.equal(await mock.lastAmount(), 123n);

  await expectRevert(
    account.connect(outsider).execute.staticCall(await mock.getAddress(), 0n, claimData),
    'outsider must not execute through service account',
  );
  await expectRevert(
    account.connect(owner).execute.staticCall(await mock.getAddress(), 1n, claimData),
    'non-zero native value must be rejected',
  );
  await expectRevert(
    account.connect(owner).execute.staticCall(await mock.getAddress(), 0n, claimIface.encodeFunctionData('wrongSelector')),
    'arbitrary call selectors must be rejected',
  );
  await expectRevert(
    account.connect(owner).execute.staticCall('0x0000000000000000000000000000000000000001', 0n, claimData),
    'non-contract targets must be rejected',
  );

  const userOpHash = id('FORGE_4337_ACCOUNT_TEST');
  const validSignature = await ownerSigningWallet.signMessage(getBytes(userOpHash));
  const invalidSignature = await outsiderSigningWallet.signMessage(getBytes(userOpHash));
  const baseUserOp = {
    sender: await account.getAddress(),
    nonce: 0n,
    initCode: '0x',
    callData: '0x',
    accountGasLimits: ZeroHash,
    preVerificationGas: 0n,
    gasFees: ZeroHash,
    paymasterAndData: '0x',
    signature: validSignature,
  };

  const valid = await account.connect(entryPoint).validateUserOp.staticCall(baseUserOp, userOpHash, 0n);
  assert.equal(valid, 0n, 'valid owner signature must pass EntryPoint validation');

  const badSig = await account.connect(entryPoint).validateUserOp.staticCall(
    { ...baseUserOp, signature: invalidSignature }, userOpHash, 0n,
  );
  assert.equal(badSig, 1n, 'wrong owner signature must fail validation');

  const wrongSender = await account.connect(entryPoint).validateUserOp.staticCall(
    { ...baseUserOp, sender: await outsider.getAddress() }, userOpHash, 0n,
  );
  assert.equal(wrongSender, 1n, 'wrong UserOperation sender must fail validation');

  const missingFunds = await account.connect(entryPoint).validateUserOp.staticCall(baseUserOp, userOpHash, 1n);
  assert.equal(missingFunds, 1n, 'non-sponsored missing account funds must fail closed');

  await expectRevert(
    account.connect(outsider).validateUserOp.staticCall(baseUserOp, userOpHash, 0n),
    'validateUserOp must only accept the immutable EntryPoint caller',
  );

  console.log('FORGE 4337 CLAIM ACCOUNT SECURITY SUITE: PASSED');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import solc from 'solc';
import {
  AbiCoder,
  ContractFactory,
  JsonRpcProvider,
  Wallet,
  formatEther,
  formatUnits,
  getAddress,
  keccak256,
} from 'ethers';

const CHAIN_ID = 46630;
const RPC = process.env.FORGE_TESTNET_RPC_URL || 'https://rpc.testnet.chain.robinhood.com';
const PRIVATE_KEY = String(process.env.FORGE_TESTNET_OPERATOR_PRIVATE_KEY || '').trim();
const STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY || '';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function short(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function compile() {
  const sources = {
    'contracts/ForgeMerkleClaimV2.sol': {
      content: requireText('contracts/ForgeMerkleClaimV2.sol'),
    },
    'contracts/ForgeTestUSDG.sol': {
      content: requireText('contracts/ForgeTestUSDG.sol'),
    },
  };

  const input = {
    language: 'Solidity',
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  };

  function findImports(importPath) {
    try {
      return { contents: requireText(path.resolve('node_modules', importPath)) };
    } catch (_) {
      return { error: `Import not found: ${importPath}` };
    }
  }

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  const errors = (output.errors || []).filter((entry) => entry.severity === 'error');
  if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage).join('\n'));

  function artifact(source, name) {
    const c = output.contracts[source][name];
    return { abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` };
  }

  return {
    claim: artifact('contracts/ForgeMerkleClaimV2.sol', 'ForgeMerkleClaimV2'),
    token: artifact('contracts/ForgeTestUSDG.sol', 'ForgeTestUSDG'),
  };
}

function requireText(file) {
  // Imported through createRequire-free sync path to keep the live script dependency-light.
  // solc import callbacks are synchronous by design.
  return globalThis.__forgeReadText(file);
}

const abi = AbiCoder.defaultAbiCoder();
function leaf(address, amount) {
  const inner = keccak256(abi.encode(['address', 'uint256'], [getAddress(address), BigInt(amount)]));
  return keccak256(inner);
}

const TYPES = {
  ClaimAuthorization: [
    { name: 'account', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'authorizationDeadline', type: 'uint256' },
  ],
};

function domain(verifyingContract) {
  return {
    name: 'TOTZ FORGE Claim',
    version: '2',
    chainId: CHAIN_ID,
    verifyingContract,
  };
}

async function main() {
  assert(/^0x[a-fA-F0-9]{64}$/.test(PRIVATE_KEY), 'Missing/invalid FORGE_TESTNET_OPERATOR_PRIVATE_KEY');

  const { readFileSync } = await import('node:fs');
  globalThis.__forgeReadText = (file) => readFileSync(file, 'utf8');
  const artifacts = compile();

  const provider = new JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });
  const network = await provider.getNetwork();
  assert(Number(network.chainId) === CHAIN_ID, `FAIL-CLOSED: expected Robinhood Testnet ${CHAIN_ID}, got ${network.chainId}`);

  const operator = new Wallet(PRIVATE_KEY, provider);
  const operatorBalanceBefore = await provider.getBalance(operator.address);
  assert(operatorBalanceBefore > 0n, `Testnet operator ${operator.address} has no native gas`);

  const holder = Wallet.createRandom();
  const holderAddress = holder.address;
  const holderNativeBefore = await provider.getBalance(holderAddress);
  assert(holderNativeBefore === 0n, 'Ephemeral holder unexpectedly has native gas before the test');

  const amount = 1n; // 0.01 tUSDG at 2 decimals
  const root = leaf(holderAddress, amount);
  const latest = await provider.getBlock('latest');
  assert(latest, 'Could not read latest Testnet block');
  const epochDeadline = Number(latest.timestamp) + 3600;

  console.log(`Robinhood Testnet chain guard PASS (${CHAIN_ID})`);
  console.log(`Operator/relayer: ${operator.address}`);
  console.log(`Ephemeral holder (0 native gas): ${holderAddress}`);

  const tokenFactory = new ContractFactory(artifacts.token.abi, artifacts.token.bytecode, operator);
  const token = await tokenFactory.deploy(2);
  const tokenDeployTx = token.deploymentTransaction();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log(`ForgeTestUSDG: ${tokenAddress}`);

  const claimFactory = new ContractFactory(artifacts.claim.abi, artifacts.claim.bytecode, operator);
  const claim = await claimFactory.deploy(tokenAddress, root, amount, epochDeadline, operator.address);
  const claimDeployTx = claim.deploymentTransaction();
  await claim.waitForDeployment();
  const claimAddress = await claim.getAddress();
  console.log(`ForgeMerkleClaimV2: ${claimAddress}`);

  const fundTx = await token.transfer(claimAddress, amount);
  const fundReceipt = await fundTx.wait();
  assert(Number(fundReceipt?.status || 0) === 1, 'Funding transaction failed');
  assert(await claim.isFullyFunded(), 'V2 claim contract is not fully funded');
  assert(BigInt(await claim.contractBalance()) === amount, 'V2 funded balance mismatch');
  console.log(`Funded exact pool: ${amount} unit (0.01 tUSDG)`);

  const nonce = BigInt(await claim.authorizationNonces(holderAddress));
  assert(nonce === 0n, 'Fresh holder authorization nonce is not zero');
  const authorizationDeadline = Number(latest.timestamp) + 1800;
  const authorization = {
    account: holderAddress,
    amount,
    nonce,
    authorizationDeadline,
  };
  const signature = await holder.signTypedData(domain(claimAddress), TYPES, authorization);

  const localDigest = keccak256('0x00'); // initialized only to keep logging branch explicit
  void localDigest;
  const onchainDigest = await claim.claimAuthorizationDigest(holderAddress, amount, nonce, authorizationDeadline);
  const { TypedDataEncoder } = await import('ethers');
  const expectedDigest = TypedDataEncoder.hash(domain(claimAddress), TYPES, authorization);
  assert(onchainDigest === expectedDigest, 'EIP-712 digest mismatch between holder and live V2 contract');
  console.log('Holder EIP-712 authorization signed off-chain; holder still has 0 native gas');

  await claim.claimFor.staticCall(holderAddress, amount, [], nonce, authorizationDeadline, signature);
  const relayGas = BigInt(await claim.claimFor.estimateGas(holderAddress, amount, [], nonce, authorizationDeadline, signature));
  const feeData = await provider.getFeeData();
  const gasPrice = BigInt(feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n);
  console.log(`Relay estimate: ${relayGas} gas @ ${formatUnits(gasPrice, 9)} gwei`);

  const holderTokenBefore = BigInt(await token.balanceOf(holderAddress));
  const relayerTokenBefore = BigInt(await token.balanceOf(operator.address));
  const relayerNativeBefore = await provider.getBalance(operator.address);

  const relayTx = await claim.claimFor(holderAddress, amount, [], nonce, authorizationDeadline, signature);
  const relayReceipt = await relayTx.wait();
  assert(Number(relayReceipt?.status || 0) === 1, 'Relayed claim transaction failed');

  const holderTokenAfter = BigInt(await token.balanceOf(holderAddress));
  const relayerTokenAfter = BigInt(await token.balanceOf(operator.address));
  const holderNativeAfter = await provider.getBalance(holderAddress);
  const relayerNativeAfter = await provider.getBalance(operator.address);

  assert(holderTokenAfter - holderTokenBefore === amount, 'Holder did not receive exact allocation');
  assert(relayerTokenAfter - relayerTokenBefore === 0n, 'Relayer received holder reward unexpectedly');
  assert(holderNativeAfter === holderNativeBefore && holderNativeAfter === 0n, 'Holder paid native gas unexpectedly');
  assert(relayerNativeAfter < relayerNativeBefore, 'Relayer did not pay native transaction gas');
  assert(await claim.claimed(holderAddress), 'Holder is not marked claimed');
  assert(BigInt(await claim.authorizationNonces(holderAddress)) === 1n, 'Authorization nonce did not advance');
  assert(BigInt(await claim.totalClaimed()) === amount, 'totalClaimed mismatch');
  assert(BigInt(await claim.claimCount()) === 1n, 'claimCount mismatch');
  assert(BigInt(await claim.contractBalance()) === 0n, 'Claim contract should be empty after full claim');

  let replayRejected = false;
  try {
    await claim.claimFor.staticCall(holderAddress, amount, [], nonce, authorizationDeadline, signature);
  } catch (_) {
    replayRejected = true;
  }
  assert(replayRejected, 'Consumed authorization unexpectedly replayed');

  const result = {
    status: 'PASS',
    chainId: CHAIN_ID,
    operator: operator.address,
    holder: holderAddress,
    holderNativeBefore: holderNativeBefore.toString(),
    holderNativeAfter: holderNativeAfter.toString(),
    token: tokenAddress,
    claim: claimAddress,
    amountUnits: amount.toString(),
    tokenDeployTx: tokenDeployTx?.hash || null,
    claimDeployTx: claimDeployTx?.hash || null,
    fundTx: fundTx.hash,
    relayTx: relayTx.hash,
    relayGasEstimate: relayGas.toString(),
    relayGasUsed: relayReceipt.gasUsed.toString(),
    relayerNativeSpentWei: (relayerNativeBefore - relayerNativeAfter).toString(),
    replayRejected,
    claimCount: (await claim.claimCount()).toString(),
    totalClaimed: (await claim.totalClaimed()).toString(),
    contractBalance: (await claim.contractBalance()).toString(),
  };

  await writeFile('forge-v2-live-testnet-result.json', `${JSON.stringify(result, null, 2)}\n`);

  const summary = [
    '# TOTZ FORGE V2 Live Testnet — PASS',
    '',
    `- Chain: Robinhood Testnet (${CHAIN_ID})`,
    `- Operator / relayer: \`${operator.address}\``,
    `- Gasless holder: \`${holderAddress}\``,
    `- Holder native balance before: \`${formatEther(holderNativeBefore)} ETH\``,
    `- Holder native balance after: \`${formatEther(holderNativeAfter)} ETH\``,
    `- Test token: \`${tokenAddress}\``,
    `- V2 claim contract: \`${claimAddress}\``,
    `- Token deploy tx: \`${tokenDeployTx?.hash || 'n/a'}\``,
    `- Claim deploy tx: \`${claimDeployTx?.hash || 'n/a'}\``,
    `- Fund tx: \`${fundTx.hash}\``,
    `- Relayed claim tx: \`${relayTx.hash}\``,
    `- Relay gas used: \`${relayReceipt.gasUsed.toString()}\``,
    `- Reward destination integrity: PASS`,
    `- Holder paid gas: NO`,
    `- Replay rejected: YES`,
    `- Final claimCount: \`${(await claim.claimCount()).toString()}\``,
    `- Final contract reward balance: \`${(await claim.contractBalance()).toString()}\``,
  ].join('\n');

  console.log(summary);
  if (STEP_SUMMARY) await appendFile(STEP_SUMMARY, `${summary}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

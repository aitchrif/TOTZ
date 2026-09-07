import { readFileSync } from 'node:fs';
import { writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import solc from 'solc';
import {
  AbiCoder,
  Contract,
  ContractFactory,
  Interface,
  JsonRpcProvider,
  Wallet,
  formatEther,
  getAddress,
  keccak256,
} from 'ethers';

const CHAIN_ID = 46630;
const RPC = process.env.FORGE_TESTNET_RPC_URL || 'https://rpc.testnet.chain.robinhood.com';
const PRIVATE_KEY = String(process.env.FORGE_TESTNET_OPERATOR_PRIVATE_KEY || '').trim();
const STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY || '';
const ENTRY_POINT = '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function compile() {
  const files = [
    'contracts/ForgeMerkleClaimV2.sol',
    'contracts/ForgeTestUSDG.sol',
    'contracts/Forge4337TestAccount.sol',
  ];
  const sources = Object.fromEntries(files.map((file) => [file, { content: readFileSync(file, 'utf8') }]));
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
      return { contents: readFileSync(path.resolve('node_modules', importPath), 'utf8') };
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
    account: artifact('contracts/Forge4337TestAccount.sol', 'Forge4337TestAccount'),
  };
}

const coder = AbiCoder.defaultAbiCoder();
function leaf(address, amount) {
  const inner = keccak256(coder.encode(['address', 'uint256'], [getAddress(address), BigInt(amount)]));
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

async function main() {
  assert(/^0x[a-fA-F0-9]{64}$/.test(PRIVATE_KEY), 'Missing/invalid FORGE_TESTNET_OPERATOR_PRIVATE_KEY');
  const artifacts = compile();
  const provider = new JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });
  const network = await provider.getNetwork();
  assert(Number(network.chainId) === CHAIN_ID, `FAIL-CLOSED: expected chain ${CHAIN_ID}, got ${network.chainId}`);
  const entryPointCode = await provider.getCode(ENTRY_POINT);
  assert(entryPointCode !== '0x', 'ERC-4337 EntryPoint v0.8 is not deployed on Robinhood Testnet');

  const operator = new Wallet(PRIVATE_KEY, provider);
  const operatorBalance = await provider.getBalance(operator.address);
  assert(operatorBalance > 0n, 'Dedicated Testnet operator has no native gas for fixture deployment');

  const holder = Wallet.createRandom();
  const holderNative = await provider.getBalance(holder.address);
  assert(holderNative === 0n, 'Ephemeral holder unexpectedly has native gas');
  const amount = 1n; // 0.01 tUSDG at 2 decimals
  const root = leaf(holder.address, amount);
  const latest = await provider.getBlock('latest');
  assert(latest, 'Could not read latest Testnet block');
  const epochDeadline = Number(latest.timestamp) + 7200;
  const authorizationDeadline = Number(latest.timestamp) + 3600;

  const tokenFactory = new ContractFactory(artifacts.token.abi, artifacts.token.bytecode, operator);
  const token = await tokenFactory.deploy(2);
  const tokenDeployTx = token.deploymentTransaction();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();

  const claimFactory = new ContractFactory(artifacts.claim.abi, artifacts.claim.bytecode, operator);
  const claim = await claimFactory.deploy(tokenAddress, root, amount, epochDeadline, operator.address);
  const claimDeployTx = claim.deploymentTransaction();
  await claim.waitForDeployment();
  const claimAddress = await claim.getAddress();

  const fundTx = await token.transfer(claimAddress, amount);
  await fundTx.wait();
  assert(await claim.isFullyFunded(), 'V2 sponsorship fixture is not fully funded');

  const accountFactory = new ContractFactory(artifacts.account.abi, artifacts.account.bytecode, operator);
  const account = await accountFactory.deploy(operator.address, ENTRY_POINT);
  const accountDeployTx = account.deploymentTransaction();
  await account.waitForDeployment();
  const accountAddress = await account.getAddress();
  const accountNative = await provider.getBalance(accountAddress);
  assert(accountNative === 0n, '4337 Test Account must start unfunded to prove paymaster sponsorship');

  const holderAuthorization = {
    account: holder.address,
    amount,
    nonce: 0n,
    authorizationDeadline,
  };
  const holderSignature = await holder.signTypedData({
    name: 'TOTZ FORGE Claim',
    version: '2',
    chainId: CHAIN_ID,
    verifyingContract: claimAddress,
  }, TYPES, holderAuthorization);

  // V2 claim validity is already covered by the live relay rehearsal and local security suite.
  // This preparation step only constructs the exact account.execute(claimFor(...)) payload that
  // the ERC-4337 EntryPoint will execute once Gas Manager supplies paymaster fields.
  const claimInterface = new Interface(artifacts.claim.abi);
  const accountInterface = new Interface(artifacts.account.abi);
  const claimForData = claimInterface.encodeFunctionData('claimFor', [
    holder.address,
    amount,
    [],
    0n,
    authorizationDeadline,
    holderSignature,
  ]);
  const accountCallData = accountInterface.encodeFunctionData('execute', [claimAddress, 0n, claimForData]);

  const entryPoint = new Contract(ENTRY_POINT, [
    'function getNonce(address sender,uint192 key) view returns (uint256)',
  ], provider);
  const userOpNonce = BigInt(await entryPoint.getNonce(accountAddress, 0));

  const feeData = await provider.getFeeData();
  const gasPrice = BigInt(feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n);
  const maxPriorityFeePerGas = BigInt(feeData.maxPriorityFeePerGas ?? gasPrice);
  const maxFeePerGas = BigInt(feeData.maxFeePerGas ?? gasPrice);
  assert(maxFeePerGas > 0n, 'RPC returned no usable fee data');

  const dummySignature = `0x${'ff'.repeat(65)}`;
  const fixture = {
    status: 'PREPARED',
    chainId: CHAIN_ID,
    entryPoint: ENTRY_POINT,
    operator: operator.address,
    smartAccount: accountAddress,
    smartAccountNativeWei: accountNative.toString(),
    holder: holder.address,
    holderNativeWei: holderNative.toString(),
    token: tokenAddress,
    claim: claimAddress,
    amountUnits: amount.toString(),
    epochDeadline,
    authorizationDeadline,
    holderSignature,
    claimForData,
    accountCallData,
    userOpNonce: `0x${userOpNonce.toString(16)}`,
    maxFeePerGas: `0x${maxFeePerGas.toString(16)}`,
    maxPriorityFeePerGas: `0x${maxPriorityFeePerGas.toString(16)}`,
    dummySignature,
    tokenDeployTx: tokenDeployTx?.hash || null,
    claimDeployTx: claimDeployTx?.hash || null,
    fundTx: fundTx.hash,
    accountDeployTx: accountDeployTx?.hash || null,
  };

  await writeFile('forge-v2-gas-manager-prep.json', `${JSON.stringify(fixture, null, 2)}\n`);
  const summary = [
    '# TOTZ FORGE V2 Gas Manager Live Testnet — PREPARED',
    '',
    `- Chain: Robinhood Testnet (${CHAIN_ID})`,
    `- EntryPoint v0.8: \`${ENTRY_POINT}\``,
    `- Operator: \`${operator.address}\``,
    `- Unfunded ERC-4337 relayer account: \`${accountAddress}\``,
    `- Relayer native balance: \`${formatEther(accountNative)} ETH\``,
    `- Zero-gas holder: \`${holder.address}\``,
    `- V2 claim contract: \`${claimAddress}\``,
    `- Reward token: \`${tokenAddress}\``,
    `- Claim allocation: 0.01 tUSDG`,
    `- Holder EIP-712 authorization: signed`,
    `- account.execute(claimFor(...)) calldata: prepared`,
    `- UserOp nonce: \`${fixture.userOpNonce}\``,
    `- No sponsored UserOperation submitted in this preparation step.`,
  ].join('\n');
  console.log(summary);
  if (STEP_SUMMARY) await appendFile(STEP_SUMMARY, `${summary}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

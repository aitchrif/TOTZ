import { readFile, writeFile, appendFile } from 'node:fs/promises';
import {
  Contract,
  Interface,
  JsonRpcProvider,
  Wallet,
  concat,
  formatEther,
  getAddress,
  getBytes,
  hexlify,
  toBeHex,
  zeroPadValue,
} from 'ethers';

const CHAIN_ID = 46630;
const RPC = process.env.FORGE_TESTNET_RPC_URL || 'https://rpc.testnet.chain.robinhood.com';
const PRIVATE_KEY = String(process.env.FORGE_TESTNET_OPERATOR_PRIVATE_KEY || '').trim();
const FIXTURE_PATH = 'tests/fixtures/forge-v2-gas-manager-live-1.json';
const STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY || '';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function uint128(value) { return zeroPadValue(toBeHex(BigInt(value)), 16); }
function packTwo128(high, low) { return hexlify(concat([uint128(high), uint128(low)])); }

async function main() {
  assert(/^0x[a-fA-F0-9]{64}$/.test(PRIVATE_KEY), 'Missing/invalid FORGE_TESTNET_OPERATOR_PRIVATE_KEY');
  const f = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));
  const provider = new JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });
  const network = await provider.getNetwork();
  assert(Number(network.chainId) === CHAIN_ID, `FAIL-CLOSED: expected Robinhood Testnet ${CHAIN_ID}, got ${network.chainId}`);

  const operator = new Wallet(PRIVATE_KEY, provider);
  assert(operator.address.toLowerCase() === String(f.operator).toLowerCase(), 'Operator secret mismatch');
  const s = f.sponsorship;

  const latest = await provider.getBlock('latest');
  assert(latest, 'Could not read latest block');
  assert(Number(latest.timestamp) < Number(f.authorizationDeadline), 'Holder authorization expired');

  const accountNativeBefore = await provider.getBalance(f.smartAccount);
  const holderNativeBefore = await provider.getBalance(f.holder);
  assert(accountNativeBefore === 0n, 'Smart account must remain unfunded before sponsorship execution');
  assert(holderNativeBefore === 0n, 'Holder must remain zero-gas before sponsorship execution');

  const accountGasLimits = packTwo128(s.verificationGasLimit, s.callGasLimit);
  const gasFees = packTwo128(s.maxPriorityFeePerGas, s.maxFeePerGas);
  const paymasterAndData = hexlify(concat([
    getAddress(s.paymaster),
    uint128(s.paymasterVerificationGasLimit),
    uint128(s.paymasterPostOpGasLimit),
    s.paymasterData,
  ]));

  const entryPointAbi = [
    'function getNonce(address sender,uint192 key) view returns (uint256)',
    'function getUserOpHash((address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature) userOp) view returns (bytes32)',
    'function handleOps((address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)[] ops,address payable beneficiary)',
  ];
  const entryPointRead = new Contract(f.entryPoint, entryPointAbi, provider);
  const currentNonce = BigInt(await entryPointRead.getNonce(f.smartAccount, 0));
  assert(currentNonce === BigInt(f.nonce), `UserOperation nonce changed: expected ${f.nonce}, got ${currentNonce}`);

  const dummySignature = `0x${'ff'.repeat(65)}`;
  const unsignedPacked = [
    getAddress(f.smartAccount),
    BigInt(f.nonce),
    '0x',
    f.accountCallData,
    accountGasLimits,
    BigInt(s.preVerificationGas),
    gasFees,
    paymasterAndData,
    dummySignature,
  ];
  const userOpHash = await entryPointRead.getUserOpHash(unsignedPacked);
  const accountSignature = await operator.signMessage(getBytes(userOpHash));
  const signedPacked = [...unsignedPacked.slice(0, 8), accountSignature];

  // Full EntryPoint simulation, including account validation, paymaster validation and V2 claim execution.
  const entryPoint = entryPointRead.connect(operator);
  await entryPoint.handleOps.staticCall([signedPacked], operator.address);

  const token = new Contract(f.token, ['function balanceOf(address) view returns (uint256)'], provider);
  const claim = new Contract(f.claim, [
    'function claimed(address) view returns (bool)',
    'function claimCount() view returns (uint256)',
    'function totalClaimed() view returns (uint256)',
    'function contractBalance() view returns (uint256)',
  ], provider);
  const holderTokenBefore = BigInt(await token.balanceOf(f.holder));
  const operatorNativeBefore = await provider.getBalance(operator.address);

  const tx = await entryPoint.handleOps([signedPacked], operator.address);
  const receipt = await tx.wait();
  assert(Number(receipt?.status || 0) === 1, 'EntryPoint handleOps transaction failed');

  const accountNativeAfter = await provider.getBalance(f.smartAccount);
  const holderNativeAfter = await provider.getBalance(f.holder);
  const holderTokenAfter = BigInt(await token.balanceOf(f.holder));
  const operatorNativeAfter = await provider.getBalance(operator.address);
  const finalNonce = BigInt(await entryPointRead.getNonce(f.smartAccount, 0));

  assert(accountNativeAfter === 0n, 'Sponsored smart account unexpectedly paid/funded native gas');
  assert(holderNativeAfter === 0n, 'Holder unexpectedly paid native gas');
  assert(holderTokenAfter - holderTokenBefore === BigInt(f.amountUnits), 'Holder did not receive exact V2 allocation');
  assert(await claim.claimed(f.holder), 'Holder not marked claimed after sponsored UserOperation');
  assert(BigInt(await claim.claimCount()) === 1n, 'claimCount != 1 after sponsored UserOperation');
  assert(BigInt(await claim.totalClaimed()) === BigInt(f.amountUnits), 'totalClaimed mismatch');
  assert(BigInt(await claim.contractBalance()) === 0n, 'V2 reward contract not empty after full sponsored claim');
  assert(finalNonce === currentNonce + 1n, 'ERC-4337 smart account nonce did not advance');

  const result = {
    status: 'PASS',
    chainId: CHAIN_ID,
    entryPoint: getAddress(f.entryPoint),
    policyId: s.policyId,
    paymaster: getAddress(s.paymaster),
    operator: operator.address,
    smartAccount: getAddress(f.smartAccount),
    holder: getAddress(f.holder),
    token: getAddress(f.token),
    claim: getAddress(f.claim),
    amountUnits: f.amountUnits,
    userOpHash,
    handleOpsTx: tx.hash,
    handleOpsGasUsed: receipt.gasUsed.toString(),
    smartAccountNativeBefore: accountNativeBefore.toString(),
    smartAccountNativeAfter: accountNativeAfter.toString(),
    holderNativeBefore: holderNativeBefore.toString(),
    holderNativeAfter: holderNativeAfter.toString(),
    holderTokenDelta: (holderTokenAfter - holderTokenBefore).toString(),
    entryPointNonceBefore: currentNonce.toString(),
    entryPointNonceAfter: finalNonce.toString(),
    operatorNativeDeltaWei: (operatorNativeAfter - operatorNativeBefore).toString(),
    claimCount: (await claim.claimCount()).toString(),
    totalClaimed: (await claim.totalClaimed()).toString(),
    claimContractBalance: (await claim.contractBalance()).toString(),
  };
  await writeFile('forge-v2-gas-manager-live-result.json', `${JSON.stringify(result, null, 2)}\n`);

  const summary = [
    '# TOTZ FORGE V2 Gas Manager Live Testnet — PASS',
    '',
    `- Chain: Robinhood Testnet (${CHAIN_ID})`,
    `- Gas Manager policy: \`${s.policyId}\``,
    `- Paymaster: \`${s.paymaster}\``,
    `- Smart account: \`${f.smartAccount}\` — native before/after: 0 / 0`,
    `- Holder: \`${f.holder}\` — native before/after: 0 / 0`,
    `- V2 claim: \`${f.claim}\``,
    `- Reward received: ${f.amountUnits} unit (0.01 tUSDG)`,
    `- UserOperation hash: \`${userOpHash}\``,
    `- EntryPoint handleOps tx: \`${tx.hash}\``,
    `- EntryPoint nonce: ${currentNonce} → ${finalNonce}`,
    `- claimCount: 1`,
    `- reward contract balance: 0`,
    `- Sponsored execution: PASS`,
  ].join('\n');
  console.log(summary);
  if (STEP_SUMMARY) await appendFile(STEP_SUMMARY, `${summary}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

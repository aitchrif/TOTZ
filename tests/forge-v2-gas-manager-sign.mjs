import { readFile, writeFile, appendFile } from 'node:fs/promises';
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  concat,
  getAddress,
  getBytes,
  hexlify,
  toBeHex,
  zeroPadValue,
} from 'ethers';

const CHAIN_ID = 46630;
const RPC = process.env.FORGE_TESTNET_RPC_URL || 'https://rpc.testnet.chain.robinhood.com';
const PRIVATE_KEY = String(process.env.FORGE_TESTNET_OPERATOR_PRIVATE_KEY || '').trim();
const STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY || '';
const FIXTURE_PATH = 'tests/fixtures/forge-v2-gas-manager-live-1.json';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function uint128(value) {
  return zeroPadValue(toBeHex(BigInt(value)), 16);
}

function packTwo128(high, low) {
  return hexlify(concat([uint128(high), uint128(low)]));
}

async function main() {
  assert(/^0x[a-fA-F0-9]{64}$/.test(PRIVATE_KEY), 'Missing/invalid FORGE_TESTNET_OPERATOR_PRIVATE_KEY');
  const fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));
  assert(Number(fixture.chainId) === CHAIN_ID, 'Fixture chainId is not Robinhood Testnet');

  const provider = new JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });
  const network = await provider.getNetwork();
  assert(Number(network.chainId) === CHAIN_ID, `FAIL-CLOSED: expected chain ${CHAIN_ID}, got ${network.chainId}`);

  const owner = new Wallet(PRIVATE_KEY, provider);
  assert(owner.address.toLowerCase() === String(fixture.operator).toLowerCase(), 'Testnet operator secret does not match fixture owner');

  const s = fixture.sponsorship;
  const accountGasLimits = packTwo128(s.verificationGasLimit, s.callGasLimit);
  const gasFees = packTwo128(s.maxPriorityFeePerGas, s.maxFeePerGas);
  const paymasterAndData = hexlify(concat([
    getAddress(s.paymaster),
    uint128(s.paymasterVerificationGasLimit),
    uint128(s.paymasterPostOpGasLimit),
    s.paymasterData,
  ]));

  const dummySignature = `0x${'ff'.repeat(65)}`;
  const packedUserOp = [
    getAddress(fixture.smartAccount),
    BigInt(fixture.nonce),
    '0x',
    fixture.accountCallData,
    accountGasLimits,
    BigInt(s.preVerificationGas),
    gasFees,
    paymasterAndData,
    dummySignature,
  ];

  const entryPoint = new Contract(fixture.entryPoint, [
    'function getUserOpHash((address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature) userOp) view returns (bytes32)',
  ], provider);

  const userOpHash = await entryPoint.getUserOpHash(packedUserOp);
  const signature = await owner.signMessage(getBytes(userOpHash));
  assert(/^0x[a-fA-F0-9]{130}$/.test(signature), 'Unexpected account UserOperation signature shape');

  const userOperation = {
    sender: getAddress(fixture.smartAccount),
    nonce: fixture.nonce,
    callData: fixture.accountCallData,
    callGasLimit: s.callGasLimit,
    verificationGasLimit: s.verificationGasLimit,
    preVerificationGas: s.preVerificationGas,
    maxFeePerGas: s.maxFeePerGas,
    maxPriorityFeePerGas: s.maxPriorityFeePerGas,
    paymaster: getAddress(s.paymaster),
    paymasterVerificationGasLimit: s.paymasterVerificationGasLimit,
    paymasterPostOpGasLimit: s.paymasterPostOpGasLimit,
    paymasterData: s.paymasterData,
    signature,
  };

  const result = {
    status: 'SIGNED',
    chainId: CHAIN_ID,
    entryPoint: getAddress(fixture.entryPoint),
    policyId: s.policyId,
    operator: owner.address,
    smartAccount: getAddress(fixture.smartAccount),
    smartAccountNativeWei: '0',
    holder: getAddress(fixture.holder),
    claim: getAddress(fixture.claim),
    token: getAddress(fixture.token),
    amountUnits: fixture.amountUnits,
    authorizationDeadline: fixture.authorizationDeadline,
    userOpHash,
    packed: {
      accountGasLimits,
      gasFees,
      paymasterAndData,
    },
    userOperation,
  };

  await writeFile('forge-v2-gas-manager-signed-userop.json', `${JSON.stringify(result, null, 2)}\n`);
  const summary = [
    '# TOTZ FORGE V2 Gas Manager — SIGNED USEROP',
    '',
    `- Chain: Robinhood Testnet (${CHAIN_ID})`,
    `- EntryPoint: \`${fixture.entryPoint}\``,
    `- Smart account: \`${fixture.smartAccount}\` (0 native gas)`,
    `- Holder: \`${fixture.holder}\` (0 native gas)`,
    `- V2 claim: \`${fixture.claim}\``,
    `- Gas Manager policy: \`${s.policyId}\``,
    `- Paymaster: \`${s.paymaster}\``,
    `- UserOperation hash: \`${userOpHash}\``,
    `- Owner signature: generated with dedicated Testnet operator`,
    `- No UserOperation broadcast by this signing step.`,
  ].join('\n');
  console.log(summary);
  if (STEP_SUMMARY) await appendFile(STEP_SUMMARY, `${summary}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

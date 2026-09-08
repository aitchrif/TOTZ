import { readFileSync } from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { AbiCoder, ContractFactory, JsonRpcProvider, Wallet, getAddress, keccak256 } from 'ethers';

const CHAIN_ID = 46630;
const RPC = process.env.FORGE_TESTNET_RPC_URL || 'https://rpc.testnet.chain.robinhood.com';
const PRIVATE_KEY = String(process.env.FORGE_TESTNET_OPERATOR_PRIVATE_KEY || '').trim();
const HOLDER = getAddress('0x7094A480062683B8391c1887fe7d277C0Ee23ED4');
const AMOUNT = 1n; // 0.01 tUSDG with 2 decimals

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function compile() {
  const files = ['contracts/ForgeMerkleClaimV2.sol', 'contracts/ForgeTestUSDG.sol'];
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
  const artifact = (source, name) => {
    const c = output.contracts[source][name];
    return { abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` };
  };
  return {
    token: artifact('contracts/ForgeTestUSDG.sol', 'ForgeTestUSDG'),
    claim: artifact('contracts/ForgeMerkleClaimV2.sol', 'ForgeMerkleClaimV2'),
  };
}

const coder = AbiCoder.defaultAbiCoder();
function leaf(address, amount) {
  const inner = keccak256(coder.encode(['address', 'uint256'], [getAddress(address), BigInt(amount)]));
  return keccak256(inner);
}

async function main() {
  assert(/^0x[a-fA-F0-9]{64}$/.test(PRIVATE_KEY), 'Missing/invalid FORGE_TESTNET_OPERATOR_PRIVATE_KEY');
  const provider = new JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });
  const network = await provider.getNetwork();
  assert(Number(network.chainId) === CHAIN_ID, `Wrong chain ${network.chainId}`);

  const operator = new Wallet(PRIVATE_KEY, provider);
  const artifacts = compile();
  const root = leaf(HOLDER, AMOUNT);
  const latest = await provider.getBlock('latest');
  assert(latest, 'No latest block');
  const deadline = Number(latest.timestamp) + 7200;

  const tokenFactory = new ContractFactory(artifacts.token.abi, artifacts.token.bytecode, operator);
  const token = await tokenFactory.deploy(2);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();

  const claimFactory = new ContractFactory(artifacts.claim.abi, artifacts.claim.bytecode, operator);
  const claim = await claimFactory.deploy(tokenAddress, root, AMOUNT, deadline, operator.address);
  await claim.waitForDeployment();
  const claimAddress = await claim.getAddress();

  const fundTx = await token.transfer(claimAddress, AMOUNT);
  await fundTx.wait();
  assert(await claim.isFullyFunded(), 'Fixture not fully funded');
  assert((await claim.contractBalance()) === AMOUNT, 'Unexpected claim balance');

  console.log('FORGE GASLESS UI CANARY FIXTURE: READY');
  console.log(`CHAIN_ID=${CHAIN_ID}`);
  console.log(`SPONSOR=${operator.address}`);
  console.log(`HOLDER=${HOLDER}`);
  console.log(`TOKEN=${tokenAddress}`);
  console.log(`CLAIM=${claimAddress}`);
  console.log(`MERKLE_ROOT=${root}`);
  console.log(`LEAF=${root}`);
  console.log(`AMOUNT_UNITS=${AMOUNT}`);
  console.log('REWARD_SYMBOL=tUSDG');
  console.log('REWARD_DECIMALS=2');
  console.log(`DEADLINE_UNIX=${deadline}`);
  console.log(`FUND_TX=${fundTx.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { Contract, ContractFactory, JsonRpcProvider, Wallet, getAddress } from 'ethers';

const CHAIN_ID = 46630;
const RPC = process.env.FORGE_TESTNET_RPC_URL || 'https://rpc.testnet.chain.robinhood.com';
const PRIVATE_KEY = String(process.env.FORGE_TESTNET_OPERATOR_PRIVATE_KEY || '').trim();
const NEW_OWNER = '0x7094A480062683B8391c1887fe7d277C0Ee23ED4';
const ENTRY_POINT = '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function compile() {
  const file = 'contracts/Forge4337TestAccount.sol';
  const input = {
    language: 'Solidity',
    sources: { [file]: { content: readFileSync(file, 'utf8') } },
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
  const c = output.contracts[file].Forge4337TestAccount;
  return { abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` };
}

async function main() {
  assert(/^0x[a-fA-F0-9]{64}$/.test(PRIVATE_KEY), 'Missing/invalid FORGE_TESTNET_OPERATOR_PRIVATE_KEY');
  const artifact = compile();
  const provider = new JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });
  const network = await provider.getNetwork();
  assert(Number(network.chainId) === CHAIN_ID, `Expected chain ${CHAIN_ID}, got ${network.chainId}`);
  assert(await provider.getCode(ENTRY_POINT) !== '0x', 'EntryPoint v0.8 missing on Robinhood Testnet');

  const operator = new Wallet(PRIVATE_KEY, provider);
  const operatorBalance = await provider.getBalance(operator.address);
  assert(operatorBalance > 0n, 'Testnet deploy operator has no native gas');

  const factory = new ContractFactory(artifact.abi, artifact.bytecode, operator);
  const account = await factory.deploy(getAddress(NEW_OWNER), getAddress(ENTRY_POINT));
  const deployTx = account.deploymentTransaction();
  await account.waitForDeployment();
  const address = await account.getAddress();

  const verified = new Contract(address, [
    'function owner() view returns (address)',
    'function entryPoint() view returns (address)',
  ], provider);
  const [owner, entryPoint, code, balance] = await Promise.all([
    verified.owner(), verified.entryPoint(), provider.getCode(address), provider.getBalance(address),
  ]);
  assert(code !== '0x', 'Deployed smart account has no bytecode');
  assert(getAddress(owner) === getAddress(NEW_OWNER), `Owner mismatch: ${owner}`);
  assert(getAddress(entryPoint) === getAddress(ENTRY_POINT), `EntryPoint mismatch: ${entryPoint}`);
  assert(balance === 0n, `Smart account must start unfunded, got ${balance}`);

  console.log('FORGE 4337 NEW OWNER ACCOUNT: DEPLOYED');
  console.log(`OWNER=${getAddress(owner)}`);
  console.log(`SMART_ACCOUNT=${getAddress(address)}`);
  console.log(`ENTRY_POINT=${getAddress(entryPoint)}`);
  console.log(`DEPLOY_TX=${deployTx?.hash || ''}`);
  console.log(`SMART_ACCOUNT_NATIVE_WEI=${balance}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

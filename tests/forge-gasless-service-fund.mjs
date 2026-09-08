import { JsonRpcProvider, Wallet, getAddress, parseEther } from 'ethers';

const CHAIN_ID = 46630;
const RPC = process.env.FORGE_TESTNET_RPC_URL || 'https://rpc.testnet.chain.robinhood.com';
const PRIVATE_KEY = String(process.env.FORGE_TESTNET_OPERATOR_PRIVATE_KEY || '').trim();
const SERVICE = getAddress('0x7094A480062683B8391c1887fe7d277C0Ee23ED4');
const TARGET = parseEther('0.0002');

async function main() {
  if (!/^0x[a-fA-F0-9]{64}$/.test(PRIVATE_KEY)) throw new Error('Missing/invalid FORGE_TESTNET_OPERATOR_PRIVATE_KEY');
  const provider = new JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });
  const operator = new Wallet(PRIVATE_KEY, provider);
  const before = await provider.getBalance(SERVICE);
  if (before < TARGET) {
    const tx = await operator.sendTransaction({ to: SERVICE, value: TARGET - before });
    await tx.wait();
    console.log(`FUND_TX=${tx.hash}`);
  } else {
    console.log('FUND_TX=SKIPPED');
  }
  const after = await provider.getBalance(SERVICE);
  if (after < TARGET) throw new Error(`Service wallet underfunded: ${after}`);
  console.log(`SERVICE=${SERVICE}`);
  console.log(`SERVICE_NATIVE_WEI=${after}`);
}

main().catch((error) => { console.error(error); process.exit(1); });

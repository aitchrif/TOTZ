import { readFile } from 'node:fs/promises';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const [html, claim, runtime] = await Promise.all([
  readFile('forge-claim.html', 'utf8'),
  readFile('forge-claim.js', 'utf8'),
  readFile('forge-runtime-config.js', 'utf8'),
]);

assert(html.includes('id="gasStatus"'), 'Claim page is missing the live gas estimate status surface.');
assert(html.includes('/forge-claim.js?v=4'), 'Claim page is not pinned to the hardened holder claim script revision.');
assert(claim.includes('provider.estimateGas({from:wallet,to:epoch.claim_contract,data})'), 'Claim gas estimation is missing.');
assert(claim.includes('provider.getFeeData()'), 'Claim fee-data lookup is missing.');
assert(claim.includes("method:'eth_chainId'"), 'Wallet chain ID verification is missing.');
assert(claim.includes('Wallet chain mismatch.'), 'Pre-sign wallet chain mismatch guard is missing.');
assert(claim.includes('Do not resubmit'), 'Long-pending transaction duplicate-submit warning is missing.');
assert(claim.includes('confirmed on-chain even though the wallet UI reported an interruption'), 'On-chain recovery path for wallet UI interruptions is missing.');
assert(runtime.includes('const mainnetClaimsEnabled = false;'), 'Gas UX hardening must not unlock Mainnet launches.');
assert(runtime.includes('const claimNetwork = networks.testnet;'), 'Gas UX hardening must not change the default launch network.');

console.log('FORGE CLAIM GAS UX REGRESSION: PASSED');

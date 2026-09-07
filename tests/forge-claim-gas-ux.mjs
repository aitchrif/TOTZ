import { readFile } from 'node:fs/promises';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const [html, claim, runtime, gaslessDoc, v1Contract] = await Promise.all([
  readFile('forge-claim.html', 'utf8'),
  readFile('forge-claim.js', 'utf8'),
  readFile('forge-runtime-config.js', 'utf8'),
  readFile('docs/forge-gasless-feasibility.md', 'utf8'),
  readFile('contracts/ForgeMerkleClaim.sol', 'utf8'),
]);

// Gas transparency before a holder signs.
assert(html.includes('id="gasStatus"'), 'Claim page is missing the live gas estimate status surface.');
assert(html.indexOf('id="gasStatus"') < html.indexOf('id="claimBtn"'), 'Gas estimate must be visible before the direct Claim action.');
assert(html.includes('/forge-claim.js?v=5'), 'Claim page is not pinned to the hardened sponsored-holder script revision.');
assert(claim.includes('provider.estimateGas({from:wallet,to:epoch.claim_contract,data})'), 'Direct claim gas estimation is missing.');
assert(claim.includes('provider.getFeeData()'), 'Claim fee-data lookup is missing.');
assert(claim.includes('provider.getBalance(wallet)'), 'Low native-gas balance warning is missing.');
assert(claim.includes('Estimated direct-claim fee:'), 'Holder-facing direct network-fee copy is missing.');
assert(claim.includes('Sponsored claim available · no native ETH is required'), 'Sponsored path must clearly say that holder ETH is not required.');

// Network correctness: wallet labels are not trusted; actual chain ID is checked.
assert(claim.includes("method:'eth_chainId'"), 'Wallet chain ID verification is missing.');
assert(claim.includes('Wallet chain mismatch.'), 'Pre-sign wallet chain mismatch guard is missing.');
assert(claim.includes('assertWalletNetwork'), 'Claim/recovery path does not share the explicit chain assertion.');

// Interrupted/pending transaction recovery and reload safety.
assert(claim.includes('Do not resubmit'), 'Long-pending direct transaction duplicate-submit warning is missing.');
assert(claim.includes('Do not sign again yet'), 'Long-pending sponsored operation duplicate-sign warning is missing.');
assert(claim.includes('confirmed on-chain even though the wallet UI reported an interruption'), 'On-chain recovery path for direct wallet UI interruptions is missing.');
assert(claim.includes("$('walletState').textContent=already?'Already claimed.'"), 'Reloaded claimed-wallet state is not rendered from chain state.');
assert(claim.includes("$('claimBtn').textContent=already?'CLAIMED ✓':'CLAIM DIRECT'"), 'Reloaded direct-claim button state is not fail-closed.');
assert(claim.includes('await c.claimed(wallet)'), 'Claim eligibility refresh does not reconcile against on-chain claimed state.');

// Sponsored V2 is opt-in and fail-closed. It must never silently fall back to a gas-paying tx.
assert(html.includes('id="gaslessClaimBtn"') && html.includes('hidden disabled'), 'Sponsored claim action must default hidden and disabled.');
assert(claim.includes('gaslessState.enabled&&gaslessState.configured'), 'Sponsored action must require server enabled+configured state.');
assert(claim.includes('signTypedData'), 'Sponsored claim must use typed holder authorization.');
assert(claim.includes('Direct claim is still available'), 'Sponsored failure must expose direct claim only as an explicit user choice.');
assert(!claim.includes('catch(e){claim()'), 'Sponsored failure must not automatically invoke direct claim.');

// Mobile holder flow must keep the action readable/tappable on narrow screens.
assert(html.includes('<meta name="viewport" content="width=device-width,initial-scale=1">'), 'Mobile viewport metadata is missing.');
assert(html.includes('@media(max-width:700px)'), 'Narrow-screen claim layout regression guard is missing.');
assert(html.includes('.actions .btn{width:100%}'), 'Mobile claim actions do not expand to a full-width tap target.');
assert(html.includes('.stats{grid-template-columns:1fr 1fr}'), 'Mobile claim stats do not collapse to two columns.');

// Gasless work is a separate V2 protocol, never an invisible V1 retrofit.
assert(gaslessDoc.includes('signed claim-for'), 'Gasless design must preserve holder authorization with a signed claim-for path.');
assert(gaslessDoc.includes('EIP-712'), 'Gasless design must require typed holder authorization.');
assert(gaslessDoc.includes('relayer cannot redirect rewards'), 'Gasless design is missing the recipient-integrity Testnet gate.');
assert(gaslessDoc.includes('Do not retrofit or redeploy the completed Pilot #3 contract'), 'Pilot #3 immutability boundary is missing.');
assert(gaslessDoc.includes('do not create a Mainnet Gas Manager policy'), 'Mainnet sponsorship must remain explicitly out of scope during feasibility.');
assert(!v1Contract.includes('claimFor('), 'V1 contract was modified with an unreviewed gasless claim path. Build V2 separately.');

// Holder hardening must never unlock new Mainnet launches.
assert(runtime.includes('const mainnetClaimsEnabled = false;'), 'Gas UX hardening must not unlock Mainnet launches.');
assert(runtime.includes('const claimNetwork = networks.testnet;'), 'Gas UX hardening must not change the default launch network.');

console.log('FORGE CLAIM GAS / CHAIN / RELOAD / MOBILE / GASLESS V2 UX REGRESSION: PASSED');

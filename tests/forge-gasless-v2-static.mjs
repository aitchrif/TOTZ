import { readFile } from 'node:fs/promises';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const [v2, v1, runtime, doc] = await Promise.all([
  readFile('contracts/ForgeMerkleClaimV2.sol', 'utf8'),
  readFile('contracts/ForgeMerkleClaim.sol', 'utf8'),
  readFile('forge-runtime-config.js', 'utf8'),
  readFile('docs/forge-gasless-v2-testnet-poc.md', 'utf8'),
]);

assert(v2.includes('ClaimAuthorization(address account,uint256 amount,uint256 nonce,uint256 authorizationDeadline)'), 'V2 EIP-712 authorization type is missing.');
assert(v2.includes('SignatureChecker.isValidSignatureNow(account, digest, signature)'), 'V2 holder signature verification is missing.');
assert(v2.includes('token.safeTransfer(account, amount)'), 'V2 must transfer rewards only to the authorized holder account.');
assert(!v2.includes('recipient'), 'V2 claim path must not introduce an arbitrary recipient parameter.');
assert(v2.includes('authorizationNonces[account] += 1'), 'V2 successful claim must consume holder authorization nonce.');
assert(v2.includes('block.timestamp > authorizationDeadline'), 'V2 authorization expiry guard is missing.');
assert(!v1.includes('claimFor('), 'V1 claim contract must remain unchanged and must not gain a relay path.');
assert(runtime.includes('const mainnetClaimsEnabled = false;'), 'Gasless V2 PoC must not unlock Mainnet launches.');
assert(runtime.includes('const claimNetwork = networks.testnet;'), 'Gasless V2 PoC must keep Testnet as the default launch network.');
assert(doc.includes('Not approved for Mainnet deployment or funding'), 'Gasless V2 PoC Mainnet safety boundary is missing.');
assert(doc.includes('does not request paymaster data'), 'Gas sponsorship no-spend boundary is missing.');

console.log('FORGE GASLESS V2 STATIC SAFETY INVARIANTS: PASSED');

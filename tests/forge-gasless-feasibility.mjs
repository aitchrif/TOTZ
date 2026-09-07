import { readFile } from 'node:fs/promises';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const [doc, runtime, contract] = await Promise.all([
  readFile('docs/forge-gasless-feasibility.md', 'utf8'),
  readFile('forge-runtime-config.js', 'utf8'),
  readFile('contracts/ForgeMerkleClaim.sol', 'utf8'),
]);

assert(doc.includes('signed claim-for'), 'Gasless design must preserve holder authorization with a signed claim-for path.');
assert(doc.includes('EIP-712'), 'Gasless design must require typed holder authorization.');
assert(doc.includes('relayer cannot redirect rewards'), 'Gasless design is missing the recipient-integrity Testnet gate.');
assert(doc.includes('Do not retrofit or redeploy the completed Pilot #3 contract'), 'Pilot #3 immutability boundary is missing.');
assert(doc.includes('do not create a Mainnet Gas Manager policy'), 'Mainnet sponsorship must remain explicitly out of scope during feasibility.');
assert(runtime.includes('const mainnetClaimsEnabled = false;'), 'Gasless feasibility work must not unlock Mainnet launches.');
assert(runtime.includes('const claimNetwork = networks.testnet;'), 'Gasless feasibility work must keep Testnet as the default launch network.');
assert(!contract.includes('claimFor('), 'V1 contract was modified with an unreviewed gasless claim path. Build V2 separately.');

console.log('FORGE GASLESS FEASIBILITY SAFETY BOUNDARY: PASSED');

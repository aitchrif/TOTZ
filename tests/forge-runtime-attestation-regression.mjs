import fs from 'node:fs';
import { keccak256 } from 'ethers';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const artifact = JSON.parse(fs.readFileSync('artifacts/ForgeMerkleClaim.release.json', 'utf8'));
const productionSource = fs.readFileSync('supabase/functions/forge-claims/index.ts', 'utf8');

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert(start >= 0, `Production verifier function ${name} was not found.`);
  const brace = source.indexOf('{', start);
  assert(brace >= 0, `Production verifier function ${name} has no body.`);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract production verifier function ${name}.`);
}

function productionLayout(source) {
  const match = source.match(/const CLAIM_IMMUTABLE_LAYOUT = (\{[\s\S]*?\n\}) as const;/);
  assert(match, 'Production immutable layout was not found.');
  return Function(`"use strict"; return (${match[1]});`)();
}

function transpileProductionVerifier(source) {
  return source
    .replace(/function immutableWord\(value: string \| number \| bigint, kind: "address" \| "bytes32" \| "uint"\)/, 'function immutableWord(value, kind)')
    .replace(/function assertRuntimeImmutableOccurrences\(code: string, expected: ClaimRuntimeImmutables\)/, 'function assertRuntimeImmutableOccurrences(code, expected)')
    .replace(/function normalizedRuntimeCoreHash\(code: string\)/, 'function normalizedRuntimeCoreHash(code)')
    .replace('let n: bigint;', 'let n;')
    .replace(/const words: Record<keyof ClaimRuntimeImmutables, string> =/, 'const words =')
    .replace(/Object\.entries\(CLAIM_IMMUTABLE_LAYOUT\) as \[keyof ClaimRuntimeImmutables, readonly \{ start: number; length: number \}\[\]\]\[\]/g, 'Object.entries(CLAIM_IMMUTABLE_LAYOUT)');
}

const layout = productionLayout(productionSource);
const allRanges = Object.values(layout).flat();
const approvedMatch = productionSource.match(/const APPROVED_CLAIM_RUNTIME_CORE_HASH = "(0x[0-9a-f]{64})";/i);
assert(approvedMatch, 'Production approved runtime core hash was not found.');
const approvedCoreHash = approvedMatch[1].toLowerCase();
assert(approvedCoreHash === String(artifact.normalizedCoreHash).toLowerCase(), 'Production approved runtime hash must match the source-generated release artifact.');

for (const [name, ranges] of Object.entries(layout)) {
  assert(ranges.length > 0, `Missing production immutable references for ${name}.`);
  for (const range of ranges) assert(Number(range.length) === 32, `${name} production immutable reference must be 32 bytes.`);
}
assert(allRanges.length >= 19, 'Production verifier must attest every reviewed immutable occurrence.');

const verifierSource = [
  extractFunction(productionSource, 'immutableWord'),
  extractFunction(productionSource, 'assertRuntimeImmutableOccurrences'),
  extractFunction(productionSource, 'normalizedRuntimeCoreHash'),
].map(transpileProductionVerifier).join('\n\n');

const makeVerifier = Function('keccak256', 'MAX_UINT256', 'CLAIM_IMMUTABLE_LAYOUT', 'CLAIM_IMMUTABLE_RANGES', 'APPROVED_CLAIM_RUNTIME_CORE_HASH', `
${verifierSource}
return function verifyProductionRuntime(code, expected) {
  assertRuntimeImmutableOccurrences(code, expected);
  const actual = normalizedRuntimeCoreHash(code);
  if (actual.toLowerCase() !== APPROVED_CLAIM_RUNTIME_CORE_HASH) throw new Error('Claim contract runtime is not an approved TOTZ FORGE build.');
  return actual;
};
`);
const verifyProductionRuntime = makeVerifier(keccak256, (1n << 256n) - 1n, layout, allRanges, approvedCoreHash);

function raw(value = '') {
  return String(value).replace(/^0x/, '').toLowerCase();
}
function word(value, kind) {
  let hex;
  if (kind === 'address') {
    hex = raw(value);
    assert(/^[0-9a-f]{40}$/.test(hex), `Invalid ${kind} test value.`);
  } else if (kind === 'bytes32') {
    hex = raw(value);
    assert(/^[0-9a-f]{64}$/.test(hex), `Invalid ${kind} test value.`);
    return hex;
  } else {
    const n = BigInt(value);
    assert(n >= 0n && n < (1n << 256n), 'Invalid uint test value.');
    hex = n.toString(16);
  }
  return hex.padStart(64, '0');
}
function expectedWords(expected) {
  return {
    token: word(expected.token, 'address'),
    merkleRoot: word(expected.merkleRoot, 'bytes32'),
    totalAllocated: word(expected.totalAllocated, 'uint256'),
    deadline: word(expected.deadline, 'uint64'),
    sponsor: word(expected.sponsor, 'address'),
  };
}
function instantiateRuntime(template, expected) {
  const chars = raw(template).split('');
  const words = expectedWords(expected);
  for (const [name, ranges] of Object.entries(layout)) {
    for (const { start, length } of ranges) {
      const from = Number(start) * 2;
      const to = from + Number(length) * 2;
      assert(to <= chars.length, `${name} immutable reference is out of bounds.`);
      chars.splice(from, Number(length) * 2, ...words[name]);
    }
  }
  return `0x${chars.join('')}`;
}

const expected = {
  token: `0x${'11'.repeat(20)}`,
  merkleRoot: `0x${'22'.repeat(32)}`,
  totalAllocated: 1234567890123456789n,
  deadline: 1900000000n,
  sponsor: `0x${'33'.repeat(20)}`,
};
const runtime = instantiateRuntime(artifact.deployedBytecode, expected);
assert(verifyProductionRuntime(runtime, expected) === approvedCoreHash, 'Correctly instantiated reviewed runtime must pass the production verifier.');

let mutations = 0;
for (const [name, ranges] of Object.entries(layout)) {
  for (const { start } of ranges) {
    const chars = raw(runtime).split('');
    const nibble = Number(start) * 2 + 63;
    chars[nibble] = chars[nibble] === '0' ? '1' : '0';
    let rejected = false;
    try {
      verifyProductionRuntime(`0x${chars.join('')}`, expected);
    } catch (error) {
      rejected = /Claim contract immutable .* mismatch\./.test(String(error?.message || error));
    }
    assert(rejected, `Production verifier must reject tampering ${name} occurrence at byte ${start}.`);
    mutations += 1;
  }
}

assert(mutations === allRanges.length && mutations >= 19, 'Every production immutable occurrence must be mutation-tested.');

const coreMutation = raw(runtime).split('');
coreMutation[20] = coreMutation[20] === '0' ? '1' : '0';
let coreRejected = false;
try {
  verifyProductionRuntime(`0x${coreMutation.join('')}`, expected);
} catch (error) {
  coreRejected = /approved TOTZ FORGE build/.test(String(error?.message || error));
}
assert(coreRejected, 'Production verifier must reject executable-core tampering outside immutable ranges.');

console.log(`FORGE RUNTIME ATTESTATION REGRESSION: PASS · production verifier exercised directly · ${mutations} immutable occurrences individually tamper-rejected`);

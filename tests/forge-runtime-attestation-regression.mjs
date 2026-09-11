import fs from 'node:fs';
import { keccak256 } from 'ethers';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const artifact = JSON.parse(fs.readFileSync('artifacts/ForgeMerkleClaim.release.json', 'utf8'));
const ID_BY_NAME = {
  token: '39',
  merkleRoot: '41',
  totalAllocated: '43',
  deadline: '45',
  sponsor: '47',
};
const layout = Object.fromEntries(Object.entries(ID_BY_NAME).map(([name, id]) => [name, artifact.immutableReferences?.[id] || []]));
const allRanges = Object.values(layout).flat();

for (const [name, ranges] of Object.entries(layout)) {
  assert(ranges.length > 0, `Missing immutable references for ${name}.`);
  for (const range of ranges) assert(Number(range.length) === 32, `${name} immutable reference must be 32 bytes.`);
}

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
function stripMetadata(hex) {
  const h = raw(hex);
  const metadataBytes = Number.parseInt(h.slice(-4), 16);
  const removeNibbles = (metadataBytes + 2) * 2;
  assert(Number.isFinite(metadataBytes) && metadataBytes > 0 && removeNibbles <= h.length, 'Invalid runtime metadata trailer.');
  return h.slice(0, h.length - removeNibbles);
}
function normalizedCoreHash(code) {
  const chars = raw(code).split('');
  for (const { start, length } of allRanges) {
    const from = Number(start) * 2;
    const to = from + Number(length) * 2;
    assert(to <= chars.length, 'Immutable reference out of bounds.');
    for (let i = from; i < to; i++) chars[i] = '0';
  }
  return keccak256(`0x${stripMetadata(chars.join(''))}`);
}
function verifyRuntime(code, expected) {
  const hex = raw(code);
  const words = expectedWords(expected);
  for (const [name, ranges] of Object.entries(layout)) {
    for (const { start, length } of ranges) {
      const from = Number(start) * 2;
      const to = from + Number(length) * 2;
      if (hex.slice(from, to) !== words[name]) throw new Error(`immutable ${name} mismatch at ${start}`);
    }
  }
  if (normalizedCoreHash(code).toLowerCase() !== String(artifact.normalizedCoreHash).toLowerCase()) {
    throw new Error('executable core hash mismatch');
  }
  return true;
}

const expected = {
  token: `0x${'11'.repeat(20)}`,
  merkleRoot: `0x${'22'.repeat(32)}`,
  totalAllocated: 1234567890123456789n,
  deadline: 1900000000n,
  sponsor: `0x${'33'.repeat(20)}`,
};
const runtime = instantiateRuntime(artifact.deployedBytecode, expected);
assert(verifyRuntime(runtime, expected) === true, 'Correctly instantiated reviewed runtime must pass attestation.');

let mutations = 0;
for (const [name, ranges] of Object.entries(layout)) {
  for (const { start } of ranges) {
    const chars = raw(runtime).split('');
    const nibble = Number(start) * 2 + 63;
    chars[nibble] = chars[nibble] === '0' ? '1' : '0';
    let rejected = false;
    try {
      verifyRuntime(`0x${chars.join('')}`, expected);
    } catch (error) {
      rejected = /immutable .* mismatch/.test(String(error?.message || error));
    }
    assert(rejected, `Tampering ${name} occurrence at byte ${start} must be rejected before normalized hashing.`);
    mutations += 1;
  }
}

assert(mutations === allRanges.length && mutations >= 19, 'Every compiler-reported immutable occurrence must be mutation-tested.');
console.log(`FORGE RUNTIME ATTESTATION REGRESSION: PASS · ${mutations} immutable occurrences verified and individually tamper-rejected`);

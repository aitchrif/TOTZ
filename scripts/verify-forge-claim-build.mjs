import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { keccak256 } from 'ethers';

const ROOT = process.cwd();
const SOURCE_PATH = 'contracts/ForgeMerkleClaim.sol';
const ARTIFACT_PATH = 'artifacts/ForgeMerkleClaim.json';

function readImport(importPath) {
  const candidates = [
    path.join(ROOT, importPath),
    path.join(ROOT, 'node_modules', importPath),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return { contents: fs.readFileSync(candidate, 'utf8') };
  }
  return { error: `Import not found: ${importPath}` };
}

function compile() {
  const source = fs.readFileSync(SOURCE_PATH, 'utf8');
  const input = {
    language: 'Solidity',
    sources: { [SOURCE_PATH]: { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'shanghai',
      metadata: { bytecodeHash: 'ipfs', appendCBOR: true },
      outputSelection: {
        '*': {
          '*': [
            'abi',
            'evm.bytecode.object',
            'evm.deployedBytecode.object',
            'evm.deployedBytecode.immutableReferences',
            'metadata'
          ]
        }
      }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: readImport }));
  const errors = (output.errors || []).filter((e) => e.severity === 'error');
  if (errors.length) throw new Error(errors.map((e) => e.formattedMessage || e.message).join('\n'));
  const contract = output.contracts?.[SOURCE_PATH]?.ForgeMerkleClaim;
  if (!contract) throw new Error('ForgeMerkleClaim compiler output missing.');
  return contract;
}

function add0x(v = '') { return v.startsWith('0x') ? v : `0x${v}`; }
function raw(v = '') { return v.startsWith('0x') ? v.slice(2) : v; }

function stripMetadata(hex) {
  const h = raw(hex);
  if (h.length < 4) return h;
  const metadataBytes = parseInt(h.slice(-4), 16);
  const removeNibbles = (metadataBytes + 2) * 2;
  if (!Number.isFinite(metadataBytes) || removeNibbles <= 0 || removeNibbles > h.length) return h;
  return h.slice(0, h.length - removeNibbles);
}

function flattenRefs(refs = {}) {
  return Object.values(refs).flatMap((items) => Array.isArray(items) ? items : []);
}

function zeroImmutables(hex, refs) {
  const chars = raw(hex).split('');
  for (const { start, length } of flattenRefs(refs)) {
    const from = Number(start) * 2;
    const to = from + Number(length) * 2;
    if (from < 0 || to > chars.length) throw new Error(`Immutable reference out of bounds: ${start}/${length}`);
    for (let i = from; i < to; i++) chars[i] = '0';
  }
  return chars.join('');
}

function abiSignature(item) {
  const inputs = (item.inputs || []).map((x) => x.type).join(',');
  if (item.type === 'constructor') return `constructor(${inputs})`;
  return `${item.type}:${item.name || ''}(${inputs})`;
}

function abiSet(abi = []) { return new Set(abi.map(abiSignature)); }
function diffSet(a, b) { return [...a].filter((x) => !b.has(x)).sort(); }

const legacy = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));
const built = compile();
const compilerVersion = solc.version();

const creation = add0x(built.evm.bytecode.object);
const runtime = add0x(built.evm.deployedBytecode.object);
const refs = built.evm.deployedBytecode.immutableReferences || {};

const normalizedFull = add0x(zeroImmutables(runtime, refs));
const normalizedCore = add0x(stripMetadata(normalizedFull));
const legacyNormalizedFull = add0x(zeroImmutables(legacy.deployedBytecode, legacy.immutableReferences || {}));
const legacyNormalizedCore = add0x(stripMetadata(legacyNormalizedFull));

const report = {
  compilerVersion,
  compilerPinned: compilerVersion.startsWith('0.8.24+commit.e11b9ed9'),
  optimizer: 'enabled / 200 runs',
  creationBytes: raw(creation).length / 2,
  legacyCreationBytes: raw(legacy.bytecode).length / 2,
  runtimeBytes: raw(runtime).length / 2,
  legacyRuntimeBytes: raw(legacy.deployedBytecode).length / 2,
  creationExact: creation.toLowerCase() === String(legacy.bytecode).toLowerCase(),
  runtimeExactBeforeImmutables: runtime.toLowerCase() === String(legacy.deployedBytecode).toLowerCase(),
  normalizedRuntimeHash: keccak256(normalizedFull),
  legacyNormalizedRuntimeHash: keccak256(legacyNormalizedFull),
  normalizedCoreHash: keccak256(normalizedCore),
  legacyNormalizedCoreHash: keccak256(legacyNormalizedCore),
  normalizedCoreExact: normalizedCore.toLowerCase() === legacyNormalizedCore.toLowerCase(),
  immutableReferenceGroups: Object.keys(refs).length,
  legacyImmutableReferenceGroups: Object.keys(legacy.immutableReferences || {}).length,
};

const builtAbi = abiSet(built.abi);
const legacyAbi = abiSet(legacy.abi);
report.abiMissingFromBuild = diffSet(legacyAbi, builtAbi);
report.abiExtraInBuild = diffSet(builtAbi, legacyAbi);
report.abiSurfaceExact = report.abiMissingFromBuild.length === 0 && report.abiExtraInBuild.length === 0;

console.log('FORGE CLAIM REPRODUCIBILITY REPORT');
console.log(JSON.stringify(report, null, 2));

if (!report.compilerPinned) throw new Error(`Unexpected solc build: ${compilerVersion}`);
if (!report.abiSurfaceExact) throw new Error('Candidate Solidity ABI does not match the deployed legacy artifact ABI.');

// Reproducibility approval is intentionally strict. A semantic/core match is useful
// diagnostic evidence, but the release cannot claim byte-for-byte reproducibility
// until the exact artifact is reproduced from checked-in source and pinned settings.
if (!report.creationExact || !report.normalizedCoreExact || report.normalizedRuntimeHash !== String(legacy.normalizedRuntimeHash).toLowerCase()) {
  throw new Error('ForgeMerkleClaim source is not yet byte-for-byte reproducible with the legacy artifact. See report above; do not unlock Mainnet.');
}

console.log('FORGE CLAIM REPRODUCIBILITY: PASS · exact checked-in source reproduces the approved artifact');

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

function canonicalRefs(refs = {}) {
  return Object.entries(refs)
    .map(([key, items]) => [
      key,
      [...(Array.isArray(items) ? items : [])]
        .map(({ start, length }) => ({ start: Number(start), length: Number(length) }))
        .sort((a, b) => a.start - b.start || a.length - b.length),
    ])
    .sort(([a], [b]) => String(a).localeCompare(String(b)));
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
const legacyRefs = legacy.immutableReferences || {};

const creationCore = add0x(stripMetadata(creation));
const legacyCreationCore = add0x(stripMetadata(legacy.bytecode));
const normalizedFull = add0x(zeroImmutables(runtime, refs));
const normalizedCore = add0x(stripMetadata(normalizedFull));
const legacyNormalizedFull = add0x(zeroImmutables(legacy.deployedBytecode, legacyRefs));
const legacyNormalizedCore = add0x(stripMetadata(legacyNormalizedFull));

const report = {
  compilerVersion,
  compilerPinned: compilerVersion.startsWith('0.8.24+commit.e11b9ed9'),
  optimizer: 'enabled / 200 runs',
  evmVersion: 'shanghai',
  creationBytes: raw(creation).length / 2,
  legacyCreationBytes: raw(legacy.bytecode).length / 2,
  runtimeBytes: raw(runtime).length / 2,
  legacyRuntimeBytes: raw(legacy.deployedBytecode).length / 2,
  creationExactIncludingMetadata: creation.toLowerCase() === String(legacy.bytecode).toLowerCase(),
  creationCoreExact: creationCore.toLowerCase() === legacyCreationCore.toLowerCase(),
  runtimeExactBeforeImmutablesIncludingMetadata: runtime.toLowerCase() === String(legacy.deployedBytecode).toLowerCase(),
  normalizedRuntimeHashIncludingMetadata: keccak256(normalizedFull),
  legacyNormalizedRuntimeHashIncludingMetadata: keccak256(legacyNormalizedFull),
  normalizedCoreHash: keccak256(normalizedCore),
  legacyNormalizedCoreHash: keccak256(legacyNormalizedCore),
  normalizedCoreExact: normalizedCore.toLowerCase() === legacyNormalizedCore.toLowerCase(),
  immutableReferencesExact: JSON.stringify(canonicalRefs(refs)) === JSON.stringify(canonicalRefs(legacyRefs)),
  immutableReferenceGroups: Object.keys(refs).length,
  legacyImmutableReferenceGroups: Object.keys(legacyRefs).length,
};

const builtAbi = abiSet(built.abi);
const legacyAbi = abiSet(legacy.abi);
report.abiMissingFromBuild = diffSet(legacyAbi, builtAbi);
report.abiExtraInBuild = diffSet(builtAbi, legacyAbi);
report.abiSurfaceExact = report.abiMissingFromBuild.length === 0 && report.abiExtraInBuild.length === 0;
report.metadataIdentityExact =
  report.creationExactIncludingMetadata &&
  report.runtimeExactBeforeImmutablesIncludingMetadata &&
  report.normalizedRuntimeHashIncludingMetadata === String(legacy.normalizedRuntimeHash || '').toLowerCase();
report.executableReproducible =
  report.compilerPinned &&
  report.abiSurfaceExact &&
  report.immutableReferencesExact &&
  report.creationCoreExact &&
  report.normalizedCoreExact &&
  report.creationBytes === report.legacyCreationBytes &&
  report.runtimeBytes === report.legacyRuntimeBytes;

console.log('FORGE CLAIM REPRODUCIBILITY REPORT');
console.log(JSON.stringify(report, null, 2));

if (!report.compilerPinned) throw new Error(`Unexpected solc build: ${compilerVersion}`);
if (!report.abiSurfaceExact) throw new Error('Candidate Solidity ABI does not match the approved legacy artifact ABI.');
if (!report.immutableReferencesExact) throw new Error('Immutable layout does not match the approved legacy artifact.');
if (!report.creationCoreExact) throw new Error('Constructor/init executable core does not match the approved legacy artifact.');
if (!report.normalizedCoreExact) throw new Error('Runtime executable core does not match the approved legacy artifact.');
if (report.creationBytes !== report.legacyCreationBytes || report.runtimeBytes !== report.legacyRuntimeBytes) {
  throw new Error('Compiled bytecode lengths differ from the approved legacy artifact.');
}

if (!report.metadataIdentityExact) {
  console.warn('FORGE CLAIM METADATA NOTE: executable bytecode is reproducible, but compiler metadata is not byte-for-byte identical to the legacy artifact. Do not describe this as full artifact identity.');
}

console.log('FORGE CLAIM REPRODUCIBILITY: PASS · ABI, immutable layout, constructor core, and runtime core reproduce the approved executable artifact');

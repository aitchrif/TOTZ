import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { keccak256, toUtf8Bytes } from 'ethers';

const ROOT = process.cwd();
const SOURCE_PATH = 'contracts/ForgeMerkleClaim.sol';
const DEFAULT_OUTPUT = 'artifacts/ForgeMerkleClaim.release.generated.json';
const EXPECTED_CORE_HASH = '0xb90f55deac3bb7b4cc6743afb563abd27ac21e0df0ff02d7ce6ae289bb9b7e36';

function readImport(importPath) {
  const candidates = [path.join(ROOT, importPath), path.join(ROOT, 'node_modules', importPath)];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return { contents: fs.readFileSync(candidate, 'utf8') };
  }
  return { error: `Import not found: ${importPath}` };
}

function raw(value = '') { return value.startsWith('0x') ? value.slice(2) : value; }
function add0x(value = '') { return value.startsWith('0x') ? value : `0x${value}`; }
function flattenRefs(refs = {}) { return Object.values(refs).flatMap((items) => Array.isArray(items) ? items : []); }
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
function stripMetadata(hex) {
  const h = raw(hex);
  if (h.length < 4) return h;
  const metadataBytes = Number.parseInt(h.slice(-4), 16);
  const removeNibbles = (metadataBytes + 2) * 2;
  if (!Number.isFinite(metadataBytes) || removeNibbles <= 0 || removeNibbles > h.length) throw new Error('Invalid Solidity metadata trailer.');
  return h.slice(0, h.length - removeNibbles);
}

const source = fs.readFileSync(SOURCE_PATH, 'utf8');
const input = {
  language: 'Solidity',
  sources: { [SOURCE_PATH]: { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'shanghai',
    metadata: { bytecodeHash: 'ipfs', appendCBOR: true },
    outputSelection: {
      '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'evm.deployedBytecode.immutableReferences'] }
    }
  }
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: readImport }));
const errors = (output.errors || []).filter((entry) => entry.severity === 'error');
if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage || entry.message).join('\n'));
const built = output.contracts?.[SOURCE_PATH]?.ForgeMerkleClaim;
if (!built) throw new Error('ForgeMerkleClaim compiler output missing.');

const compilerLongVersion = solc.version();
if (!compilerLongVersion.startsWith('0.8.24+commit.e11b9ed9')) throw new Error(`Unexpected compiler build: ${compilerLongVersion}`);

const bytecode = add0x(built.evm.bytecode.object);
const deployedBytecode = add0x(built.evm.deployedBytecode.object);
const immutableReferences = built.evm.deployedBytecode.immutableReferences || {};
const normalizedRuntime = add0x(zeroImmutables(deployedBytecode, immutableReferences));
const normalizedCore = add0x(stripMetadata(normalizedRuntime));
const normalizedRuntimeHash = keccak256(normalizedRuntime);
const normalizedCoreHash = keccak256(normalizedCore);
if (normalizedCoreHash.toLowerCase() !== EXPECTED_CORE_HASH) {
  throw new Error(`Executable runtime core drifted: ${normalizedCoreHash}`);
}

const artifact = {
  artifactFormat: 'TOTZ_FORGE_CLAIM_RELEASE_V1',
  contractName: 'ForgeMerkleClaim',
  sourcePath: SOURCE_PATH,
  sourceHash: keccak256(toUtf8Bytes(source)),
  compiler: '0.8.24',
  compilerLongVersion,
  optimizer: { enabled: true, runs: 200 },
  evmVersion: 'shanghai',
  metadata: { bytecodeHash: 'ipfs', appendCBOR: true },
  abi: built.abi,
  bytecode,
  deployedBytecode,
  immutableReferences,
  creationByteLength: raw(bytecode).length / 2,
  deployedByteLength: raw(deployedBytecode).length / 2,
  normalizedRuntimeHash,
  normalizedCoreHash,
  generatedFromSource: true
};

const outputPath = process.argv[2] || DEFAULT_OUTPUT;
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(artifact)}\n`);
console.log(`FORGE CLAIM RELEASE ARTIFACT: ${outputPath}`);
console.log(JSON.stringify({
  compilerLongVersion,
  sourceHash: artifact.sourceHash,
  creationByteLength: artifact.creationByteLength,
  deployedByteLength: artifact.deployedByteLength,
  normalizedRuntimeHash,
  normalizedCoreHash
}, null, 2));

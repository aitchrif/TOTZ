import fs from 'node:fs';
import crypto from 'node:crypto';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const gateway = fs.readFileSync('supabase/functions/forge-claims-gateway/index.ts', 'utf8');
const core = fs.readFileSync('supabase/functions/forge-claims/index.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260911_forge_claim_provenance_gateway.sql', 'utf8');
const launcher = fs.readFileSync('forge-claim-launcher.js', 'utf8');
const releaseArtifact = JSON.parse(fs.readFileSync('artifacts/ForgeMerkleClaim.release.json', 'utf8'));

const APPROVED_CORE_HASH = '0xb90f55deac3bb7b4cc6743afb563abd27ac21e0df0ff02d7ce6ae289bb9b7e36';
const APPROVED_RELEASE_RUNTIME_HASH = '0x1623c3c1ef9fd939c30f02147c0b3d99e58ceaf86801717d1156bb58b8df376a';
const LEGACY_METADATA_BOUND_HASH = '0x0051149977ffb2b42b63e07841f68b4bd382a1656ac32efbf5c3c064f12a0b56';

assert(gateway.includes('TOTZ_FORGE_PACKAGE_PROVENANCE_V1'), 'Gateway must recompute the provenance-aware package fingerprint.');
assert(gateway.includes('verifySourceSnapshot'), 'Gateway must independently revalidate the exact source snapshot.');
assert(gateway.includes('snapshotBlockHash'), 'Gateway must require and persist the pinned block hash.');
assert(gateway.includes('snapshotComplete !== true'), 'Gateway must reject incomplete source snapshots.');
assert(gateway.includes('forge_claim_provenance_authorizations'), 'Gateway must create a short-lived server authorization before core creation.');
assert(gateway.includes('provenance_verified_at'), 'Gateway must refresh provenance immediately before publication.');
assert(gateway.includes('cache: "no-store"'), 'Server provenance revalidation must bypass caches.');

assert(core.includes(`APPROVED_CLAIM_RUNTIME_CORE_HASH = "${APPROVED_CORE_HASH}"`), 'Core backend must attest the reviewed executable runtime core.');
assert(core.includes('function normalizedRuntimeCoreHash'), 'Core backend must normalize runtime before attestation.');
assert(core.includes('CLAIM_IMMUTABLE_LAYOUT'), 'Core backend must retain named compiler immutable ranges.');
assert(core.includes('assertRuntimeImmutableOccurrences'), 'Core backend must verify every immutable occurrence before normalization.');
assert(core.includes('CLAIM_IMMUTABLE_LAYOUT'), 'Core backend must retain named compiler immutable ranges.');
assert(core.includes('assertRuntimeImmutableOccurrences'), 'Core backend must verify every immutable occurrence before normalization.');
assert(core.includes('metadataLength') && core.includes('coreLength'), 'Core backend must strip Solidity metadata before runtime-core hashing.');
assert(!core.includes(LEGACY_METADATA_BOUND_HASH), 'Core backend must not remain coupled to the legacy compiler-metadata hash.');
assert(core.includes('forge_release_flags') && core.includes('mainnet_claims_enabled'), 'Core backend must enforce the database Mainnet master gate.');
assert(core.includes('mainnet_release_mode'), 'Core backend must enforce locked/canary/public release policy.');
assert(core.includes('runtimeAttestation: "executable-core+immutables-v2"'), 'Core publication responses must identify occurrence-bound runtime attestation.');

assert(releaseArtifact.artifactFormat === 'TOTZ_FORGE_CLAIM_RELEASE_V1', 'Fresh claim artifact must use the source-controlled release format.');
assert(releaseArtifact.generatedFromSource === true, 'Fresh claim artifact must declare source generation.');
assert(String(releaseArtifact.normalizedCoreHash).toLowerCase() === APPROVED_CORE_HASH, 'Fresh claim artifact executable core hash drifted.');
assert(String(releaseArtifact.normalizedRuntimeHash).toLowerCase() === APPROVED_RELEASE_RUNTIME_HASH, 'Fresh claim artifact runtime identity drifted.');
assert(launcher.includes("fetch('/artifacts/ForgeMerkleClaim.release.json'"), 'Launcher must deploy from the fresh source-controlled release artifact.');
assert(!launcher.includes("fetch('/artifacts/ForgeMerkleClaim.json'"), 'Launcher must not deploy from the legacy artifact.');
assert(launcher.includes(APPROVED_CORE_HASH), 'Launcher must pin the reviewed executable core hash.');
assert(launcher.includes(APPROVED_RELEASE_RUNTIME_HASH), 'Launcher must pin the fresh release runtime identity.');

assert(migration.includes('create table if not exists public.forge_claim_provenance_authorizations'), 'Migration must create the server provenance authorization table.');
assert(migration.includes('create trigger forge_claim_epoch_provenance_gate'), 'Database must block claim creation without server provenance authorization.');
assert(migration.includes("new.provenance_verified_at := null"), 'Creation must not satisfy the later publish-time provenance check.');
assert(migration.includes("v_provenance_verified_at < now() - interval '2 minutes'"), 'Finalization must require a fresh publish-time provenance verification.');
assert(migration.includes('revoke execute on function public.forge_finalize_claim_epoch'), 'Finalization RPC must not be executable by public/anon/authenticated roles.');
assert(migration.includes('grant execute on function public.forge_finalize_claim_epoch(uuid, integer, text) to service_role'), 'Only service_role must retain direct finalization execution.');

const sample = {
  distributionFingerprint: `0x${'11'.repeat(32)}`,
  sourceChain: 'robinhood',
  sourceChainId: 4663,
  sourceContract: `0x${'22'.repeat(20)}`,
  snapshotBlock: 123456,
  snapshotBlockHash: `0x${'33'.repeat(32)}`,
  merkleRoot: `0x${'44'.repeat(32)}`,
  eligibleWallets: 12,
  totalAllocatedUnits: '120000000',
};
const canonical = [
  'TOTZ_FORGE_PACKAGE_PROVENANCE_V1',
  `distribution=${sample.distributionFingerprint}`,
  `sourceChain=${sample.sourceChain}`,
  `sourceChainId=${sample.sourceChainId}`,
  `sourceContract=${sample.sourceContract}`,
  `snapshotBlock=${sample.snapshotBlock}`,
  `snapshotBlockHash=${sample.snapshotBlockHash}`,
  'snapshotComplete=true',
  `merkleRoot=${sample.merkleRoot}`,
  `eligibleWallets=${sample.eligibleWallets}`,
  `totalAllocatedUnits=${sample.totalAllocatedUnits}`,
].join('\n');
const expected = `0x${crypto.createHash('sha256').update(canonical).digest('hex')}`;
assert(/^0x[0-9a-f]{64}$/.test(expected), 'Canonical provenance fingerprint must be bytes32-shaped.');

console.log(`FORGE BACKEND + RELEASE PROVENANCE: PASS · fingerprint ${expected.slice(0, 12)}… · source-controlled core + immutable occurrences bound`);

import fs from 'node:fs';
import crypto from 'node:crypto';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const gateway = fs.readFileSync('supabase/functions/forge-claims-gateway/index.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260911_forge_claim_provenance_gateway.sql', 'utf8');

assert(gateway.includes('TOTZ_FORGE_PACKAGE_PROVENANCE_V1'), 'Gateway must recompute the provenance-aware package fingerprint.');
assert(gateway.includes('verifySourceSnapshot'), 'Gateway must independently revalidate the exact source snapshot.');
assert(gateway.includes('snapshotBlockHash'), 'Gateway must require and persist the pinned block hash.');
assert(gateway.includes('snapshotComplete !== true'), 'Gateway must reject incomplete source snapshots.');
assert(gateway.includes('forge_claim_provenance_authorizations'), 'Gateway must create a short-lived server authorization before core creation.');
assert(gateway.includes('provenance_verified_at'), 'Gateway must refresh provenance immediately before publication.');
assert(gateway.includes('cache: "no-store"'), 'Server provenance revalidation must bypass caches.');

assert(migration.includes('create table if not exists public.forge_claim_provenance_authorizations'), 'Migration must create the server provenance authorization table.');
assert(migration.includes('create trigger forge_claim_epoch_provenance_gate'), 'Database must block claim creation without server provenance authorization.');
assert(migration.includes("new.provenance_verified_at := null"), 'Creation must not satisfy the later publish-time provenance check.');
assert(migration.includes("v_provenance_verified_at < now() - interval '2 minutes'"), 'Finalization must require a fresh publish-time provenance verification.');
assert(migration.includes("revoke execute on function public.forge_finalize_claim_epoch"), 'Finalization RPC must not be executable by public/anon/authenticated roles.');
assert(migration.includes("grant execute on function public.forge_finalize_claim_epoch(uuid, integer, text) to service_role"), 'Only service_role must retain direct finalization execution.');

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

console.log(`FORGE BACKEND PROVENANCE: PASS · fingerprint ${expected.slice(0, 12)}… · DB create/publish gates present`);

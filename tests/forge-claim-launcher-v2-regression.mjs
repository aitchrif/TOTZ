import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const V1_HASH = '0x0051149977ffb2b42b63e07841f68b4bd382a1656ac32efbf5c3c064f12a0b56';
const V2_HASH = '0x9b4b2c73fbeabfc2adaf202a486ac47079940050bf1546249713265b005ababa';

const [html, launcher, runtime, claimsService, v1ArtifactText, v2ArtifactText] = await Promise.all([
  readFile('forge-claim-launcher.html', 'utf8'),
  readFile('forge-claim-launcher.js', 'utf8'),
  readFile('forge-runtime-config.js', 'utf8'),
  readFile('supabase/functions/forge-claims/index.ts', 'utf8'),
  readFile('artifacts/ForgeMerkleClaim.json', 'utf8'),
  readFile('artifacts/ForgeMerkleClaimV2.json', 'utf8'),
]);

const v1Artifact = JSON.parse(v1ArtifactText);
const v2Artifact = JSON.parse(v2ArtifactText);

assert.match(html, /id="contractVersionInput"/, 'launcher must expose an explicit contract-version selector');
assert.match(html, /<option value="v1" selected>V1 · Standard direct claim<\/option>/, 'V1 must remain the default launcher target');
assert.match(html, /<option value="v2">V2 · Gas-sponsored compatible \(EIP-712\)<\/option>/, 'V2 must be an explicit opt-in launcher target');

assert.match(launcher, /v1:\s*\{\s*path:\s*'\/artifacts\/ForgeMerkleClaim\.json'/, 'launcher must pin the V1 artifact path');
assert.match(launcher, /v2:\s*\{\s*path:\s*'\/artifacts\/ForgeMerkleClaimV2\.json'/, 'launcher must pin the V2 artifact path');
assert.ok(launcher.includes(V1_HASH), 'launcher must pin the approved V1 runtime hash');
assert.ok(launcher.includes(V2_HASH), 'launcher must pin the approved V2 runtime hash');
assert.match(launcher, /function selectedContractVersion\(\)\{return \$\('contractVersionInput'\)\?\.value==='v2'\?'v2':'v1';\}/, 'launcher must fail back to V1 unless V2 is explicitly selected');
assert.match(launcher, /loaded\.compiler!=='0\.8\.24'/, 'launcher must reject an unapproved compiler version');
assert.match(launcher, /loaded\.optimizer\?\.enabled!==true/, 'launcher must require optimizer enabled');
assert.match(launcher, /Number\(loaded\.optimizer\?\.runs\)!==200/, 'launcher must require optimizer runs=200');
assert.match(launcher, /normalizedRuntimeHash\|\|'\'\)\.toLowerCase\(\)!==spec\.runtimeHash/, 'launcher must verify the pinned normalized runtime hash');
assert.match(launcher, /contractVersionInput'\)\.disabled=true/, 'launcher must lock the selected contract version after deployment');
assert.match(launcher, /artifact=null;if\(\$\('contractVersionInput'\)\)\$\('contractVersionInput'\)\.disabled=false/, 'loading a new package must clear the cached artifact and unlock version choice');

for (const [label, artifact, expectedHash] of [
  ['V1', v1Artifact, V1_HASH],
  ['V2', v2Artifact, V2_HASH],
]) {
  assert.equal(artifact.compiler, '0.8.24', `${label} artifact compiler must stay pinned`);
  assert.equal(artifact.optimizer?.enabled, true, `${label} artifact optimizer must stay enabled`);
  assert.equal(Number(artifact.optimizer?.runs), 200, `${label} artifact optimizer runs must stay pinned to 200`);
  assert.equal(String(artifact.normalizedRuntimeHash || '').toLowerCase(), expectedHash, `${label} committed runtime hash changed`);
  assert.ok(/^0x[0-9a-f]+$/i.test(String(artifact.bytecode || '')), `${label} artifact bytecode is missing`);
  assert.ok(Array.isArray(artifact.abi), `${label} artifact ABI is missing`);
}

assert.ok(claimsService.includes(V1_HASH), 'publish attestation must approve the pinned V1 runtime');
assert.ok(claimsService.includes(V2_HASH), 'publish attestation must approve the pinned V2 runtime');
assert.match(claimsService, /version:\s*"v2"/, 'publish attestation must identify V2 explicitly');
assert.match(claimsService, /for\(const build of APPROVED_CLAIM_BUILDS\)/, 'publish attestation must test only approved claim builds');
assert.match(claimsService, /throw new Error\('Claim contract runtime is not an approved TOTZ FORGE build\.'\)/, 'unknown runtimes must fail closed');

assert.match(runtime, /const mainnetClaimsEnabled = false;/, 'Mainnet launch execution must remain locked by default');
assert.match(runtime, /const claimNetwork = networks\.testnet;/, 'Testnet must remain the default launcher network');
assert.doesNotMatch(runtime, /const mainnetClaimsEnabled = true;/, 'readiness work must never silently arm Mainnet');

console.log('PASS FORGE V1/V2 launcher + publish-attestation regression invariants');

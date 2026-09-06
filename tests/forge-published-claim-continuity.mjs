import { readFile } from 'node:fs/promises';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

const runtime = await readFile('forge-runtime-config.js', 'utf8');
const claimPage = await readFile('forge-claim.js', 'utf8');

assert(runtime.includes('function canInteractWithPublishedClaim'), 'runtime is missing the published-claim interaction permission');
assert(runtime.includes('canInteractWithPublishedClaim,'), 'published-claim interaction permission is not exported through ForgeRuntime');
assert(runtime.includes("const selector = '#deployBtn,#fundBtn,#publishBtn,#tokenPolicyAck,#reviewAck';"), 'launch-lock selector changed unexpectedly');

const guardStart = runtime.indexOf('function installLockedClaimUiGuard()');
const guardEnd = runtime.indexOf('window.TOTZ_FORGE_CONFIG = config;');
assert(guardStart >= 0 && guardEnd > guardStart, 'could not isolate the launch UI guard');
const launchGuard = runtime.slice(guardStart, guardEnd);
assert(!launchGuard.includes('#claimBtn'), 'launch lockdown must never disable holder claim actions on published epochs');
assert(!launchGuard.includes('#recoverBtn'), 'launch lockdown must never disable sponsor recovery on published epochs');
pass('runtime launch lockdown excludes published claim and recovery actions');

assert(claimPage.includes('canInteractWithPublishedClaim'), 'claim page does not use the published-claim interaction permission');
assert(claimPage.includes('requireExecution:false'), 'claim page network switching is still coupled to the new-launch gate');
assert(!claimPage.includes('canExecuteClaims'), 'claim page must not depend on the new-launch permission');
assert(!claimPage.includes('claim writes are locked in this FORGE release'), 'claim page still contains the old launch-lock rejection path');
pass('published claim page remains independent from future launch lockdowns');

console.log('\nFORGE PUBLISHED CLAIM CONTINUITY: PASSED.');

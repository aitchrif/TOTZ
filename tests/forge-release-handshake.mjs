import { readFile } from 'node:fs/promises';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

const backend = await readFile('supabase/functions/forge-claims/index.ts', 'utf8');
const launcher = await readFile('forge-claim-launcher.js', 'utf8');

assert(backend.includes("req.method==='GET'&&route==='status'"), 'claims backend is missing the read-only release status route');
assert(backend.includes('function publicReleaseStatus'), 'claims backend is missing the safe public release status formatter');
assert(backend.includes('rpcReady:Boolean(MAINNET_RPC_URL)'), 'release status must expose only production RPC readiness');
assert(backend.includes('sponsorAllowed:sponsorMatch'), 'release status must expose wallet-specific authorization only as a boolean');

const statusStart = backend.indexOf('function publicReleaseStatus');
const statusEnd = backend.indexOf('async function assertClaimWriteEnabled', statusStart);
assert(statusStart >= 0 && statusEnd > statusStart, 'could not isolate the release status formatter');
const statusFormatter = backend.slice(statusStart, statusEnd);
assert(!statusFormatter.includes('rpc:MAINNET_RPC_URL'), 'release status must never expose the private production RPC URL');
assert(!statusFormatter.includes('canarySponsor:'), 'release status must never expose the configured Canary sponsor address');
pass('backend release status is read-only and exposes only non-sensitive readiness state');

assert(launcher.includes('async function assertServerLaunchReady'), 'launcher is missing the server release preflight');
assert(launcher.includes("route:'status',wallet:sponsor.toLowerCase()"), 'launcher does not bind the release preflight to the sponsor wallet');
assert(launcher.includes("state.masterEnabled!==true||!['canary','public'].includes"), 'launcher does not require an enabled staged server release');
assert(launcher.includes('state.rpcReady!==true'), 'launcher does not require the production RPC before Mainnet transactions');
assert(launcher.includes("state.mode==='canary'"), 'launcher does not enforce Canary-specific status checks');
assert(launcher.includes('state.sponsorAllowed!==true'), 'launcher does not require the configured Canary sponsor');
assert(launcher.includes('eligible>max'), 'launcher does not enforce the server-published Canary wallet cap');

for (const fn of ['async function deploy()', 'async function fund()', 'async function publish()']) {
  const start = launcher.indexOf(fn);
  assert(start >= 0, `launcher is missing ${fn}`);
  const next = launcher.indexOf('\n  async function ', start + fn.length);
  const body = launcher.slice(start, next > start ? next : launcher.length);
  assert(body.includes('await assertServerLaunchReady('), `${fn} does not run the server release preflight before its write path`);
}
pass('DEPLOY, FUND and PUBLISH all require the live server release handshake');

console.log('\nFORGE RELEASE HANDSHAKE: PASSED.');

import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const required = [
  'forge.html',
  'forge.js',
  'forge-epochs.html',
  'forge-epochs-page.js',
  'forge-my-epochs.html',
  'forge-my-epochs.js',
  'forge-claim.html',
  'forge-claim.js',
  'forge-claim-launcher.html',
  'forge-claim-launcher.js',
  'forge-runtime-config.js',
  'forge-nav-state.js',
  'artifacts/ForgeMerkleClaim.json'
];
for (const file of required) assert(fs.existsSync(file), `Missing production FORGE file: ${file}`);

const runtime = fs.readFileSync('forge-runtime-config.js', 'utf8');
assert(runtime.includes("const environment = 'mainnet';"), 'Production FORGE must read Robinhood Mainnet.');
assert(runtime.includes('const mainnetClaimsEnabled = false;'), 'Production launch gate must remain locked.');
assert(runtime.includes('const claimNetwork = networks.mainnet;'), 'Production claim network must be Robinhood Mainnet.');
assert(/gaslessRelay:\s*''/.test(runtime), 'Gasless relay must remain unreachable in direct-claim production mode.');

const claim = fs.readFileSync('forge-claim.html', 'utf8');
assert(!claim.includes('GAS SPONSORED'), 'Public holder claim UI must not expose sponsored claiming.');
assert(!claim.includes('gaslessClaimBtn'), 'Public holder claim UI must remain direct-only.');
assert(/id="claimBtn"/.test(claim), 'Direct claim button is missing.');

const nav = fs.readFileSync('forge-nav-state.js', 'utf8');
assert(nav.includes('Keep EPOCHS network cards visually identical to X-RAY.'), 'EPOCHS/X-RAY network-card parity guard is missing.');
assert(/\.workspace \.network-icon\{width:34px;height:34px;flex:0 0 34px/.test(nav), 'EPOCHS network icon geometry must match X-RAY.');
assert(/\.workspace \.network-btn b\{display:block;font-size:\.82rem\}/.test(nav), 'EPOCHS network title sizing must match X-RAY.');
assert(/\.workspace \.network-btn span\{display:block;color:var\(--soft\);font-size:\.64rem/.test(nav), 'EPOCHS network subtitle sizing must match X-RAY.');

const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const rewrites = new Map((vercel.rewrites || []).map(r => [r.source, r.destination]));
assert(rewrites.get('/forge/epochs') === '/forge-epochs', 'Missing /forge/epochs route.');
assert(rewrites.get('/forge/my-epochs') === '/forge-my-epochs', 'Missing /forge/my-epochs route.');
assert(rewrites.get('/forge/claim') === '/forge-claim', 'Missing /forge/claim route.');
assert(rewrites.get('/forge/claim-launcher') === '/forge-claim-launcher', 'Missing /forge/claim-launcher route.');

const headerMap = new Map((vercel.headers || []).map(entry => [entry.source, new Map((entry.headers || []).map(h => [String(h.key).toLowerCase(), String(h.value).toLowerCase()]))]));
for (const route of ['/forge/claim', '/forge/claim-launcher']) {
  const headers = headerMap.get(route);
  assert(headers, `Missing explicit headers for clean FORGE route: ${route}`);
  assert(headers.get('cache-control') === 'no-store, max-age=0', `${route} must be no-store.`);
  assert((headers.get('x-robots-tag') || '').includes('noindex'), `${route} must be noindex.`);
}

console.log('FORGE PRODUCTION INTEGRATION: PASS · Mainnet read surface · launch locked · direct claim only · clean claim routes no-store · EPOCHS/X-RAY network parity');

import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const required = [
  'forge.html',
  'forge.js',
  'forge-guide.html',
  'forge-epochs.html',
  'forge-epochs-bootstrap.js',
  'forge-epochs-page.js',
  'forge-my-epochs.html',
  'forge-my-epochs.js',
  'forge-claim.html',
  'forge-claim.js',
  'forge-claim-launcher.html',
  'forge-claim-launcher.js',
  'forge-runtime-config.js',
  'forge-nav-state.js',
  'api/forge-holders.js',
  'package.json',
  'artifacts/ForgeMerkleClaim.json',
  'artifacts/ForgeMerkleClaim.release.json',
  'supabase/functions/forge-claims/index.ts',
  'tests/forge-security-regression.mjs'
];
for (const file of required) assert(fs.existsSync(file), `Missing production FORGE file: ${file}`);

const runtime = fs.readFileSync('forge-runtime-config.js', 'utf8');
assert(runtime.includes("const environment = 'mainnet';"), 'Production FORGE must read Robinhood Mainnet.');
assert(runtime.includes('const mainnetClaimsEnabled = true;'), 'Reviewed public Mainnet client launch gate must be enabled.');
assert(runtime.includes('const claimNetwork = networks.mainnet;'), 'Production claim network must be Robinhood Mainnet.');
assert(/gaslessRelay:\s*''/.test(runtime), 'Gasless relay must remain unreachable in direct-claim production mode.');
assert(/function canInteractWithPublishedClaim\(network = claimNetwork\)[\s\S]*?return Boolean\(resolveClaimNetwork\(network\)\);/.test(runtime), 'Published verified claims must remain interactable independently of the new-launch gate.');
assert(runtime.includes("const selector = '#deployBtn,#fundBtn,#publishBtn,#tokenPolicyAck,#reviewAck';"), 'Mainnet launch lockdown must stay scoped to new-launch controls.');
assert(!runtime.includes('#claimBtn'), 'Mainnet launch lockdown must never disable the published holder claim button.');
assert(!runtime.includes('#recoverBtn'), 'Mainnet launch lockdown must never disable published sponsor recovery.');
assert(runtime.includes('Public Mainnet deploy/fund/publish is enabled for approved operators'), 'Public-release EPOCHS copy override is missing.');

const claim = fs.readFileSync('forge-claim.html', 'utf8');
assert(!claim.includes('GAS SPONSORED'), 'Public holder claim UI must not expose sponsored claiming.');
assert(!claim.includes('gaslessClaimBtn'), 'Public holder claim UI must remain direct-only.');
assert(/id="claimBtn"/.test(claim), 'Direct claim button is missing.');

const claimJs = fs.readFileSync('forge-claim.js', 'utf8');
assert(claimJs.includes('canInteractWithPublishedClaim'), 'Holder claim runtime must use published-claim interaction permission.');
assert(/ensureClaimNetwork\(\{requestAccounts:false,network,requireExecution:false\}\)/.test(claimJs), 'Published claim network switching must not require the new-launch execution gate.');
assert(/function claim\(\)[\s\S]*?interactionEnabled\(\)/.test(claimJs), 'Direct holder claims must remain governed by published-claim interaction permission.');

const holdersApi = fs.readFileSync('api/forge-holders.js', 'utf8');
assert(/from ['"]ethers['"]/.test(holdersApi), 'FORGE holder snapshot API must declare its ethers runtime import.');
assert(/maxDuration:\s*60/.test(holdersApi), 'FORGE holder snapshot API server window must remain 60 seconds.');
assert(holdersApi.includes('requireCanonical: true'), 'FORGE holder reads must bind to a canonical block hash.');
assert(holdersApi.includes('snapshotBlockHash'), 'FORGE holder snapshots must retain the pinned block hash.');
const forgeJs = fs.readFileSync('forge.js', 'utf8');
assert(/function fetchForgeData\(contract\)[\s\S]*?65000/.test(forgeJs), 'X-RAY client scan timeout must stay above the 60s holder API window.');
assert(forgeJs.includes('Partial discovery'), 'X-RAY must expose partial discovery visibly.');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert(packageJson?.dependencies?.ethers === '6.15.0', 'FORGE holder snapshot runtime must pin ethers 6.15.0.');
assert(packageJson?.type === 'module', 'FORGE Node runtime must use explicit ESM mode.');

const launcherJs = fs.readFileSync('forge-claim-launcher.js', 'utf8');
assert(launcherJs.includes('assertSnapshotProvenance'), 'Claim launcher must independently revalidate exact snapshot provenance.');
assert(launcherJs.includes('TOTZ_FORGE_PACKAGE_PROVENANCE_V1'), 'Claim publication fingerprint must bind snapshot provenance.');
assert(launcherJs.includes("fetch('/artifacts/ForgeMerkleClaim.release.json'"), 'Claim launcher must deploy from the source-controlled release artifact.');

const guideHtml = fs.readFileSync('forge-guide.html', 'utf8');
assert(/TOTZ FORGE · PUBLIC BETA/.test(guideHtml), 'Public Beta guide must identify the launch state.');
assert(/Mainnet writes<\/small><b>Operator-controlled<\/b>/.test(guideHtml), 'Public Beta guide must state that Mainnet writes are operator-controlled.');
assert(/New Robinhood Mainnet deploy \/ fund \/ publish actions remain operator-controlled during Public Beta/.test(guideHtml), 'Public Beta guide must explain the Mainnet release boundary.');
assert(/href="\/forge"/.test(guideHtml), 'Public Beta guide must link to X-RAY.');
assert(/href="\/forge\/epochs"/.test(guideHtml), 'Public Beta guide must link to EPOCHS.');
assert(!/href="\/forge\/claim-launcher"/.test(guideHtml), 'Public Beta guide must not send public users directly to the operator Claim Launcher.');

const epochsHtml = fs.readFileSync('forge-epochs.html', 'utf8');
assert(!/href="\/forge-epochs(?:[?#"])/.test(epochsHtml), 'EPOCHS must use the clean /forge/epochs route.');
assert(!/href="\/forge-my-epochs(?:[?#"])/.test(epochsHtml), 'EPOCHS must use the clean /forge/my-epochs route.');
assert(!/href="\/forge-claim-launcher(?:[?#"])/.test(epochsHtml), 'EPOCHS must use the clean /forge/claim-launcher route.');
assert(!/TESTNET CLAIM|Testnet Claim Launcher|Mainnet deployment remains intentionally disabled/i.test(epochsHtml), 'EPOCHS contains stale Testnet launch copy.');
assert(epochsHtml.includes('Production Mainnet deploy/fund/publish stays fail-closed'), 'EPOCHS static fallback must retain the fail-closed pre-runtime copy.');
assert(epochsHtml.includes('<a class="pill" href="/forge">X-RAY</a>'), 'EPOCHS must preserve the original pre-UI top action.');
assert(epochsHtml.includes('rh_favicon_120.png'), 'EPOCHS must preserve the original Robinhood network logo.');
assert(epochsHtml.includes('docs-logo-symbol.png'), 'EPOCHS must preserve the original Ink network logo.');
assert(epochsHtml.includes('eth-diamond-glyph.svg'), 'EPOCHS must preserve the original Ethereum network logo.');
assert(!epochsHtml.includes('WL CLEANER · SOON') && !epochsHtml.includes('GTD CHECK · SOON'), 'EPOCHS tool nav must not expose page-only SOON placeholders.');
assert(!epochsHtml.includes('epochs-xray-shell'), 'EPOCHS must not re-introduce the later X-RAY shell UI override.');
assert(!epochsHtml.includes('forge-epochs-parity.css'), 'EPOCHS must not load the later parity stylesheet.');
assert(epochsHtml.includes('/forge-epochs-bootstrap.js?v=1'), 'EPOCHS must externalize the optional wallet dependency bootstrap.');
assert(!/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(epochsHtml), 'EPOCHS must not contain inline executable JavaScript.');
const epochsBootstrap = fs.readFileSync('forge-epochs-bootstrap.js', 'utf8');
assert(epochsBootstrap.includes("ethersScript.async = true;"), 'EPOCHS must keep ethers enhancement asynchronous.');
assert(epochsBootstrap.includes('ethersScript.integrity = ETHERS_INTEGRITY'), 'EPOCHS wallet dependency bootstrap must apply SRI.');

const navState = fs.readFileSync('forge-nav-state.js', 'utf8');
assert(!navState.includes('function normalizeEpochNetworkCards()'), 'Original EPOCHS network UI must not be replaced at runtime.');
assert(!navState.includes('function normalizeEpochShell()'), 'Original EPOCHS shell must not be replaced at runtime.');
assert(/function sync\(\) \{[\s\S]*?syncing = true;[\s\S]*?try \{[\s\S]*?\} finally \{\s*syncing = false;\s*\}/.test(navState), 'FORGE nav sync must always release its re-entrancy guard.');
assert(navState.includes("typeof requestAnimationFrame === 'function'"), 'FORGE nav sync must schedule at a paint boundary.');
assert(navState.includes("observer.observe(root, { subtree: true, childList: true });"), 'FORGE nav observer must stay child-list only.');
assert(!navState.includes('queueMicrotask'), 'FORGE nav observer must not use a microtask feedback loop.');
assert(!navState.includes("attributeFilter: ['class']"), 'FORGE nav observer must not watch global class churn.');

const myEpochsHtml = fs.readFileSync('forge-my-epochs.html', 'utf8');
assert(!/href="\/forge-epochs(?:[?#"])/.test(myEpochsHtml), 'MY EPOCHS must use the clean /forge/epochs route.');
assert(!/href="\/forge-my-epochs(?:[?#"])/.test(myEpochsHtml), 'MY EPOCHS must use the clean /forge/my-epochs route.');
assert(!/Robinhood Chain Testnet/i.test(myEpochsHtml), 'MY EPOCHS contains stale Testnet copy.');
assert(/Robinhood Chain Mainnet/i.test(myEpochsHtml), 'MY EPOCHS must identify the live Mainnet read surface.');

const launcherHtml = fs.readFileSync('forge-claim-launcher.html', 'utf8');
assert(!/href="\/forge-epochs(?:[?#"])/.test(launcherHtml), 'Claim Launcher must use the clean /forge/epochs route.');

const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const rewrites = new Map((vercel.rewrites || []).map(r => [r.source, r.destination]));
assert(rewrites.get('/forge/guide') === '/forge-guide', 'Missing /forge/guide route.');
assert(rewrites.get('/forge/epochs') === '/forge-epochs', 'Missing /forge/epochs route.');
assert(rewrites.get('/forge/my-epochs') === '/forge-my-epochs', 'Missing /forge/my-epochs route.');
assert(rewrites.get('/forge/claim') === '/forge-claim', 'Missing /forge/claim route.');
assert(rewrites.get('/forge/claim-launcher') === '/forge-claim-launcher', 'Missing /forge/claim-launcher route.');

const headerMap = new Map((vercel.headers || []).map(entry => [entry.source, new Map((entry.headers || []).map(h => [String(h.key).toLowerCase(), String(h.value).toLowerCase()]))]));
const guideHeaders = headerMap.get('/forge/guide');
assert(guideHeaders?.get('cache-control') === 'no-store, max-age=0', '/forge/guide must be no-store during Public Beta.');
for (const route of ['/forge/claim', '/forge/claim-launcher']) {
  const headers = headerMap.get(route);
  assert(headers, `Missing explicit headers for clean FORGE route: ${route}`);
  assert(headers.get('cache-control') === 'no-store, max-age=0', `${route} must be no-store.`);
  assert((headers.get('x-robots-tag') || '').includes('noindex'), `${route} must be noindex.`);
}

console.log('FORGE PRODUCTION INTEGRATION: PASS · Public Beta guide · Mainnet read surface · public Mainnet client launch gate enabled · published claims preserved · direct claim only · holder snapshot runtime pinned · hash-bound provenance · X-RAY partial labeling · clean routes/copy · claim routes no-store · externalized EPOCHS wallet bootstrap · fresh claim artifact · original EPOCHS UI preserved · paint-safe nav sync');
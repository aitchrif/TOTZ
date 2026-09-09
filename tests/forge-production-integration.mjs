import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const required = [
  'forge.html',
  'forge.js',
  'forge-guide.html',
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
  'api/forge-holders.js',
  'package.json',
  'artifacts/ForgeMerkleClaim.json'
];
for (const file of required) assert(fs.existsSync(file), `Missing production FORGE file: ${file}`);

const runtime = fs.readFileSync('forge-runtime-config.js', 'utf8');
assert(runtime.includes("const environment = 'mainnet';"), 'Production FORGE must read Robinhood Mainnet.');
assert(runtime.includes('const mainnetClaimsEnabled = false;'), 'Production launch gate must remain locked.');
assert(runtime.includes('const claimNetwork = networks.mainnet;'), 'Production claim network must be Robinhood Mainnet.');
assert(/gaslessRelay:\s*''/.test(runtime), 'Gasless relay must remain unreachable in direct-claim production mode.');
assert(/function canInteractWithPublishedClaim\(network = claimNetwork\)[\s\S]*?return Boolean\(resolveClaimNetwork\(network\)\);/.test(runtime), 'Published verified claims must remain interactable independently of the new-launch gate.');
assert(runtime.includes("const selector = '#deployBtn,#fundBtn,#publishBtn,#tokenPolicyAck,#reviewAck';"), 'Mainnet launch lockdown must stay scoped to new-launch controls.');
assert(!runtime.includes('#claimBtn'), 'Mainnet launch lockdown must never disable the published holder claim button.');
assert(!runtime.includes('#recoverBtn'), 'Mainnet launch lockdown must never disable published sponsor recovery.');

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
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert(packageJson?.dependencies?.ethers === '6.15.0', 'FORGE holder snapshot runtime must pin ethers 6.15.0.');

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
assert(epochsHtml.includes('Production Mainnet deploy/fund/publish stays fail-closed'), 'EPOCHS must state the production write gate clearly.');

const navState = fs.readFileSync('forge-nav-state.js', 'utf8');
assert(navState.includes('function normalizeEpochNetworkCards()'), 'EPOCHS network-card DOM normalizer is missing.');
assert(navState.includes('<span class="network-icon">RH</span>'), 'EPOCHS must hard-render the X-RAY RH mark.');
assert(navState.includes('<span class="network-icon">INK</span>'), 'EPOCHS must hard-render the X-RAY INK mark.');
assert(navState.includes('<span class="network-icon">Ξ</span>'), 'EPOCHS must hard-render the X-RAY Ethereum mark.');
assert(navState.includes('Exact copy of the X-RAY selector visual system.'), 'Exact EPOCHS/X-RAY network parity guard is missing.');
assert(/\.workspace \.network-icon\{width:34px!important;height:34px!important;flex:0 0 34px!important/.test(navState), 'EPOCHS network icon geometry must match X-RAY.');
assert(/\.workspace \.network-btn\.active \.network-icon\{background:var\(--ink\)!important;color:#fff!important\}/.test(navState), 'EPOCHS active icon treatment must match X-RAY.');
assert(/\.workspace \.network-btn::before,\.workspace \.network-btn::after\{content:none!important;display:none!important\}/.test(navState), 'EPOCHS must suppress legacy active checkmarks/decorators.');
assert(/\.workspace \.network-btn b\{display:block;font-size:\.82rem/.test(navState), 'EPOCHS network title sizing must match X-RAY.');
assert(/\.workspace \.network-btn span\{display:block;color:var\(--soft\);font-size:\.64rem/.test(navState), 'EPOCHS network subtitle sizing must match X-RAY.');
assert(navState.includes("if (homeLink.textContent !== 'HOME') homeLink.textContent = 'HOME';"), 'EPOCHS shell normalization must not self-trigger the global MutationObserver through repeated textContent writes.');
assert(/function sync\(\) \{[\s\S]*?syncing = true;[\s\S]*?try \{[\s\S]*?\} finally \{\s*syncing = false;\s*\}/.test(navState), 'FORGE nav sync must always release its re-entrancy guard.');

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

console.log('FORGE PRODUCTION INTEGRATION: PASS · Public Beta guide · Mainnet read surface · launch locked · published claims preserved · direct claim only · holder snapshot runtime pinned · clean routes/copy · claim routes no-store · hard X-RAY selector parity · EPOCHS observer race guard');

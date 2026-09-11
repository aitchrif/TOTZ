import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const file of ['forge-floor-guard.html', 'forge-floor-guard.js', 'api/forge-floor-guard.js', 'forge-nav-state.js', 'forge-runtime-config.js', 'forge-table-pagination.js', 'vercel.json']) {
  assert(fs.existsSync(file), `Missing FLOOR GUARD production file: ${file}`);
}
for (const retired of ['forge-gtd-check.html', 'forge-gtd-check.js', 'forge-wl-cleaner.html', 'forge-wl-cleaner.js']) {
  assert(!fs.existsSync(retired), `Retired FORGE tool must stay removed: ${retired}`);
}

const runtime = fs.readFileSync('forge-runtime-config.js', 'utf8');
assert(runtime.includes("const environment = 'mainnet';"), 'FLOOR GUARD must ship alongside the Mainnet read production runtime.');
assert(runtime.includes('const mainnetClaimsEnabled = false;'), 'New Mainnet deploy/fund/publish must remain locked.');

const html = fs.readFileSync('forge-floor-guard.html', 'utf8');
const client = fs.readFileSync('forge-floor-guard.js', 'utf8');
const api = fs.readFileSync('api/forge-floor-guard.js', 'utf8');

assert(html.includes('FLOOR GUARD V2'), 'FLOOR GUARD V2 identity missing.');
assert(html.includes('BOT <span>INTELLIGENCE.</span>'), 'FLOOR GUARD V2 hero intent missing.');
assert(html.includes('COLLECTION SCAN') && html.includes('WALLET CHECK') && html.includes('BOT DATABASE'), 'FLOOR GUARD V2 must expose collection, wallet and database modes.');
assert(html.includes('Confirmed ≠ heuristic'), 'FLOOR GUARD must visibly separate confirmed intelligence from heuristics.');
assert(html.includes('“CONFIRMED BOT” is never assigned automatically'), 'FLOOR GUARD must explain its confirmation boundary.');
assert(html.includes('Behavioral classifications are separate signals'), 'Collection UI must keep behavioral signals separate from confirmed identity.');
assert(html.includes('https://opensea.io'), 'OpenSea attribution/link is required.');

assert(client.includes("mode:'collection'"), 'Collection intelligence client mode missing.');
assert(client.includes("mode:'wallet'"), 'Wallet intelligence client mode missing.');
assert(client.includes("mode:'database'"), 'Persistent database client mode missing.');
assert(client.includes("status === 'confirmed' ? 'CONFIRMED BOT'"), 'Confirmed bot status must be an explicit registry classification.');
assert(!/eth_sendTransaction|wallet_sendCalls|approve\(|setApprovalForAll|personal_sign|eth_sign/.test(client), 'FLOOR GUARD client must not contain wallet write/signature paths.');

assert(api.includes("if (req.method !== 'GET')"), 'FLOOR GUARD public endpoint must be GET-only.');
assert(api.includes("['collection', 'wallet', 'database']"), 'FLOOR GUARD proxy must whitelist V2 modes.');
assert(api.includes("url.searchParams.set('mode', mode)"), 'FLOOR GUARD proxy must forward the selected broker mode.');
assert(api.includes('forge-floor-guard-data'), 'FLOOR GUARD must proxy through the persistent marketplace data broker.');
assert(api.includes("method: 'GET'"), 'FLOOR GUARD broker request must stay read-only.');
assert(!/api\.opensea\.io|\/auth\/keys|listings\/actions|fulfillment_data|eth_sendTransaction|wallet_sendCalls|setApprovalForAll|approve\(/.test(api), 'Vercel FLOOR GUARD proxy must not directly provision marketplace keys or contain marketplace/chain write paths.');
assert(/s-maxage=30/.test(api), 'FLOOR GUARD should cache short-lived public intelligence reads to protect upstream quota.');

const nav = fs.readFileSync('forge-nav-state.js', 'utf8');
assert(nav.includes("href: '/forge/floor-guard'"), 'Shared FORGE nav must expose FLOOR GUARD.');
assert(!nav.includes("href: '/forge/wl-cleaner'"), 'WL CLEANER must not remain in the shared nav.');
assert(!nav.includes("href: '/forge/gtd-check'"), 'GTD CHECK must not remain in the shared nav.');
assert(nav.includes('[data-forge-nav="wl-cleaner"]') && nav.includes('[data-forge-nav="gtd-check"]'), 'Shared nav must remove stale retired-tool DOM if an old page is cached.');
assert(nav.includes('let syncScheduled = false;') && nav.includes('function scheduleSync()'), 'Shared FORGE nav must coalesce MutationObserver sync work.');
assert(nav.includes('requestAnimationFrame(run)') && nav.includes('finally {\n      syncing = false;'), 'Shared FORGE nav must preserve the observer-race guards.');

const xrayEnhancement = fs.readFileSync('forge-table-pagination.js', 'utf8');
assert(xrayEnhancement.includes('function syncLaunchSurface()'), 'X-RAY must clean its post-launch tool surface at runtime.');
assert(xrayEnhancement.includes("floor.href = '/forge/floor-guard'"), 'X-RAY nav must expose FLOOR GUARD.');
assert(xrayEnhancement.includes('MY EPOCHS · LIVE') && xrayEnhancement.includes('FLOOR GUARD · LIVE'), 'X-RAY module cards must expose the current live FORGE tools.');

const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const rewrites = new Map((vercel.rewrites || []).map((rule) => [rule.source, rule.destination]));
const redirects = new Map((vercel.redirects || []).map((rule) => [rule.source, rule.destination]));
assert(rewrites.get('/forge/floor-guard') === '/forge-floor-guard', 'Missing FLOOR GUARD clean route.');
assert(!rewrites.has('/forge/wl-cleaner') && !rewrites.has('/forge/gtd-check'), 'Retired tool routes must not remain as rewrites.');
assert(redirects.get('/forge/wl-cleaner') === '/forge/floor-guard', 'Old WL CLEANER links must redirect to FLOOR GUARD.');
assert(redirects.get('/forge/gtd-check') === '/forge/floor-guard', 'Old GTD CHECK links must redirect to FLOOR GUARD.');
const headers = new Map((vercel.headers || []).map((entry) => [entry.source, new Map((entry.headers || []).map((h) => [h.key.toLowerCase(), h.value.toLowerCase()]))]));
assert(headers.get('/forge/floor-guard')?.get('cache-control') === 'no-store, max-age=0', 'FLOOR GUARD UI route must be no-store during rollout.');

console.log('FORGE FLOOR GUARD V2: PASS · collection + wallet + persistent bot DB · confirmed/manual boundary · read-only · Mainnet writes locked');

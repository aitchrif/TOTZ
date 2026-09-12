import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const file of ['forge-floor-guard.html', 'forge-floor-guard.js', 'forge-floor-guard-history.js', 'api/forge-floor-guard.js', 'api/forge-floor-guard-owner.js', 'forge-nav-state.js', 'forge-runtime-config.js', 'forge-table-pagination.js', 'totz-ui-brand.js', 'vercel.json']) {
  assert(fs.existsSync(file), `Missing FLOOR GUARD production file: ${file}`);
}
for (const retired of ['forge-gtd-check.html', 'forge-gtd-check.js', 'forge-wl-cleaner.html', 'forge-wl-cleaner.js']) {
  assert(!fs.existsSync(retired), `Retired FORGE tool must stay removed: ${retired}`);
}

const runtime = fs.readFileSync('forge-runtime-config.js', 'utf8');
assert(runtime.includes("const environment = 'mainnet';"), 'Collection Security must ship alongside the Mainnet read production runtime.');
assert(runtime.includes('const mainnetClaimsEnabled = true;'), 'Reviewed public Mainnet deploy/fund/publish client gate must be enabled.');

const html = fs.readFileSync('forge-floor-guard.html', 'utf8');
const client = fs.readFileSync('forge-floor-guard.js', 'utf8');
const historyClient = fs.readFileSync('forge-floor-guard-history.js', 'utf8');
const brand = fs.readFileSync('totz-ui-brand.js', 'utf8');
const api = fs.readFileSync('api/forge-floor-guard.js', 'utf8');
const ownerApi = fs.readFileSync('api/forge-floor-guard-owner.js', 'utf8');

assert(html.includes('COLLECTION SECURITY'), 'Collection Security identity missing.');
assert(html.includes('PROTECT YOUR COLLECTION.') && html.includes("KNOW WHO'S BIDDING."), 'Collection Security hero intent missing.');
assert(html.includes('id="contractInput"') && html.includes('SCAN COLLECTION'), 'Public contract-first scan missing.');
assert(html.includes('Current offers') && html.includes('Unique bidders') && html.includes('Confirmed bots') && html.includes('Highly suspected'), 'Clear bidder-security summary missing.');
assert(html.includes('Verified owner workspace') && html.includes('Monitoring') && html.includes('Owner watchlist'), 'Owner security workspace missing.');
assert(html.includes('CONFIRMED BOT is reserved for trusted/manual registry confirmations'), 'Confirmation boundary must remain visible.');
assert(html.includes('No blockchain write') && html.includes('No custody'), 'Owner security safety copy missing.');
assert(!html.includes('FREEZE BOT') && !html.includes('FREEZE WALLET'), 'Do not advertise unsupported freeze capability.');

assert(client.includes("mode:'security'"), 'Contract security scan client mode missing.');
assert(client.includes("action:'challenge'") && client.includes("action:'verify'"), 'Owner signature verification flow missing.');
assert(client.includes("action:'watchlist_upsert'") && client.includes("action:'monitoring'"), 'Owner workspace controls missing.');
assert(client.includes('signer.signMessage'), 'Owner login must use a message signature, not a transaction.');
assert(client.includes('AUTOMATION SCORE') && client.includes('automation_score'), 'Behavioral score must be labeled as automation risk rather than bot probability.');
assert(client.includes('Auto-scan active · about every 6 hours'), 'Monitoring cadence must be clear in the owner workspace.');
assert(client.includes('function scanDeltaChips') && client.includes('NEW HIGH-RISK'), 'Scan-to-scan delta intelligence must stay enabled.');
assert(client.includes('verified-compact') && client.includes('Owner verified · security workspace active'), 'Verified owner banner must collapse into a compact active state.');
assert(client.includes('const DEFAULT_VISIBLE_BIDDERS = 5;'), 'Bidder intelligence must default to a compact top-five view.');
assert(client.includes("data-filter=\"confirmed\"") && client.includes("data-filter=\"suspected\"") && client.includes("data-filter=\"watch\""), 'Bidder risk filters must remain available.');
assert(client.includes('SHOW TOP 5') && client.includes('SHOW ALL'), 'Bidder table expand/collapse control missing.');
assert(!/eth_sendTransaction|wallet_sendCalls|setApprovalForAll|approve\s*\(|sendTransaction\s*\(/.test(client), 'Collection Security client must not contain blockchain write/approval paths.');

assert(brand.includes("const isFloorGuard = pathname === '/forge/floor-guard'"), 'Global TOTZ shell must identify FLOOR GUARD safely.');
assert(brand.includes("script.src = '/forge-floor-guard-history.js?v=1'"), 'FLOOR GUARD scan-history enhancement must be loaded only through the site shell.');
assert(historyClient.includes('const VISIBLE_SCANS = 3;'), 'Recent security scans must default to the latest three entries.');
assert(historyClient.includes('VIEW HISTORY') && historyClient.includes('SHOW LATEST 3'), 'Scan history expand/collapse controls missing.');
assert(historyClient.includes('MutationObserver') && historyClient.includes('requestAnimationFrame'), 'Scan history must stay synchronized with workspace re-renders.');
assert(!/eth_sendTransaction|wallet_sendCalls|setApprovalForAll|approve\s*\(|sendTransaction\s*\(/.test(historyClient), 'Scan history enhancement must remain UI-only.');

assert(api.includes("if (req.method !== 'GET')"), 'Public Collection Security endpoint must stay GET-only.');
assert(api.includes('forge-collection-security-data'), 'Public scanner must use the server-side Collection Security broker.');
assert(api.includes("mode === 'security'"), 'Public proxy must expose contract security mode.');
assert(api.includes("method: 'GET'"), 'Public security broker request must remain read-only.');
assert(!/api\.opensea\.io|\/auth\/keys|fulfillment_data|eth_sendTransaction|wallet_sendCalls|setApprovalForAll|approve\s*\(/.test(api), 'Vercel public proxy must not contain marketplace credentials or chain writes.');

assert(ownerApi.includes("if (req.method !== 'POST')"), 'Owner workspace endpoint must be POST-only.');
assert(ownerApi.includes("'challenge'") && ownerApi.includes("'verify'") && ownerApi.includes("'workspace'"), 'Owner endpoint action allowlist incomplete.');
assert(ownerApi.includes('x-forge-session'), 'Owner workspace must use scoped server sessions.');
assert(ownerApi.includes('forge-collection-security-owner'), 'Owner proxy must use the server-side verification broker.');
assert(!/eth_sendTransaction|wallet_sendCalls|setApprovalForAll|approve\s*\(|fulfillment_data/.test(ownerApi), 'Owner proxy must not submit chain or marketplace write actions.');

const nav = fs.readFileSync('forge-nav-state.js', 'utf8');
assert(nav.includes("href: '/forge/floor-guard'"), 'Shared FORGE nav must expose FLOOR GUARD.');
assert(!nav.includes("href: '/forge/wl-cleaner'") && !nav.includes("href: '/forge/gtd-check'"), 'Retired tools must not return to shared nav.');
assert(nav.includes('let syncScheduled = false;') && nav.includes('function scheduleSync()'), 'Shared nav must keep MutationObserver coalescing.');
assert(nav.includes('requestAnimationFrame(run)') && nav.includes('finally {\n      syncing = false;'), 'Shared nav observer-race guards must remain intact.');

const xrayEnhancement = fs.readFileSync('forge-table-pagination.js', 'utf8');
assert(xrayEnhancement.includes("floor.href = '/forge/floor-guard'"), 'X-RAY nav must continue exposing FLOOR GUARD.');

const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const rewrites = new Map((vercel.rewrites || []).map((rule) => [rule.source, rule.destination]));
const redirects = new Map((vercel.redirects || []).map((rule) => [rule.source, rule.destination]));
assert(rewrites.get('/forge/floor-guard') === '/forge-floor-guard', 'Missing FLOOR GUARD clean route.');
assert(redirects.get('/forge/wl-cleaner') === '/forge/floor-guard' && redirects.get('/forge/gtd-check') === '/forge/floor-guard', 'Retired tool redirects must continue pointing to FLOOR GUARD.');
const headers = new Map((vercel.headers || []).map((entry) => [entry.source, new Map((entry.headers || []).map((h) => [h.key.toLowerCase(), h.value.toLowerCase()]))]));
assert(headers.get('/forge/floor-guard')?.get('cache-control') === 'no-store, max-age=0', 'Collection Security UI must stay no-store during rollout.');

console.log('FORGE COLLECTION SECURITY: PASS · compact bidder intelligence · compact scan history · owner verification workspace · monitoring deltas · evidence-first · public Mainnet client launch gate enabled');
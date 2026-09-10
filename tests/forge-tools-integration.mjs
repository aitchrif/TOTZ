import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const file of ['forge-gtd-check.html', 'forge-gtd-check.js', 'forge-wl-cleaner.html', 'forge-wl-cleaner.js', 'forge-nav-state.js', 'forge-runtime-config.js', 'vercel.json']) {
  assert(fs.existsSync(file), `Missing FORGE tool file: ${file}`);
}

const runtime = fs.readFileSync('forge-runtime-config.js', 'utf8');
assert(runtime.includes("const environment = 'mainnet';"), 'FORGE tools must use the production Mainnet read runtime.');
assert(runtime.includes('const mainnetClaimsEnabled = false;'), 'New Mainnet deploy/fund/publish must remain locked.');

const gtdHtml = fs.readFileSync('forge-gtd-check.html', 'utf8');
const gtdJs = fs.readFileSync('forge-gtd-check.js', 'utf8');
assert(gtdHtml.includes('GTD CHECK V1'), 'GTD CHECK identity missing.');
assert(gtdHtml.includes('ANY') && gtdHtml.includes('ALL'), 'GTD CHECK must expose ANY / ALL rule modes.');
assert(gtdHtml.includes('No wallet signature'), 'GTD CHECK must state its read-only safety boundary.');
assert(gtdJs.includes('const MAX_RULES = 4;'), 'GTD CHECK must cap rule count at four.');
assert(gtdJs.includes("mode: 'balance'"), 'GTD CHECK must use the read-only holder balance API mode.');
assert(gtdJs.includes('Promise.all(rules.map'), 'GTD CHECK must evaluate rule balances without serial wallet transactions.');
assert(!/eth_sendTransaction|wallet_sendCalls|approve\(/.test(gtdJs), 'GTD CHECK must not contain a transaction path.');
assert(gtdJs.includes("new URL('/forge/gtd-check', location.origin)"), 'GTD CHECK must generate a clean shareable setup route.');
assert(!/url\.searchParams\.set\(['"]wallet/.test(gtdJs), 'GTD CHECK setup links must not include the checked wallet.');

const cleanerHtml = fs.readFileSync('forge-wl-cleaner.html', 'utf8');
const cleanerJs = fs.readFileSync('forge-wl-cleaner.js', 'utf8');
assert(cleanerHtml.includes('WL CLEANER V1'), 'WL CLEANER identity missing.');
assert(cleanerHtml.includes('Local-only processing') && cleanerHtml.includes('NO UPLOAD'), 'WL CLEANER must state local-only processing.');
assert(cleanerJs.includes("const ZERO = '0x0000000000000000000000000000000000000000';"), 'WL CLEANER must handle the zero address explicitly.');
assert(cleanerJs.includes('new Blob('), 'WL CLEANER must support local exports.');
assert(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon/.test(cleanerJs), 'WL CLEANER must not upload wallet-list content.');
assert(cleanerJs.includes('seen.has(key)'), 'WL CLEANER must deduplicate addresses case-insensitively.');

const navState = fs.readFileSync('forge-nav-state.js', 'utf8');
assert(navState.includes("href: '/forge/wl-cleaner'"), 'Shared FORGE nav must expose WL CLEANER.');
assert(navState.includes("href: '/forge/gtd-check'"), 'Shared FORGE nav must expose GTD CHECK.');
assert(!navState.includes('WL CLEANER · SOON'), 'WL CLEANER must no longer be a SOON placeholder.');
assert(!navState.includes('GTD CHECK · SOON'), 'GTD CHECK must no longer be a SOON placeholder.');

const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const rewrites = new Map((vercel.rewrites || []).map((rule) => [rule.source, rule.destination]));
assert(rewrites.get('/forge/wl-cleaner') === '/forge-wl-cleaner', 'Missing WL CLEANER clean route.');
assert(rewrites.get('/forge/gtd-check') === '/forge-gtd-check', 'Missing GTD CHECK clean route.');
const headers = new Map((vercel.headers || []).map((entry) => [entry.source, new Map((entry.headers || []).map((h) => [h.key.toLowerCase(), h.value.toLowerCase()]))]));
assert(headers.get('/forge/wl-cleaner')?.get('cache-control') === 'no-store, max-age=0', 'WL CLEANER route must be no-store during rollout.');
assert(headers.get('/forge/gtd-check')?.get('cache-control') === 'no-store, max-age=0', 'GTD CHECK route must be no-store during rollout.');

console.log('FORGE TOOLS INTEGRATION: PASS · GTD CHECK read-only multi-rule · WL CLEANER local-only · live shared nav · Mainnet writes locked');

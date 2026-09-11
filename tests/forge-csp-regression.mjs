import fs from 'node:fs';

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };

const ETHERS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/ethers/6.15.0/ethers.umd.min.js';
const ETHERS_SRI = 'sha512-UXYETj+vXKSURF1UlgVRLzWRS9ZiQTv3lcL4rbeLyqTXCPNZC6PTLF/Ik3uxm2Zo+E109cUpJPZfLxJsCgKSng==';
const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const headers = Array.isArray(config.headers) ? config.headers : [];

function headerMap(rule) {
  return new Map((rule?.headers || []).map(({ key, value }) => [String(key).toLowerCase(), String(value)]));
}

const globalRule = headers.find((rule) => rule.source === '/(.*)');
assert(globalRule, 'Missing global security header rule.');
const globalHeaders = headerMap(globalRule);
assert(globalHeaders.get('strict-transport-security') === 'max-age=31536000', 'HSTS must be enabled for one year.');
assert(globalHeaders.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options must remain nosniff.');
assert(globalHeaders.get('x-frame-options') === 'DENY', 'X-Frame-Options must remain DENY.');
assert(globalHeaders.get('x-permitted-cross-domain-policies') === 'none', 'Cross-domain policy files must remain disabled.');

const forgeRule = headers.find((rule) => rule.source === '/forge(.*)');
assert(forgeRule, 'Missing FORGE-specific browser security policy.');
const csp = headerMap(forgeRule).get('content-security-policy');
assert(csp, 'Missing Content-Security-Policy on FORGE routes.');

const directives = new Map();
for (const rawDirective of csp.split(';')) {
  const parts = rawDirective.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) continue;
  directives.set(parts[0], parts.slice(1));
}

function requireDirective(name, requiredValues = []) {
  const values = directives.get(name);
  assert(values, `CSP directive ${name} is required.`);
  for (const value of requiredValues) assert(values.includes(value), `CSP ${name} must include ${value}.`);
  return values;
}

requireDirective('default-src', ["'self'"]);
requireDirective('base-uri', ["'self'"]);
requireDirective('object-src', ["'none'"]);
requireDirective('frame-ancestors', ["'none'"]);
requireDirective('form-action', ["'self'"]);
const scriptSrc = requireDirective('script-src', ["'self'", 'https://cdnjs.cloudflare.com']);
requireDirective('script-src-attr', ["'none'"]);
requireDirective('style-src', ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com']);
requireDirective('font-src', ["'self'", 'https://fonts.gstatic.com']);
requireDirective('img-src', ["'self'", 'https:']);
requireDirective('connect-src', [
  "'self'",
  'https://yymwpnztjlyfxongwmsw.supabase.co',
  'https://rpc.mainnet.chain.robinhood.com',
  'https://rpc.testnet.chain.robinhood.com'
]);
requireDirective('frame-src', ["'none'"]);
assert(directives.has('upgrade-insecure-requests'), 'CSP must upgrade insecure requests.');
assert(!scriptSrc.includes("'unsafe-inline'"), 'CSP script-src must not allow unsafe-inline.');
assert(!scriptSrc.includes("'unsafe-eval'"), 'CSP script-src must not allow unsafe-eval.');
assert(!scriptSrc.includes('*'), 'CSP script-src must not contain wildcard sources.');
assert(!scriptSrc.includes('https://cdn.jsdelivr.net'), 'CSP must not trust the old jsDelivr script origin.');

const htmlFiles = [
  'forge.html',
  'forge-guide.html',
  'forge-epochs.html',
  'forge-my-epochs.html',
  'forge-floor-guard.html',
  'forge-claim-launcher.html',
  'forge-claim.html'
];

let externalEthersCount = 0;
for (const file of htmlFiles) {
  assert(fs.existsSync(file), `Expected FORGE page is missing: ${file}`);
  const html = fs.readFileSync(file, 'utf8');

  const insecureActiveResource = [...html.matchAll(/\b(?:src|href)=["'](http:\/\/[^"']+)["']/gi)];
  assert(!insecureActiveResource.length, `${file} contains an insecure http:// resource: ${insecureActiveResource[0]?.[1] || ''}`);
  assert(!html.includes('cdn.jsdelivr.net/npm/ethers'), `${file} still references the old ethers CDN.`);

  const inlineScripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .filter((match) => match[1].trim().length > 0);
  assert(inlineScripts.length === 0, `${file} contains inline executable JavaScript.`);

  const externalTags = [...html.matchAll(/<script\b[^>]*\bsrc=["'](https:\/\/[^"']+)["'][^>]*><\/script>/gi)];
  for (const match of externalTags) {
    const tag = match[0];
    const url = match[1];
    assert(url === ETHERS_URL, `${file} loads an unapproved external script: ${url}`);
    assert(tag.includes(`integrity="${ETHERS_SRI}"`), `${file} ethers script is missing the approved SRI hash.`);
    assert(/crossorigin=["']anonymous["']/i.test(tag), `${file} ethers script must use crossorigin="anonymous".`);
    externalEthersCount++;
  }
}

assert(externalEthersCount === 4, `Expected four direct SRI-pinned ethers loads, found ${externalEthersCount}.`);

const bootstrap = fs.readFileSync('forge-epochs-bootstrap.js', 'utf8');
assert(bootstrap.includes(`const ETHERS_URL = '${ETHERS_URL}'`), 'EPOCHS bootstrap ethers URL drifted.');
assert(bootstrap.includes(`const ETHERS_INTEGRITY = '${ETHERS_SRI}'`), 'EPOCHS bootstrap SRI hash drifted.');
assert(bootstrap.includes("ethersScript.crossOrigin = 'anonymous'"), 'EPOCHS bootstrap must set crossOrigin=anonymous.');
assert(bootstrap.includes("ethersScript.integrity = ETHERS_INTEGRITY"), 'EPOCHS bootstrap must apply SRI before insertion.');

console.log('FORGE CSP REGRESSION: PASS');
console.log(`Checked ${htmlFiles.length} FORGE pages, zero inline executable scripts, exact SRI-pinned ethers dependency and CSP directives.`);

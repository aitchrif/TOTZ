import fs from 'node:fs';

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };

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
const scriptSrc = requireDirective('script-src', ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net']);
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
assert(!scriptSrc.includes("'unsafe-eval'"), 'CSP must not allow unsafe-eval.');
assert(!scriptSrc.includes('*'), 'CSP script-src must not contain wildcard sources.');

const htmlFiles = [
  'forge.html',
  'forge-guide.html',
  'forge-epochs.html',
  'forge-my-epochs.html',
  'forge-floor-guard.html',
  'forge-claim-launcher.html',
  'forge-claim.html'
];

const allowedExternalScripts = new Set([
  'https://cdn.jsdelivr.net/npm/ethers@6.15.0/dist/ethers.umd.min.js',
  'https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.umd.min.js'
]);

let totalInlineScripts = 0;
for (const file of htmlFiles) {
  assert(fs.existsSync(file), `Expected FORGE page is missing: ${file}`);
  const html = fs.readFileSync(file, 'utf8');

  const insecureActiveResource = [...html.matchAll(/\b(?:src|href)=["'](http:\/\/[^"']+)["']/gi)];
  assert(!insecureActiveResource.length, `${file} contains an insecure http:// resource: ${insecureActiveResource[0]?.[1] || ''}`);

  const externalScripts = [...html.matchAll(/<script\b[^>]*\bsrc=["'](https:\/\/[^"']+)["'][^>]*>/gi)].map((match) => match[1]);
  for (const url of externalScripts) {
    assert(allowedExternalScripts.has(url), `${file} loads an unapproved external script: ${url}`);
    assert(/@\d+\.\d+\.\d+\//.test(url), `${file} external dependency is not pinned to an exact version: ${url}`);
  }

  const inlineScripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .filter((match) => match[1].trim().length > 0);
  totalInlineScripts += inlineScripts.length;
  if (inlineScripts.length) {
    assert(file === 'forge-epochs.html', `${file} contains unexpected inline executable JavaScript.`);
    assert(inlineScripts.length === 1, `${file} contains more than the one currently-reviewed inline bootstrap.`);
  }
}

assert(totalInlineScripts === 1, `Expected exactly one reviewed inline FORGE bootstrap, found ${totalInlineScripts}.`);

console.log('FORGE CSP REGRESSION: PASS');
console.log(`Checked ${htmlFiles.length} FORGE pages, exact external script allowlist, transport headers and CSP directives.`);

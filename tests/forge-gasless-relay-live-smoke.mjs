const SERVICE = 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/forge-gasless-relay';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

const testnet = await request(`${SERVICE}?route=status&chainId=46630`);
assert(testnet.response.status === 200, `Testnet status HTTP ${testnet.response.status}`);
assert(testnet.body?.mode === 'erc4337-paymaster', 'Unexpected relay mode');
assert(testnet.body?.chainId === 46630, 'Unexpected Testnet chain ID');
assert(testnet.body?.environment === 'testnet', 'Unexpected Testnet environment');
assert(testnet.body?.releaseEnabled === false, 'Testnet gasless release gate unexpectedly enabled');
assert(testnet.body?.enabled === false, 'Testnet gasless relay unexpectedly enabled');
assert(testnet.body?.entryPoint?.toLowerCase() === '0x4337084d9e255ff0702461cf8895ce9e3b5ff108', 'Unexpected Testnet EntryPoint');
console.log(`PASS Testnet relay deployed and fail-closed (configured=${Boolean(testnet.body?.configured)})`);

const mainnet = await request(`${SERVICE}?route=status&chainId=4663`);
assert(mainnet.response.status === 200, `Mainnet status HTTP ${mainnet.response.status}`);
assert(mainnet.body?.chainId === 4663, 'Unexpected Mainnet chain ID');
assert(mainnet.body?.environment === 'mainnet', 'Unexpected Mainnet environment');
assert(mainnet.body?.releaseEnabled === false, 'Mainnet gasless release gate unexpectedly enabled');
assert(mainnet.body?.enabled === false, 'Mainnet gasless relay unexpectedly enabled');
console.log(`PASS Mainnet relay remains fail-closed (configured=${Boolean(mainnet.body?.configured)})`);

const malformed = await request(`${SERVICE}?route=relay`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ slug: 'x' }),
});
assert(malformed.response.status === 400, `Malformed relay request should fail 400, got ${malformed.response.status}`);
assert(String(malformed.body?.error || '').toLowerCase().includes('malformed'), 'Malformed relay request did not fail at input validation');
console.log('PASS malformed relay request rejected before any sponsorship path');

console.log('FORGE GASLESS RELAY LIVE FAIL-CLOSED SMOKE: PASSED');

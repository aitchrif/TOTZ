import assert from 'node:assert/strict';
import fs from 'node:fs';

const wrapper = fs.readFileSync('supabase/functions/forge-gasless-relay/index.ts', 'utf8');
const core = fs.readFileSync('supabase/functions/forge-gasless-relay/relay-core.ts', 'utf8');

assert.match(wrapper, /robinhood-testnet\.g\.alchemy\.com/);
assert.match(wrapper, /alchemy_requestGasAndPaymasterAndData/);
assert.match(wrapper, /callGasLimit:\s*"0x493e0"/);
assert.match(wrapper, /verificationGasLimit:\s*"0x11170"/);
assert.match(wrapper, /await import\("\.\/relay-core\.ts"\)/);
assert.doesNotMatch(wrapper, /robinhood-mainnet\.g\.alchemy\.com/);

assert.match(core, /chainId === 46630/);
assert.match(core, /chainId === 4663/);
assert.match(core, /mainnet_claims_enabled/);
assert.match(core, /mainnet_release_mode/);
assert.match(core, /gasless_mainnet_enabled/);

console.log('PASS gasless Testnet gas guard is scoped and Mainnet fail-closed gates remain in core');

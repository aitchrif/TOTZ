import fs from 'node:fs';

const html = fs.readFileSync('forge-claim.html', 'utf8');
const runtime = fs.readFileSync('forge-runtime-config.js', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(!html.includes('gaslessClaimBtn'), 'public claim UI must not expose a gasless claim button');
assert(!html.includes('CLAIM — GAS SPONSORED'), 'public claim UI must not advertise sponsored claims');
assert(html.includes('id="claimBtn"') && html.includes('>CLAIM</button>'), 'public claim UI must expose the direct CLAIM action');
assert(html.includes('Your wallet shows and pays the Robinhood Chain network fee before confirmation.'), 'public claim UI must explain that the holder pays network gas');
assert(/gaslessRelay\s*:\s*''/.test(runtime), 'public runtime must keep the gasless relay URL empty');
assert(/const mainnetClaimsEnabled = false;/.test(runtime), 'mainnet launch gate must remain locked in the public runtime');
assert(runtime.includes('canInteractWithPublishedClaim'), 'published immutable claims must remain interactable after launch lockdown');

console.log('FORGE direct-claim UI regression: PASS');

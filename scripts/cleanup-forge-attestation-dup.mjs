import fs from 'node:fs';

const path = 'supabase/functions/forge-claims/index.ts';
let text = fs.readFileSync(path, 'utf8');
const needle = 'type ClaimRuntimeImmutables = {';
const positions = [];
let from = 0;
while (true) {
  const i = text.indexOf(needle, from);
  if (i < 0) break;
  positions.push(i);
  from = i + needle.length;
}
if (positions.length < 1) throw new Error('Immutable attestation block missing.');
if (positions.length > 1) {
  const normalizer = text.indexOf('function normalizedRuntimeCoreHash(code: string) {', positions[positions.length - 1]);
  if (normalizer < 0) throw new Error('Runtime normalizer missing after duplicate blocks.');
  const oneBlock = text.slice(positions[0], positions[1]);
  text = text.slice(0, positions[0]) + oneBlock + text.slice(normalizer);
}
const count = (text.match(/type ClaimRuntimeImmutables = \{/g) || []).length;
if (count !== 1) throw new Error(`Expected one immutable attestation block, found ${count}.`);
fs.writeFileSync(path, text);
console.log('FORGE attestation helper deduplicated.');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const solc = require('solc');
const { keccak256 } = require('ethers');

const sourcePath = 'contracts/Forge4337ClaimAccount.sol';
const artifactPath = 'artifacts/Forge4337ClaimAccount.json';
const committed = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

const input = {
  language: 'Solidity',
  sources: { [sourcePath]: { content: fs.readFileSync(sourcePath, 'utf8') } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences'] } },
  },
};
function findImports(importPath) {
  try { return { contents: fs.readFileSync(path.resolve('node_modules', importPath), 'utf8') }; }
  catch { return { error: `Import not found: ${importPath}` }; }
}
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
const errors = (output.errors || []).filter((entry) => entry.severity === 'error');
if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage).join('\n'));
const c = output.contracts[sourcePath].Forge4337ClaimAccount;
const deployed = c.evm.deployedBytecode.object;
const immutableReferences = c.evm.deployedBytecode.immutableReferences || {};
const bytes = Buffer.from(deployed, 'hex');
for (const ranges of Object.values(immutableReferences)) {
  for (const { start, length } of ranges) bytes.fill(0, start, start + length);
}
const runtimeHash = keccak256('0x' + bytes.toString('hex'));

assert.equal(committed.contractName, 'Forge4337ClaimAccount');
assert.equal(committed.compiler, '0.8.24');
assert.deepEqual(committed.optimizer, { enabled: true, runs: 200 });
assert.equal(committed.bytecode, '0x' + c.evm.bytecode.object, 'committed account creation bytecode drifted');
assert.equal(committed.deployedBytecode, '0x' + deployed, 'committed account runtime bytecode drifted');
assert.deepEqual(committed.immutableReferences, immutableReferences, 'committed account immutable ranges drifted');
assert.equal(committed.normalizedRuntimeHash, runtimeHash, 'committed account normalized runtime hash drifted');
assert.equal(runtimeHash, '0x675d5fc710082275eff5bf11373fb5412d78ead8032e4f8ddaa29a4d2f7fbf51', 'approved production account runtime hash changed');

console.log('FORGE 4337 ACCOUNT ARTIFACT REGRESSION: PASSED');

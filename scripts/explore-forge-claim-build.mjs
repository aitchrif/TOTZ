import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { keccak256 } from 'ethers';

const ROOT = process.cwd();
const sourcePath = 'contracts/ForgeMerkleClaim.sol';
const base = fs.readFileSync(sourcePath, 'utf8');
const legacy = JSON.parse(fs.readFileSync('artifacts/ForgeMerkleClaim.json', 'utf8'));

function readImport(importPath) {
  for (const candidate of [path.join(ROOT, importPath), path.join(ROOT, 'node_modules', importPath)]) {
    if (fs.existsSync(candidate)) return { contents: fs.readFileSync(candidate, 'utf8') };
  }
  return { error: `Import not found: ${importPath}` };
}
function raw(v='') { return v.startsWith('0x') ? v.slice(2) : v; }
function stripMetadata(hex) {
  const h=raw(hex); const n=parseInt(h.slice(-4),16); const cut=(n+2)*2;
  return Number.isFinite(n)&&cut>0&&cut<=h.length?h.slice(0,-cut):h;
}
function refsList(refs={}) { return Object.values(refs).flat(); }
function zero(hex, refs={}) {
  const chars=raw(hex).split('');
  for (const r of refsList(refs)) for(let i=r.start*2;i<(r.start+r.length)*2;i++) chars[i]='0';
  return chars.join('');
}
function compile(source) {
  const input={language:'Solidity',sources:{[sourcePath]:{content:source}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',metadata:{bytecodeHash:'ipfs',appendCBOR:true},outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences']}}}};
  const out=JSON.parse(solc.compile(JSON.stringify(input),{import:readImport}));
  const errors=(out.errors||[]).filter(e=>e.severity==='error'); if(errors.length) throw new Error(errors.map(e=>e.formattedMessage).join('\n'));
  return out.contracts[sourcePath].ForgeMerkleClaim;
}
function commonPrefix(a,b){let i=0;while(i<a.length&&i<b.length&&a[i]===b[i])i++;return Math.floor(i/2);}
function commonSuffix(a,b){let i=0;while(i<a.length&&i<b.length&&a[a.length-1-i]===b[b.length-1-i])i++;return Math.floor(i/2);}

const legacyCore=stripMetadata(zero(legacy.deployedBytecode,legacy.immutableReferences));
const variants=[];
function add(name, transform){variants.push([name,transform(base)]);}
add('base',s=>s);
add('verify-memory',s=>s.replace('MerkleProof.verifyCalldata(proof, merkleRoot, leaf)','MerkleProof.verify(proof, merkleRoot, leaf)'));
add('balance-gt-zero',s=>s.replace('if (balance != 0) token.safeTransfer(sponsor, balance);','if (balance > 0) token.safeTransfer(sponsor, balance);'));
add('verify-memory+balance-gt-zero',s=>s.replace('MerkleProof.verifyCalldata(proof, merkleRoot, leaf)','MerkleProof.verify(proof, merkleRoot, leaf)').replace('if (balance != 0) token.safeTransfer(sponsor, balance);','if (balance > 0) token.safeTransfer(sponsor, balance);'));
add('direct-total-update',s=>s.replace('        uint256 nextClaimed = totalClaimed + amount;\n        if (nextClaimed > totalAllocated) revert AllocationExceeded();','        if (totalClaimed + amount > totalAllocated) revert AllocationExceeded();').replace('        totalClaimed = nextClaimed;','        totalClaimed += amount;'));
add('verify-memory+direct-total-update',s=>s.replace('MerkleProof.verifyCalldata(proof, merkleRoot, leaf)','MerkleProof.verify(proof, merkleRoot, leaf)').replace('        uint256 nextClaimed = totalClaimed + amount;\n        if (nextClaimed > totalAllocated) revert AllocationExceeded();','        if (totalClaimed + amount > totalAllocated) revert AllocationExceeded();').replace('        totalClaimed = nextClaimed;','        totalClaimed += amount;'));

console.log(`legacy core bytes=${legacyCore.length/2} hash=${keccak256('0x'+legacyCore)}`);
for(const [name,src] of variants){
  const c=compile(src); const runtime=c.evm.deployedBytecode.object; const core=stripMetadata(zero(runtime,c.evm.deployedBytecode.immutableReferences));
  console.log(JSON.stringify({name,runtimeBytes:runtime.length/2,coreBytes:core.length/2,coreHash:keccak256('0x'+core),exact:core===legacyCore,prefixBytes:commonPrefix(core,legacyCore),suffixBytes:commonSuffix(core,legacyCore)}));
}

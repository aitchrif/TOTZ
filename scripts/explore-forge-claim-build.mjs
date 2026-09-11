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
function firstDiff(a,b){let i=0;while(i<a.length&&i<b.length&&a[i]===b[i])i++;return Math.floor(i/2);}
function windowAt(hex, byte, radius=28){const from=Math.max(0,(byte-radius)*2);const to=Math.min(hex.length,(byte+radius)*2);return hex.slice(from,to);}

const legacyCore=stripMetadata(zero(legacy.deployedBytecode,legacy.immutableReferences));
const variants=[];
function add(name, source){variants.push([name,source]);}

const ozAliases=['oz500','oz501','oz502','oz510','oz520','oz530','oz540'];
for (const alias of ozAliases) {
  const s=base.replaceAll('@openzeppelin/contracts', alias);
  add(`${alias}:base`,s);
  add(`${alias}:claimCount++`,s.replace('claimCount += 1;','claimCount++;'));
  add(`${alias}:++claimCount`,s.replace('claimCount += 1;','++claimCount;'));
  add(`${alias}:balance>0`,s.replace('if (balance != 0) token.safeTransfer(sponsor, balance);','if (balance > 0) token.safeTransfer(sponsor, balance);'));
}

console.log(`legacy core bytes=${legacyCore.length/2} hash=${keccak256('0x'+legacyCore)}`);
let best=null;
for(const [name,src] of variants){
  try {
    const c=compile(src); const runtime=c.evm.deployedBytecode.object; const core=stripMetadata(zero(runtime,c.evm.deployedBytecode.immutableReferences));
    const prefix=commonPrefix(core,legacyCore), suffix=commonSuffix(core,legacyCore), delta=(core.length-legacyCore.length)/2;
    const row={name,runtimeBytes:runtime.length/2,coreBytes:core.length/2,deltaBytes:delta,coreHash:keccak256('0x'+core),exact:core===legacyCore,prefixBytes:prefix,suffixBytes:suffix};
    console.log(JSON.stringify(row));
    const score=Math.abs(delta)*100000-prefix-suffix;
    if(!best||score<best.score) best={score,row,core};
    if(row.exact){console.log(`EXACT CORE MATCH: ${name}`);break;}
  } catch (error) {
    console.log(JSON.stringify({name,error:String(error?.message||error).slice(0,500)}));
  }
}
if(best){
  const byte=firstDiff(best.core,legacyCore);
  console.log('BEST',JSON.stringify(best.row));
  console.log(`firstDiffByte=${byte}`);
  console.log(`candidateWindow=${windowAt(best.core,byte)}`);
  console.log(`legacyWindow=${windowAt(legacyCore,byte)}`);
}

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

const OPCODES = {
  0x00:'STOP',0x01:'ADD',0x02:'MUL',0x03:'SUB',0x04:'DIV',0x05:'SDIV',0x06:'MOD',0x07:'SMOD',0x08:'ADDMOD',0x09:'MULMOD',0x0a:'EXP',0x0b:'SIGNEXTEND',
  0x10:'LT',0x11:'GT',0x12:'SLT',0x13:'SGT',0x14:'EQ',0x15:'ISZERO',0x16:'AND',0x17:'OR',0x18:'XOR',0x19:'NOT',0x1a:'BYTE',0x1b:'SHL',0x1c:'SHR',0x1d:'SAR',
  0x20:'KECCAK256',0x30:'ADDRESS',0x31:'BALANCE',0x32:'ORIGIN',0x33:'CALLER',0x34:'CALLVALUE',0x35:'CALLDATALOAD',0x36:'CALLDATASIZE',0x37:'CALLDATACOPY',0x38:'CODESIZE',0x39:'CODECOPY',0x3a:'GASPRICE',0x3b:'EXTCODESIZE',0x3c:'EXTCODECOPY',0x3d:'RETURNDATASIZE',0x3e:'RETURNDATACOPY',0x3f:'EXTCODEHASH',
  0x40:'BLOCKHASH',0x41:'COINBASE',0x42:'TIMESTAMP',0x43:'NUMBER',0x44:'PREVRANDAO',0x45:'GASLIMIT',0x46:'CHAINID',0x47:'SELFBALANCE',0x48:'BASEFEE',0x49:'BLOBHASH',0x4a:'BLOBBASEFEE',
  0x50:'POP',0x51:'MLOAD',0x52:'MSTORE',0x53:'MSTORE8',0x54:'SLOAD',0x55:'SSTORE',0x56:'JUMP',0x57:'JUMPI',0x58:'PC',0x59:'MSIZE',0x5a:'GAS',0x5b:'JUMPDEST',0x5f:'PUSH0',
  0xf0:'CREATE',0xf1:'CALL',0xf2:'CALLCODE',0xf3:'RETURN',0xf4:'DELEGATECALL',0xf5:'CREATE2',0xfa:'STATICCALL',0xfd:'REVERT',0xfe:'INVALID',0xff:'SELFDESTRUCT'
};
function disassemble(hex) {
  const bytes=Buffer.from(raw(hex),'hex'); const out=[];
  for(let pc=0;pc<bytes.length;){
    const op=bytes[pc], start=pc; pc++;
    let name=OPCODES[op]||`OP_${op.toString(16).padStart(2,'0')}`, data='';
    if(op>=0x60&&op<=0x7f){const n=op-0x5f;name=`PUSH${n}`;data=bytes.subarray(pc,Math.min(bytes.length,pc+n)).toString('hex');pc+=n;}
    else if(op>=0x80&&op<=0x8f) name=`DUP${op-0x7f}`;
    else if(op>=0x90&&op<=0x9f) name=`SWAP${op-0x8f}`;
    else if(op>=0xa0&&op<=0xa4) name=`LOG${op-0x9f}`;
    out.push({pc:start,op,name,data});
  }
  return out;
}
function opcodeShapeDiff(aHex,bHex) {
  const a=disassemble(aHex),b=disassemble(bHex);
  let i=0;while(i<a.length&&i<b.length&&a[i].name===b[i].name)i++;
  const show=(arr,idx)=>arr.slice(Math.max(0,idx-12),Math.min(arr.length,idx+18)).map(x=>`${x.pc.toString(16).padStart(4,'0')}:${x.name}${x.data?`(${x.data})`:''}`).join(' ');
  return {index:i,aInstructions:a.length,bInstructions:b.length,aAround:show(a,i),bAround:show(b,i)};
}

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
  console.log('OPCODE_SHAPE_DIFF',JSON.stringify(opcodeShapeDiff(best.core,legacyCore),null,2));
}

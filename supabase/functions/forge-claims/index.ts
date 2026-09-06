import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AbiCoder, Interface, keccak256, verifyMessage } from "https://esm.sh/ethers@6.15.0";

const CLAIM_CHAIN_ID = 46630;
const CLAIM_RPC = Deno.env.get("FORGE_CLAIM_RPC_URL") || "https://rpc.testnet.chain.robinhood.com";
const MAX_UINT256 = (1n << 256n) - 1n;
const SOURCE_CHAINS: Record<string, number> = {
  robinhood: 4663,
  ink: 57073,
  ethereum: 1,
  "robinhood-testnet": 46630,
};
const APPROVED_CLAIM_RUNTIME_HASH = "0x0051149977ffb2b42b63e07841f68b4bd382a1656ac32efbf5c3c064f12a0b56";
const CLAIM_IMMUTABLE_RANGES = [
  {start:522,length:32},{start:1020,length:32},{start:1288,length:32},{start:1422,length:32},{start:1618,length:32},{start:1864,length:32},
  {start:376,length:32},{start:1129,length:32},{start:1456,length:32},{start:1495,length:32},
  {start:255,length:32},{start:868,length:32},
  {start:329,length:32},{start:719,length:32},{start:1740,length:32},{start:1787,length:32},
  {start:186,length:32},{start:558,length:32},{start:1193,length:32},
];
const coder = AbiCoder.defaultAbiCoder();

const claimIface = new Interface([
  "function token() view returns (address)",
  "function sponsor() view returns (address)",
  "function merkleRoot() view returns (bytes32)",
  "function totalAllocated() view returns (uint256)",
  "function deadline() view returns (uint64)",
  "function contractBalance() view returns (uint256)",
  "function isFullyFunded() view returns (bool)"
]);
const tokenIface = new Interface([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
]);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-forge-upload-token",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), {
  status,
  headers: {...cors,"Content-Type":"application/json","Cache-Control":"no-store"}
});
const isAddr=(v:string)=>/^0x[a-fA-F0-9]{40}$/.test(v||"");
const isB32=(v:string)=>/^0x[a-fA-F0-9]{64}$/.test(v||"");
const isZeroAddr=(v:string)=>/^0x0{40}$/i.test(v||"");
const clean=(v:unknown,n=120)=>String(v??"").trim().slice(0,n);
const now=()=>Math.floor(Date.now()/1000);
function token(req:Request, body:any){return clean(req.headers.get("x-forge-upload-token")||body?.uploadToken,300);}
async function sha256(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("");}
function equalText(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
async function tokenMatches(clear:string, expected:string){if(!clear||!expected)return false;return equalText(await sha256(clear),expected);}
function validUnits(v:string){if(!/^\d{1,100}$/.test(v||""))return false;try{const n=BigInt(v);return n>0n&&n<=MAX_UINT256;}catch{return false;}}
function validSourcePair(key:string,id:number){return Object.prototype.hasOwnProperty.call(SOURCE_CHAINS,key)&&SOURCE_CHAINS[key]===id;}

function publicationMessageV2(body:any){
  const snapshotBlock=body.snapshotBlock==null?'':String(body.snapshotBlock);
  const fingerprint=String(body.packageFingerprint||'');
  return [
    'TOTZ FORGE CLAIM PUBLISH V2',
    `creator=${String(body.creatorWallet||'').toLowerCase()}`,
    `slug=${String(body.slug||'').toLowerCase()}`,
    `sourceChain=${String(body.sourceChain||'').toLowerCase()}`,
    `sourceChainId=${Number(body.sourceChainId||0)}`,
    `sourceContract=${String(body.sourceContract||'').toLowerCase()}`,
    `snapshotBlock=${snapshotBlock}`,
    `rewardToken=${String(body.rewardToken||'').toLowerCase()}`,
    `rewardSymbol=${String(body.rewardSymbol||'')}`,
    `rewardDecimals=${Number(body.rewardDecimals)}`,
    `merkleRoot=${String(body.merkleRoot||'').toLowerCase()}`,
    `totalAllocatedUnits=${String(body.totalAllocatedUnits||'')}`,
    `eligibleWallets=${Number(body.eligibleWallets||0)}`,
    `claimChainId=${Number(body.claimChainId||0)}`,
    `claimContract=${String(body.claimContract||'').toLowerCase()}`,
    `deadline=${Number(body.deadline||0)}`,
    `packageFingerprint=${fingerprint}`,
    `uploadTokenHash=${String(body.uploadTokenHash||'').toLowerCase()}`,
    `issuedAt=${Number(body.issuedAt||0)}`
  ].join('\n');
}

async function rpc(method:string,params:any[],timeoutMs=12000){
  const c=new AbortController();const t=setTimeout(()=>c.abort(),timeoutMs);
  try{
    const r=await fetch(CLAIM_RPC,{method:'POST',signal:c.signal,headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
    if(!r.ok)throw new Error(`RPC HTTP ${r.status}`);
    const d=await r.json();if(d?.error)throw new Error(d.error.message||'RPC error');return d?.result;
  }finally{clearTimeout(t);}
}
function normalizedRuntimeHash(code:string){
  const hex=String(code||'').replace(/^0x/,'');
  if(!hex||hex.length%2)throw new Error('invalid runtime');
  const bytes=new Uint8Array(hex.length/2);
  for(let i=0;i<bytes.length;i++)bytes[i]=parseInt(hex.slice(i*2,i*2+2),16);
  for(const {start,length} of CLAIM_IMMUTABLE_RANGES){if(start+length>bytes.length)throw new Error('runtime size mismatch');bytes.fill(0,start,start+length);}
  return keccak256(bytes);
}
async function assertApprovedClaimRuntime(address:string){
  const code=await rpc('eth_getCode',[address,'latest']);
  if(!code||code==='0x'||code==='0x0')throw new Error('Claim contract does not exist on the configured claim chain.');
  let actual='';
  try{actual=normalizedRuntimeHash(code);}catch{throw new Error('Claim contract runtime is not an approved TOTZ FORGE build.');}
  if(actual.toLowerCase()!==APPROVED_CLAIM_RUNTIME_HASH)throw new Error('Claim contract runtime is not an approved TOTZ FORGE build.');
  return actual;
}
async function codeAt(address:string){const c=await rpc('eth_getCode',[address,'latest']);return Boolean(c&&c!=='0x'&&c!=='0x0');}
async function call(iface:Interface,address:string,fn:string,args:any[]=[]){
  const data=iface.encodeFunctionData(fn,args);const result=await rpc('eth_call',[{to:address,data},'latest']);return iface.decodeFunctionResult(fn,result)[0];
}

async function verifyOnChain(expected:{creator:string;rewardToken:string;rewardSymbol:string;rewardDecimals:number;merkleRoot:string;totalUnits:string;claimChainId:number;claimContract:string;deadlineUnix:number;}, requireFunded=true){
  if(expected.claimChainId!==CLAIM_CHAIN_ID)throw new Error(`Unsupported claim chain ${expected.claimChainId}.`);
  const runtimeHash=await assertApprovedClaimRuntime(expected.claimContract);
  if(!await codeAt(expected.rewardToken))throw new Error('Reward token contract does not exist on the configured claim chain.');
  const [sponsor,tokenAddr,root,total,deadline,full,balance,symbol,decimals]=await Promise.all([
    call(claimIface,expected.claimContract,'sponsor'),
    call(claimIface,expected.claimContract,'token'),
    call(claimIface,expected.claimContract,'merkleRoot'),
    call(claimIface,expected.claimContract,'totalAllocated'),
    call(claimIface,expected.claimContract,'deadline'),
    call(claimIface,expected.claimContract,'isFullyFunded'),
    call(claimIface,expected.claimContract,'contractBalance'),
    call(tokenIface,expected.rewardToken,'symbol'),
    call(tokenIface,expected.rewardToken,'decimals')
  ]);
  if(String(sponsor).toLowerCase()!==expected.creator)throw new Error('Connected creator does not match the on-chain claim sponsor.');
  if(String(tokenAddr).toLowerCase()!==expected.rewardToken)throw new Error('Reward token does not match the on-chain claim contract.');
  if(String(root).toLowerCase()!==expected.merkleRoot)throw new Error('Merkle root does not match the on-chain claim contract.');
  if(BigInt(total)!==BigInt(expected.totalUnits))throw new Error('Total allocation does not match the on-chain claim contract.');
  if(Number(deadline)!==expected.deadlineUnix)throw new Error('Deadline does not match the on-chain claim contract.');
  if(Number(decimals)!==expected.rewardDecimals)throw new Error('Reward token decimals do not match the publication metadata.');
  if(String(symbol)!==expected.rewardSymbol)throw new Error('Reward token symbol does not match the publication metadata.');
  if(requireFunded&&!Boolean(full))throw new Error('Claim contract is not fully funded.');
  if(requireFunded&&BigInt(balance)<BigInt(expected.totalUnits))throw new Error('Claim contract balance is below the committed allocation.');
  return {sponsor:String(sponsor).toLowerCase(),funded:Boolean(full),balance:String(balance),runtimeHash};
}

function pairHash(a:string,b:string){const A=BigInt(a),B=BigInt(b);const x=A<=B?a:b,y=A<=B?b:a;return keccak256(`0x${x.slice(2)}${y.slice(2)}`);}
function claimLeaf(address:string,amount:string){const inner=keccak256(coder.encode(['address','uint256'],[address,BigInt(amount)]));return keccak256(inner);}
function verifyProof(leaf:string,proof:string[],root:string){let h=leaf;for(const p of proof)h=pairHash(h,p);return h.toLowerCase()===root.toLowerCase();}
function validateEntry(e:any,root:string){
  const wallet=clean(e?.wallet,42).toLowerCase(), amount=clean(e?.amount_units??e?.amountUnits,100), leaf=clean(e?.leaf,66).toLowerCase();
  const proof=Array.isArray(e?.proof)?e.proof.map((p:any)=>clean(p,66).toLowerCase()):[];
  if(!isAddr(wallet)||!validUnits(amount)||!isB32(leaf)||proof.length>64||proof.some((p:string)=>!isB32(p)))throw new Error(`Invalid claim entry for ${wallet||'wallet'}.`);
  const derived=claimLeaf(wallet,amount);
  if(derived.toLowerCase()!==leaf)throw new Error(`Leaf mismatch for ${wallet}.`);
  if(!verifyProof(leaf,proof,root))throw new Error(`Invalid Merkle proof for ${wallet}.`);
  return {wallet,amount,leaf,proof};
}

async function loadAllEntries(supabase:any,epochId:string,expectedCount:number){
  const out:any[]=[];let from=0;
  while(out.length<expectedCount){
    const {data,error}=await supabase.from('forge_claim_entries').select('wallet,amount_units,leaf,proof').eq('epoch_id',epochId).order('wallet',{ascending:true}).range(from,from+999);
    if(error)throw error;if(!data?.length)break;out.push(...data);if(data.length<1000)break;from+=1000;if(from>20000)break;
  }
  return out;
}

Deno.serve(async (req:Request) => {
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  try{
    const url=new URL(req.url);const route=(url.searchParams.get('route')||'').toLowerCase();
    const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});

    if(req.method==='GET'&&route==='get'){
      const slug=clean(url.searchParams.get('slug'),80).toLowerCase();if(!/^[a-z0-9-]{8,80}$/.test(slug))return json({error:'Invalid claim slug.'},400);
      const {data:epoch,error}=await supabase.from('forge_claim_epochs').select('id,slug,status,creator_wallet,source_chain,source_chain_id,source_contract,source_collection,snapshot_block,reward_token,reward_symbol,reward_decimals,merkle_root,total_allocated_units,eligible_wallets,claim_chain_id,claim_contract,deadline,package_fingerprint,created_at,published_at').eq('slug',slug).eq('status','published').maybeSingle();
      if(error)throw error;if(!epoch)return json({error:'Claim not found.'},404);
      const wallet=clean(url.searchParams.get('wallet'),42).toLowerCase();let claim=null;
      if(wallet&&isAddr(wallet)){const {data,error:e}=await supabase.from('forge_claim_entries').select('wallet,amount_units,leaf,proof').eq('epoch_id',epoch.id).eq('wallet',wallet).maybeSingle();if(e)throw e;claim=data||null;}
      const {count}=await supabase.from('forge_claim_entries').select('wallet',{count:'exact',head:true}).eq('epoch_id',epoch.id);
      return json({epoch:{...epoch,uploaded_entries:count||0},claim});
    }

    if(req.method!=='POST')return json({error:'Method not allowed.'},405);
    const body=await req.json().catch(()=>({}));

    if(route==='create'){
      const uploadToken=token(req,body);if(uploadToken.length<48)return json({error:'Upload token is invalid.'},400);
      const slug=clean(body.slug,80).toLowerCase();if(!/^[a-z0-9-]{8,80}$/.test(slug))return json({error:'Invalid slug.'},400);
      const creator=clean(body.creatorWallet,42).toLowerCase(),sourceContract=clean(body.sourceContract,42).toLowerCase(),rewardToken=clean(body.rewardToken,42).toLowerCase(),claimContract=clean(body.claimContract,42).toLowerCase(),root=clean(body.merkleRoot,66).toLowerCase();
      const sourceChain=clean(body.sourceChain,24).toLowerCase(),sourceChainId=Number(body.sourceChainId||0),snapshotBlock=body.snapshotBlock==null?null:Number(body.snapshotBlock);
      const totalUnits=clean(body.totalAllocatedUnits,100),eligible=Number(body.eligibleWallets),decimals=Number(body.rewardDecimals),claimChainId=Number(body.claimChainId),deadlineUnix=Number(body.deadline),issuedAt=Number(body.issuedAt),signature=clean(body.authSignature,200);
      if(!isAddr(creator)||!isAddr(sourceContract)||!isAddr(rewardToken)||!isAddr(claimContract)||!isB32(root)||isZeroAddr(creator)||isZeroAddr(sourceContract)||isZeroAddr(rewardToken)||isZeroAddr(claimContract))return json({error:'Invalid address or Merkle root.'},400);
      if(!validSourcePair(sourceChain,sourceChainId))return json({error:'Invalid source chain key / chain ID pair.'},400);
      if(snapshotBlock!==null&&(!Number.isSafeInteger(snapshotBlock)||snapshotBlock<0))return json({error:'Invalid snapshot block.'},400);
      if(sourceChain!=='robinhood-testnet'&&(!Number.isSafeInteger(snapshotBlock)||snapshotBlock<=0))return json({error:'A positive pinned snapshot block is required for mainnet source chains.'},400);
      if(!validUnits(totalUnits))return json({error:'Invalid allocation units.'},400);
      if(!Number.isInteger(eligible)||eligible<1||eligible>20000)return json({error:'Invalid eligible wallet count.'},400);
      if(!Number.isInteger(decimals)||decimals<0||decimals>36)return json({error:'Invalid token decimals.'},400);
      if(!Number.isInteger(claimChainId)||claimChainId!==CLAIM_CHAIN_ID)return json({error:'Unsupported claim chain.'},400);
      if(!Number.isFinite(deadlineUnix)||deadlineUnix<=now()+60)return json({error:'Deadline must be safely in the future.'},400);
      if(!Number.isInteger(issuedAt)||issuedAt<now()-300||issuedAt>now()+60)return json({error:'Publication authorization expired or has an invalid timestamp.'},403);
      const suppliedUploadHash=clean(body.uploadTokenHash,66).toLowerCase();
      if(!isB32(suppliedUploadHash))return json({error:'V2 upload token hash is required.'},400);
      const actualUploadHash=`0x${await sha256(uploadToken)}`;
      if(!equalText(actualUploadHash,suppliedUploadHash))return json({error:'Upload token hash does not match the protected session token.'},403);
      if(!/^0x[a-fA-F0-9]{130}$/.test(signature))return json({error:'Sponsor signature is required.'},403);
      let recovered='';try{recovered=verifyMessage(publicationMessageV2(body),signature).toLowerCase();}catch{return json({error:'Invalid sponsor signature.'},403);}
      if(recovered!==creator)return json({error:'Publication signature does not match the creator wallet.'},403);
      let chainCheck;try{chainCheck=await verifyOnChain({creator,rewardToken,rewardSymbol:clean(body.rewardSymbol,16),rewardDecimals:decimals,merkleRoot:root,totalUnits,claimChainId,claimContract,deadlineUnix},true);}catch(e){return json({error:`On-chain publication check failed: ${e instanceof Error?e.message:'verification failed'}`},409);}
      const row={slug,creator_wallet:creator,status:'uploading',source_chain:sourceChain,source_chain_id:sourceChainId,source_contract:sourceContract,source_collection:clean(body.sourceCollection,100)||null,snapshot_block:snapshotBlock,reward_token:rewardToken,reward_symbol:clean(body.rewardSymbol,16),reward_decimals:decimals,merkle_root:root,total_allocated_units:totalUnits,eligible_wallets:eligible,claim_chain_id:claimChainId,claim_contract:claimContract,deadline:new Date(deadlineUnix*1000).toISOString(),package_fingerprint:clean(body.packageFingerprint,100)||null,upload_token_hash:await sha256(uploadToken),uploaded_entries:0};
      const {data,error}=await supabase.from('forge_claim_epochs').insert(row).select('id,slug').single();
      if(error){if(String(error.code)==='23505')return json({error:'Claim slug, Merkle root, or contract already exists.'},409);throw error;}
      return json({ok:true,...data,authorizedCreator:creator,onChainVerified:true,runtimeAttested:true,runtimeHash:chainCheck.runtimeHash,authVersion:'V2'});
    }

    if(route==='upload'){
      const slug=clean(body.slug,80).toLowerCase(),uploadToken=token(req,body);
      const {data:epoch,error}=await supabase.from('forge_claim_epochs').select('id,status,upload_token_hash,eligible_wallets,merkle_root').eq('slug',slug).maybeSingle();if(error)throw error;if(!epoch)return json({error:'Claim not found.'},404);
      if(epoch.status!=='uploading')return json({error:'Claim package is already published.'},409);
      if(!await tokenMatches(uploadToken,epoch.upload_token_hash))return json({error:'Invalid upload token.'},403);
      const entries=Array.isArray(body.entries)?body.entries:[];if(!entries.length||entries.length>250)return json({error:'Upload 1-250 entries per request.'},400);
      const rows=[];try{for(const e of entries){const v=validateEntry(e,epoch.merkle_root);rows.push({epoch_id:epoch.id,wallet:v.wallet,amount_units:v.amount,leaf:v.leaf,proof:v.proof});}}catch(e){return json({error:e instanceof Error?e.message:'Invalid claim entry.'},400);}
      const {error:e}=await supabase.from('forge_claim_entries').upsert(rows,{onConflict:'epoch_id,wallet'});if(e)throw e;
      const {count}=await supabase.from('forge_claim_entries').select('wallet',{count:'exact',head:true}).eq('epoch_id',epoch.id);await supabase.from('forge_claim_epochs').update({uploaded_entries:count||0}).eq('id',epoch.id);
      return json({ok:true,uploadedEntries:count||0,expectedEntries:epoch.eligible_wallets});
    }

    if(route==='publish'){
      const slug=clean(body.slug,80).toLowerCase(),uploadToken=token(req,body);
      const {data:epoch,error}=await supabase.from('forge_claim_epochs').select('id,slug,status,upload_token_hash,creator_wallet,reward_token,reward_symbol,reward_decimals,merkle_root,total_allocated_units,eligible_wallets,claim_chain_id,claim_contract,deadline').eq('slug',slug).maybeSingle();if(error)throw error;if(!epoch)return json({error:'Claim not found.'},404);
      if(epoch.status!=='uploading')return json({error:'Claim package is already published.'},409);
      if(!await tokenMatches(uploadToken,epoch.upload_token_hash))return json({error:'Invalid upload token.'},403);
      const entries=await loadAllEntries(supabase,epoch.id,epoch.eligible_wallets);if(entries.length!==epoch.eligible_wallets)return json({error:`Claim package incomplete (${entries.length}/${epoch.eligible_wallets}).`},409);
      let total=0n;try{for(const e of entries){const v=validateEntry(e,epoch.merkle_root);total+=BigInt(v.amount);if(total>MAX_UINT256)throw new Error('Allocation total exceeds uint256.');}}catch(e){return json({error:`Server-side Merkle verification failed: ${e instanceof Error?e.message:'invalid entry'}`},409);}
      if(total!==BigInt(epoch.total_allocated_units))return json({error:'Server-side allocation total does not match the committed pool.'},409);
      const deadlineUnix=Math.floor(new Date(epoch.deadline).getTime()/1000);if(deadlineUnix<=now())return json({error:'Claim deadline has already passed.'},409);
      let chainCheck;try{chainCheck=await verifyOnChain({creator:String(epoch.creator_wallet).toLowerCase(),rewardToken:String(epoch.reward_token).toLowerCase(),rewardSymbol:String(epoch.reward_symbol),rewardDecimals:Number(epoch.reward_decimals),merkleRoot:String(epoch.merkle_root).toLowerCase(),totalUnits:String(epoch.total_allocated_units),claimChainId:Number(epoch.claim_chain_id),claimContract:String(epoch.claim_contract).toLowerCase(),deadlineUnix},true);}catch(e){return json({error:`Final on-chain publication check failed: ${e instanceof Error?e.message:'verification failed'}`},409);}
      const {data:updated,error:e}=await supabase.from('forge_claim_epochs').update({status:'published',published_at:new Date().toISOString(),uploaded_entries:entries.length}).eq('id',epoch.id).eq('status','uploading').select('id').maybeSingle();if(e)throw e;
      if(!updated)return json({error:'Claim publication state changed before finalization.'},409);
      return json({ok:true,slug,entries:entries.length,totalAllocatedUnits:total.toString(),serverVerified:true,onChainVerified:true,runtimeAttested:true,runtimeHash:chainCheck.runtimeHash});
    }

    return json({error:'Unknown route.'},404);
  }catch(e){console.error(e);return json({error:'FORGE claim service error.'},500);}
});

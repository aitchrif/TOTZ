(() => {
  const GENESIS = '0x107c4e7cf931b18e022d40184d03d00b4ec99d5a';
  const CHAINS = {
    robinhood: { name:'Robinhood Chain', chainId:4663 },
    ink: { name:'Ink', chainId:57073 },
    ethereum: { name:'Ethereum', chainId:1 }
  };
  const $ = (id) => document.getElementById(id);
  const isAddress = (v) => /^0x[a-fA-F0-9]{40}$/.test(String(v || ''));
  const fmt = (n, max=0) => Number(n || 0).toLocaleString(undefined,{maximumFractionDigits:max});
  const short = (a) => a ? `${a.slice(0,6)}…${a.slice(-4)}` : '—';

  let selectedChain = 'robinhood';
  let snapshot = null;
  let distribution = null;
  let access = { checked:false, genesis:false, wallet:null, balance:0 };

  function toast(message){
    const el=$('toast'); el.textContent=message; el.classList.add('show');
    clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove('show'),2000);
  }
  function status(id,message,type=''){
    const el=$(id); el.textContent=message; el.className=`status show ${type}`;
  }
  function clearStatus(id){const el=$(id); el.textContent=''; el.className='status';}
  function setBusy(busy){$('loadBtn').disabled=busy; document.querySelectorAll('.network-btn').forEach(b=>b.disabled=busy); $('loadBtn').textContent=busy?'LOADING…':'LOAD SNAPSHOT';}

  async function fetchJson(url, timeout=55000){
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeout);
    try{
      const r=await fetch(url,{cache:'no-store',signal:c.signal});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error||`Request failed (${r.status})`);
      return d;
    } finally {clearTimeout(t);}
  }

  function paramsFor(chain,contract){
    const p=new URLSearchParams(); p.set('chain',chain); if(isAddress(contract)) p.set('contract',contract.toLowerCase()); return p;
  }
  function syncLinks(){
    const contract=$('contractInput').value.trim().toLowerCase();
    const p=paramsFor(selectedChain,contract); const qs=p.toString();
    $('xrayNav').href=`/forge${qs?`?${qs}`:''}`;
    $('backXrayBtn').href=$('xrayNav').href;
  }
  function setNetwork(chain,{updateUrl=true}={}){
    if(!CHAINS[chain]) return;
    selectedChain=chain;
    document.querySelectorAll('.network-btn').forEach(b=>b.classList.toggle('active',b.dataset.chain===chain));
    snapshot=null; distribution=null; $('snapshot').hidden=true; $('results').hidden=true; clearStatus('sourceStatus'); clearStatus('epochStatus');
    if(updateUrl){const u=new URL(location.href); u.searchParams.set('chain',chain); u.searchParams.delete('contract'); history.replaceState({},'',u);}
    syncLinks();
  }

  function updateSnapshotCard(contract,data){
    const info=data.info||{};
    const holders=(data.holders||[]).map(h=>({address:String(h.address||'').toLowerCase(),balance:Number(h.balance||0)})).filter(h=>isAddress(h.address)&&h.balance>0).sort((a,b)=>b.balance-a.balance||a.address.localeCompare(b.address));
    if(!holders.length) throw new Error('No current holders found for this contract.');
    const supply=Number(info.totalSupply||holders.reduce((s,h)=>s+h.balance,0));
    snapshot={chain:selectedChain,chainName:CHAINS[selectedChain].name,chainId:CHAINS[selectedChain].chainId,contract,info,holders,supply,snapshotBlock:Number(data.snapshotBlock||0),fetchedAt:data.fetchedAt||new Date().toISOString()};
    $('snapCollection').textContent=`${info.name||'NFT Collection'}${info.symbol?` · ${info.symbol}`:''}`;
    $('snapNetwork').textContent=snapshot.chainName;
    $('snapBlock').textContent=snapshot.snapshotBlock?`#${fmt(snapshot.snapshotBlock)}`:'Pinned';
    $('snapHolders').textContent=fmt(holders.length);
    $('snapshot').hidden=false;
    distribution=null; $('results').hidden=true;
  }

  async function loadSnapshot(){
    const contract=$('contractInput').value.trim().toLowerCase();
    if(!isAddress(contract)){status('sourceStatus','Enter a valid ERC-721 contract address.','error');return;}
    setBusy(true); status('sourceStatus',`Reading ${CHAINS[selectedChain].name} at one pinned block…`);
    try{
      const data=await fetchJson(`/api/forge-holders?chain=${encodeURIComponent(selectedChain)}&contract=${encodeURIComponent(contract)}`);
      updateSnapshotCard(contract,data);
      status('sourceStatus',`Snapshot ready · ${fmt(snapshot.holders.length)} holders${snapshot.snapshotBlock?` · block #${fmt(snapshot.snapshotBlock)}`:''}.`,'ok');
      const u=new URL(location.href); u.searchParams.set('chain',selectedChain); u.searchParams.set('contract',contract); history.replaceState({},'',u); syncLinks();
    }catch(e){snapshot=null; $('snapshot').hidden=true; let m=e?.message||'Could not load snapshot.'; if(e?.name==='AbortError')m='Snapshot request timed out. Please retry.'; status('sourceStatus',m,'error');}
    finally{setBusy(false);}
  }

  function applyAccess(){
    const unlocked=access.genesis;
    document.querySelectorAll('.genesis-rule').forEach(field=>{field.classList.toggle('locked',!unlocked); field.querySelectorAll('input,select,textarea').forEach(el=>el.disabled=!unlocked);});
    if(!unlocked){$('minHold').value='1'; $('weightMode').value='equal'; $('cap').value='0'; $('exclude').value='';}
    $('lockNote').classList.toggle('show',!unlocked);
    $('copyBtn').textContent=unlocked?'COPY ALLOCATIONS':'🔒 COPY ALLOCATIONS';
    $('exportBtn').textContent=unlocked?'EXPORT DISTRIBUTION':'🔒 EXPORT DISTRIBUTION';
    $('cap').disabled=!unlocked||$('weightMode').value!=='nft';
    const card=$('accessCard'); card.classList.toggle('unlocked',unlocked);
    if(unlocked){$('accessTitle').textContent='GENESIS ACCESS ✓'; $('accessSub').textContent=`${fmt(access.balance)} TOTZ Genesis · operator tools unlocked`;}
    else if(access.checked){$('accessTitle').textContent='FREE MODE'; $('accessSub').textContent=`${short(access.wallet)} · core preview active`;}
    else {$('accessTitle').textContent='FREE MODE'; $('accessSub').textContent='Connect wallet to check access';}
  }

  async function checkAccess(wallet){
    access={checked:Boolean(wallet),genesis:false,wallet:wallet?String(wallet).toLowerCase():null,balance:0};
    if(!access.wallet){applyAccess();return;}
    try{
      const d=await fetchJson(`/api/forge-holders?chain=robinhood&mode=balance&contract=${GENESIS}&wallet=${encodeURIComponent(access.wallet)}`,18000);
      access.balance=Number(d.balance||0); access.genesis=access.balance>0;
    }catch(_){access.genesis=false;}
    applyAccess();
  }

  async function connectWallet(){
    if(!window.ethereum?.request){alert('No EVM browser wallet detected.');return;}
    const btn=$('connectBtn'); btn.disabled=true; btn.textContent='CONNECTING…';
    try{const accounts=await window.ethereum.request({method:'eth_requestAccounts'}); const wallet=accounts?.[0]||null; btn.textContent=wallet?short(wallet.toLowerCase()):'CONNECT WALLET'; await checkAccess(wallet);}catch(_){btn.textContent='CONNECT WALLET';}
    finally{btn.disabled=false;}
  }
  async function silentWallet(){
    if(!window.ethereum?.request){applyAccess();return;}
    try{const a=await window.ethereum.request({method:'eth_accounts'}); const w=a?.[0]||null; if(w)$('connectBtn').textContent=short(w.toLowerCase()); await checkAccess(w);}catch(_){applyAccess();}
  }

  function parseExclusions(text){
    const values=String(text||'').split(/[\s,;]+/).map(v=>v.trim().toLowerCase()).filter(Boolean); const valid=new Set(),invalid=[];
    values.forEach(v=>isAddress(v)?valid.add(v):invalid.push(v)); return {valid,invalid};
  }
  function parseUnits(value,decimals){
    const raw=String(value||'').trim(); if(!/^\d+(?:\.\d+)?$/.test(raw)) throw new Error('Enter a valid positive reward amount.');
    const [whole,f='']=raw.split('.'); if(f.length>decimals) throw new Error(`Reward amount has more than ${decimals} decimals.`);
    const u=BigInt(whole)*(10n**BigInt(decimals))+BigInt((f+'0'.repeat(decimals)).slice(0,decimals)||'0'); if(u<=0n) throw new Error('Reward pool must be greater than zero.'); return u;
  }
  function formatUnits(units,decimals,maxDecimals=6){
    const base=10n**BigInt(decimals); const whole=units/base; let frac=(units%base).toString().padStart(decimals,'0'); if(decimals>maxDecimals)frac=frac.slice(0,maxDecimals); frac=frac.replace(/0+$/,''); return frac?`${whole}.${frac}`:whole.toString();
  }
  async function hash(text){try{const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return '0x'+[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');}catch(_){return'unavailable';}}

  async function build(){
    distribution=null; $('results').hidden=true;
    if(!snapshot?.holders?.length){status('epochStatus','Load a collection snapshot first.','warn');return;}
    try{
      const unlocked=access.genesis;
      const decimals=Number($('decimals').value||6);
      const poolUnits=parseUnits($('pool').value,decimals);
      const symbol=String($('symbol').value||'TOKEN').trim().replace(/[^a-zA-Z0-9_$.-]/g,'').slice(0,16)||'TOKEN';
      const min=unlocked?Math.max(1,Math.floor(Number($('minHold').value||1))):1;
      const mode=unlocked?$('weightMode').value:'equal';
      const cap=unlocked&&mode==='nft'?Math.max(0,Math.floor(Number($('cap').value||0))):0;
      const ex=unlocked?parseExclusions($('exclude').value):{valid:new Set(),invalid:[]};
      if(ex.invalid.length) throw new Error(`Invalid exclusion address: ${ex.invalid[0]}`);
      const holders=snapshot.holders.filter(h=>h.balance>=min&&!ex.valid.has(h.address));
      if(!holders.length) throw new Error('No wallets match these epoch rules.');
      const weighted=holders.map(h=>({...h,weight:BigInt(mode==='nft'?(cap>0?Math.min(h.balance,cap):h.balance):1)}));
      const totalWeight=weighted.reduce((s,h)=>s+h.weight,0n);
      let allocated=0n;
      const rows=weighted.map(h=>{const product=poolUnits*h.weight;const units=product/totalWeight;const remainder=product%totalWeight;allocated+=units;return{...h,units,remainder};});
      let leftover=poolUnits-allocated;
      if(leftover>0n){const order=rows.map((r,i)=>({i,remainder:r.remainder})).sort((a,b)=>a.remainder===b.remainder?a.i-b.i:(a.remainder>b.remainder?-1:1)); for(let i=0;i<order.length&&leftover>0n;i++,leftover--)rows[order[i].i].units+=1n;}
      const canonical=[`chain=${snapshot.chain}`,`contract=${snapshot.contract}`,`block=${snapshot.snapshotBlock}`,`pool=${poolUnits}`,`decimals=${decimals}`,`symbol=${symbol}`,`min=${min}`,`mode=${mode}`,`cap=${cap}`,`exclude=${[...ex.valid].sort().join('|')}`,...rows.slice().sort((a,b)=>a.address.localeCompare(b.address)).map(r=>`${r.address}:${r.balance}:${r.weight}:${r.units}`)].join('\n');
      const fingerprint=await hash(canonical);
      distribution={rows,poolUnits,decimals,symbol,min,mode,cap,exclusions:ex.valid,totalWeight,fingerprint,createdAt:new Date().toISOString(),source:snapshot};
      $('eligible').textContent=fmt(rows.length); $('excluded').textContent=fmt(ex.valid.size); $('totalWeight').textContent=totalWeight.toString(); $('average').textContent=`${formatUnits(poolUnits/BigInt(rows.length),decimals,Math.min(6,decimals))} ${symbol}`; $('exactPool').textContent=`${formatUnits(poolUnits,decimals,Math.min(6,decimals))} ${symbol}`; $('fingerprint').textContent=fingerprint; $('fingerprint').title=fingerprint;
      const preview=rows.slice(0,100); $('rows').innerHTML=preview.map((r,i)=>{const share=Number((r.units*1000000n)/poolUnits)/10000;return`<tr><td>${i+1}</td><td class="wallet">${r.address}</td><td>${fmt(r.balance)}</td><td>${r.weight}</td><td>${share.toFixed(4)}%</td><td><span class="allocation">${formatUnits(r.units,decimals,Math.min(6,decimals))} ${symbol}</span></td></tr>`;}).join('')+(rows.length>100?`<tr><td colspan="6" style="text-align:center;color:var(--soft);font-weight:800">Showing first 100 of ${fmt(rows.length)} wallets. Copy/export includes all.</td></tr>`:'');
      $('results').hidden=false; status('epochStatus',`Distribution built · ${fmt(rows.length)} eligible wallets · exact pool preserved.`,'ok');
    }catch(e){status('epochStatus',e?.message||'Could not build distribution.','error');}
  }

  function requireGenesis(){if(access.genesis)return true;toast('TOTZ Genesis unlocks copy/export and advanced epoch rules.');$('accessCard').scrollIntoView({behavior:'smooth',block:'center'});return false;}
  async function copyAllocations(){
    if(!requireGenesis()||!distribution)return;
    const text=distribution.rows.map(r=>`${r.address},${formatUnits(r.units,distribution.decimals,distribution.decimals)}`).join('\n');
    try{await navigator.clipboard.writeText(text);}catch(_){const a=document.createElement('textarea');a.value=text;a.style.position='fixed';a.style.opacity='0';document.body.appendChild(a);a.select();document.execCommand('copy');a.remove();}
    toast(`Copied ${fmt(distribution.rows.length)} allocations`);
  }
  const csvCell=(v)=>`"${String(v??'').replace(/"/g,'""')}"`;
  function exportDistribution(){
    if(!requireGenesis()||!distribution)return;
    const d=distribution,s=d.source;
    const rows=[['TOTZ FORGE EPOCH DISTRIBUTION',''],['Collection',s.info?.name||'NFT Collection'],['Symbol',s.info?.symbol||''],['Network',s.chainName],['Chain ID',s.chainId],['Contract',s.contract],['Snapshot Block',s.snapshotBlock||''],['Snapshot UTC',s.fetchedAt],['Reward Pool',formatUnits(d.poolUnits,d.decimals,d.decimals)],['Reward Symbol',d.symbol],['Reward Decimals',d.decimals],['Minimum NFTs',d.min],['Weighting',d.mode==='nft'?'NFT-weighted':'Equal per wallet'],['NFT Weight Cap',d.cap||'None'],['Excluded Wallets',d.exclusions.size],['Eligible Wallets',d.rows.length],['Distribution Fingerprint',d.fingerprint],['Created UTC',d.createdAt],[],['Rank','Wallet','NFTs Held','Weight','Allocation Units','Allocation']];
    d.rows.forEach((r,i)=>rows.push([i+1,r.address,r.balance,r.weight.toString(),r.units.toString(),formatUnits(r.units,d.decimals,d.decimals)]));
    const csv='\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n'); const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}); const link=document.createElement('a'); link.href=URL.createObjectURL(blob); const slug=(s.info?.symbol||s.info?.name||'collection').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); link.download=`forge-epoch-${slug||'collection'}-${s.snapshotBlock||'snapshot'}.csv`; document.body.appendChild(link); link.click(); const href=link.href; link.remove(); setTimeout(()=>URL.revokeObjectURL(href),1000); toast(`Exported ${fmt(d.rows.length)} allocations`);
  }

  document.querySelectorAll('.network-btn').forEach(b=>b.addEventListener('click',()=>setNetwork(b.dataset.chain)));
  $('loadBtn').addEventListener('click',loadSnapshot); $('contractInput').addEventListener('keydown',e=>{if(e.key==='Enter')loadSnapshot();}); $('contractInput').addEventListener('input',syncLinks);
  $('connectBtn').addEventListener('click',connectWallet); $('buildBtn').addEventListener('click',build); $('copyBtn').addEventListener('click',copyAllocations); $('exportBtn').addEventListener('click',exportDistribution); $('weightMode').addEventListener('change',applyAccess);
  if(window.ethereum?.on)window.ethereum.on('accountsChanged',a=>checkAccess(a?.[0]||null));

  const p=new URLSearchParams(location.search); const chain=p.get('chain'); const contract=p.get('contract'); if(CHAINS[chain])setNetwork(chain,{updateUrl:false}); else setNetwork('robinhood',{updateUrl:false}); if(isAddress(contract)){$('contractInput').value=contract.toLowerCase(); syncLinks(); setTimeout(loadSnapshot,120);} else syncLinks();
  silentWallet();
})();
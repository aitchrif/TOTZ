(() => {
  const $ = id => document.getElementById(id);
  const TEST_SOURCE = '0x0000000000000000000000000000000000000001';
  const DECIMALS = 2;
  const SYMBOL = 'tUSDG';

  const isAddress = v => /^0x[a-fA-F0-9]{40}$/.test(String(v || ''));
  const short = a => a ? `${a.slice(0,6)}…${a.slice(-4)}` : '—';
  const formatUnits = units => ethers.formatUnits(BigInt(units), DECIMALS);
  const compareHex = (a,b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0;
  const pairHash = (a,b) => {
    const ordered = compareHex(a,b) <= 0 ? [a,b] : [b,a];
    return ethers.keccak256(ethers.concat(ordered));
  };
  const claimLeaf = (address, units) => {
    const inner = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address','uint256'],[ethers.getAddress(address),BigInt(units)]));
    return ethers.keccak256(inner);
  };
  async function sha256(text){
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return '0x' + [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  function makeMerkle(entries){
    const leaves = entries.map(e=>claimLeaf(e.address,e.units));
    const layers = [leaves];
    while(layers[layers.length-1].length > 1){
      const prev = layers[layers.length-1], next = [];
      for(let i=0;i<prev.length;i+=2) next.push(i+1<prev.length ? pairHash(prev[i],prev[i+1]) : prev[i]);
      layers.push(next);
    }
    const root = layers[layers.length-1][0];
    const claims = entries.map((e,index)=>{
      let idx=index; const proof=[];
      for(let level=0;level<layers.length-1;level++){
        const layer=layers[level], sib=idx%2===0?idx+1:idx-1;
        if(sib<layer.length) proof.push(layer[sib]);
        idx=Math.floor(idx/2);
      }
      return {...e,leaf:leaves[index],proof};
    });
    return {root,claims};
  }

  function setStatus(message,type='warn'){
    const el=$('quickTestStatus'); if(!el)return;
    el.textContent=message; el.className=`status show ${type}`;
  }

  function parseWallets(){
    const raw = String($('quickTestWallets')?.value || '');
    const values = raw.split(/[\s,;]+/).map(v=>v.trim().toLowerCase()).filter(Boolean);
    const unique=[]; const seen=new Set();
    for(const v of values){
      if(!isAddress(v)) throw new Error(`Invalid wallet: ${v}`);
      if(!seen.has(v)){seen.add(v);unique.push(v);}
    }
    if(unique.length<2) throw new Error('Paste at least 2 different wallet addresses. 3 is ideal for the full test.');
    if(unique.length>5) throw new Error('Quick Test supports up to 5 wallets.');
    return unique;
  }

  async function addConnected(){
    try{
      if(!window.ethereum?.request) throw new Error('No EVM wallet detected.');
      const accounts=await window.ethereum.request({method:'eth_requestAccounts'});
      const a=accounts?.[0]; if(!a) throw new Error('No connected wallet.');
      const existing=String($('quickTestWallets').value||'').trim();
      const vals=existing.split(/[\s,;]+/).map(v=>v.toLowerCase()).filter(Boolean);
      if(!vals.includes(a.toLowerCase())) $('quickTestWallets').value=(existing?existing+'\n':'')+a.toLowerCase();
      setStatus(`Added connected wallet ${short(a)}. Switch MetaMask accounts and press again to add another.`, 'ok');
    }catch(e){setStatus(e?.message||'Could not add wallet.','error');}
  }

  async function buildQuickPackage(){
    const btn=$('buildQuickTestBtn'); if(btn)btn.disabled=true;
    try{
      if(!window.ethers) throw new Error('Ethereum library did not load. Refresh and retry.');
      const wallets=parseWallets();
      const assigned=wallets.map((address,i)=>({address,units:BigInt((i+1)*10)*(10n**BigInt(DECIMALS))}));
      const entries=assigned.slice().sort((a,b)=>a.address.localeCompare(b.address));
      const tree=makeMerkle(entries);
      const claims={};
      tree.claims.forEach(c=>{claims[c.address]={amountUnits:c.units.toString(),amount:formatUnits(c.units),leaf:c.leaf,proof:c.proof};});
      const totalUnits=entries.reduce((s,e)=>s+e.units,0n);
      const canonical=entries.map(e=>`${e.address}:${e.units}`).join('\n');
      const fingerprint=await sha256(`FORGE_QUICK_TEST_V1\n${canonical}`);
      const now=new Date().toISOString();
      const pkg={
        format:'TOTZ_FORGE_MERKLE_V1',
        leafEncoding:'keccak256(bytes.concat(keccak256(abi.encode(address,uint256))))',
        pairHashing:'sorted-keccak256',
        root:tree.root,
        network:{name:'Robinhood Chain Testnet',chainId:46630,key:'robinhood-testnet'},
        source:{contract:TEST_SOURCE,collection:'FORGE QUICK TEST',snapshotBlock:0,snapshotUTC:now},
        reward:{symbol:SYMBOL,decimals:DECIMALS,totalUnits:totalUnits.toString(),total:formatUnits(totalUnits)},
        eligibleWallets:entries.length,
        distributionFingerprint:fingerprint,
        createdUTC:now,
        quickTest:true,
        claims
      };

      const text=JSON.stringify(pkg,null,2);
      const file=new File([text],`forge-quick-test-${entries.length}-wallets.json`,{type:'application/json'});
      const dt=new DataTransfer(); dt.items.add(file);
      const input=$('fileInput');
      input.files=dt.files;
      input.dispatchEvent(new Event('change',{bubbles:true}));

      const deadline=$('deadlineInput');
      if(deadline){const d=new Date(Date.now()+10*60*1000);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());deadline.value=d.toISOString().slice(0,16);deadline.dispatchEvent(new Event('input',{bubbles:true}));}

      const pattern=assigned.map((e,i)=>`W${i+1}=${formatUnits(e.units)}`).join(' · ');
      setStatus(`Loaded ${entries.length}-wallet TEST package · ${formatUnits(totalUnits)} ${SYMBOL} total · ${pattern} · 10-minute deadline set.`, 'ok');
      document.querySelector('.card.blue')?.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){setStatus(e?.message||'Could not build test package.','error');}
    finally{if(btn)btn.disabled=false;}
  }

  function install(){
    const first=document.querySelector('main.grid > .card.blue');
    if(!first || $('quickTestCard'))return;
    const card=document.createElement('section');
    card.id='quickTestCard'; card.className='card';
    card.style.border='2px solid var(--lime)';
    card.innerHTML=`
      <div class="head"><div><h2>🧪 Quick multi-wallet test</h2><p>Testnet-only helper. Paste 2–5 MetaMask account addresses; no NFT eligibility is required. FORGE creates a mini Merkle package locally and loads it into Review.</p></div><span class="tag test">TEST ONLY</span></div>
      <div class="formgrid">
        <div class="field full"><label>Test wallet addresses · one per line</label><textarea id="quickTestWallets" rows="5" placeholder="0x wallet 1…\n0x wallet 2…\n0x wallet 3…" style="width:100%;border:2px solid var(--sky2);border-radius:15px;background:var(--cream);padding:11px 12px;color:var(--ink);font:inherit;font-weight:800;outline:none;resize:vertical"></textarea></div>
      </div>
      <div style="margin-top:10px;padding:11px 13px;border-radius:14px;background:var(--cream);font-size:.72rem;font-weight:900">Automatic allocations: wallet 1 = 10 tUSDG · wallet 2 = 20 tUSDG · wallet 3 = 30 tUSDG. A 10-minute claim deadline is set so recovery can be tested quickly.</div>
      <div class="actions"><button id="addConnectedTestWalletBtn" class="btn soft" type="button">ADD CONNECTED WALLET</button><button id="buildQuickTestBtn" class="btn good" type="button">BUILD & LOAD TEST PACKAGE</button></div>
      <div id="quickTestStatus" class="status show warn">Best test: add 3 of your MetaMask accounts. Claim with two and leave one unclaimed for the deadline/recovery test.</div>`;
    first.parentElement.insertBefore(card,first);
    $('addConnectedTestWalletBtn').addEventListener('click',addConnected);
    $('buildQuickTestBtn').addEventListener('click',buildQuickPackage);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();

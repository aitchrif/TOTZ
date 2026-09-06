(() => {
  const RUNTIME=window.TOTZ_FORGE_CONFIG||{};
  const INDEX=RUNTIME.services?.epochIndex||'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/forge-epoch-index';
  const TESTNET=RUNTIME.claimNetwork||{chainId:46630,rpc:'https://rpc.testnet.chain.robinhood.com',explorer:'https://explorer.testnet.chain.robinhood.com'};
  const ABI=[
    'function token() view returns (address)',
    'function sponsor() view returns (address)',
    'function merkleRoot() view returns (bytes32)',
    'function totalAllocated() view returns (uint256)',
    'function deadline() view returns (uint64)',
    'function totalClaimed() view returns (uint256)',
    'function claimCount() view returns (uint256)',
    'function contractBalance() view returns (uint256)'
  ];
  const $=id=>document.getElementById(id);
  const short=a=>a?`${a.slice(0,6)}…${a.slice(-4)}`:'—';
  const fmt=n=>Number(n||0).toLocaleString();
  const isAddr=v=>/^0x[a-fA-F0-9]{40}$/.test(String(v||''));
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let wallet=null, epochs=[], filter='all', loading=false;
  const provider=window.ForgeRuntime?.createReadProvider?window.ForgeRuntime.createReadProvider():new ethers.JsonRpcProvider(TESTNET.rpc,TESTNET.chainId,{staticNetwork:true});

  function toast(m){const e=$('toast');e.textContent=m;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),1900);}
  function status(m,type=''){const e=$('loadStatus');e.textContent=m;e.className=`status show ${type}`;}
  function clearStatus(){$('loadStatus').className='status';$('loadStatus').textContent='';}
  function units(v,d){try{return ethers.formatUnits(BigInt(v||0),Number(d||0));}catch{return String(v||0)}}
  function date(v){try{return new Date(v).toLocaleString();}catch{return String(v||'—')}}
  function claimUrl(e){return `${location.origin}/forge-claim?slug=${encodeURIComponent(e.slug)}`;}

  async function ensureWallet(request=true){
    if(!window.ethereum?.request) throw new Error('No EVM browser wallet detected.');
    const a=await window.ethereum.request({method:request?'eth_requestAccounts':'eth_accounts'});
    wallet=a?.[0]?String(a[0]).toLowerCase():null;
    $('connectBtn').textContent=wallet?short(wallet):'CONNECT WALLET';
    $('walletLabel').textContent=wallet||'Not connected';
    $('walletSub').textContent=wallet?'Sponsor wallet connected · read-only session':'Connect to load your published epochs';
    return wallet;
  }

  async function fetchIndex(){
    const r=await fetch(`${INDEX}?creator=${encodeURIComponent(wallet)}&limit=100`,{cache:'no-store'});
    const d=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d.error||`Epoch index failed (${r.status}).`);
    return Array.isArray(d.epochs)?d.epochs:[];
  }

  async function withRetry(fn,tries=3){
    let last;
    for(let i=0;i<tries;i++){
      try{return await fn();}catch(e){last=e;if(i<tries-1)await sleep(350*(i+1));}
    }
    throw last;
  }

  async function inspect(e){
    if(Number(e.claim_chain_id)!==TESTNET.chainId) return {...e,view:{state:'attention',label:'UNSUPPORTED CHAIN',note:`Claim chain ${e.claim_chain_id} is not enabled in this dashboard yet.`,valid:false}};
    if(!isAddr(e.claim_contract)) return {...e,view:{state:'attention',label:'INVALID CONTRACT',note:'Published claim contract address is invalid.',valid:false}};
    try{
      const c=new ethers.Contract(e.claim_contract,ABI,provider);
      const [token,sponsor,root,total,deadline,totalClaimed,claimCount,balance]=await withRetry(()=>Promise.all([
        c.token(),c.sponsor(),c.merkleRoot(),c.totalAllocated(),c.deadline(),c.totalClaimed(),c.claimCount(),c.contractBalance()
      ]));
      const totalBI=BigInt(total), claimedBI=BigInt(totalClaimed), balBI=BigInt(balance), deadlineN=Number(deadline);
      const valid=String(token).toLowerCase()===String(e.reward_token).toLowerCase() && String(sponsor).toLowerCase()===String(e.creator_wallet).toLowerCase() && String(root).toLowerCase()===String(e.merkle_root).toLowerCase() && totalBI===BigInt(e.total_allocated_units) && deadlineN===Math.floor(new Date(e.deadline).getTime()/1000);
      const ended=Date.now()/1000>deadlineN;
      const fullyClaimed=claimedBI>=totalBI;
      const remainingObligation=totalBI>claimedBI?totalBI-claimedBI:0n;
      const solvent=balBI>=remainingObligation;
      let state='live',label='LIVE',note='Epoch open · contract is solvent for remaining claims.';
      if(!valid){state='attention';label='MISMATCH';note='Published metadata does not match the on-chain contract.';}
      else if(!ended && !solvent){state='attention';label='UNDERFUNDED';note='Contract balance is below the remaining claim obligation.';}
      else if(ended && fullyClaimed){state='closed';label='FULLY CLAIMED';note='Epoch closed · every allocated token was claimed.';}
      else if(ended && balBI===0n){state='closed';label='SETTLED';note='Epoch closed · no tokens remain in the claim contract.';}
      else if(ended && balBI>0n){state='recovery';label='RECOVERY READY';note='Deadline passed · unclaimed tokens can be recovered by the sponsor.';}
      const pct=totalBI>0n?Number((claimedBI*10000n)/totalBI)/100:0;
      return {...e,view:{state,label,note,valid,token:String(token).toLowerCase(),sponsor:String(sponsor).toLowerCase(),root:String(root).toLowerCase(),total:totalBI,claimed:claimedBI,balance:balBI,claimCount:Number(claimCount),deadline:deadlineN,pct,solvent}};
    }catch(err){
      return {...e,view:{state:'attention',label:'RPC ERROR',note:err?.shortMessage||err?.message||'Could not read this claim contract.',valid:false}};
    }
  }

  async function inspectAll(list){
    const out=[];
    for(let i=0;i<list.length;i+=6){
      const part=await Promise.all(list.slice(i,i+6).map(inspect));
      out.push(...part);
      if(i+6<list.length)await sleep(120);
    }
    return out;
  }

  function stateCount(s){return epochs.filter(e=>e.view?.state===s).length;}
  function renderSummary(){
    $('summary').hidden=false;$('toolbar').hidden=false;
    $('sumTotal').textContent=fmt(epochs.length);
    $('sumLive').textContent=fmt(stateCount('live'));
    $('sumRecovery').textContent=fmt(stateCount('recovery'));
    $('sumClosed').textContent=fmt(stateCount('closed'));
  }

  function card(e){
    const v=e.view||{};
    const show=filter==='all'||v.state===filter||(filter==='attention'&&v.state==='attention');
    if(!show)return '';
    const rewardTotal=units(e.total_allocated_units,e.reward_decimals);
    const claimed=v.claimed!=null?units(v.claimed,e.reward_decimals):'—';
    const remaining=v.balance!=null?units(v.balance,e.reward_decimals):'—';
    const claims=v.claimCount!=null?`${fmt(v.claimCount)} / ${fmt(e.eligible_wallets)}`:'—';
    const cls=v.state==='attention'?'epoch mismatch':'epoch';
    const tagCls=v.state==='attention'?'tag bad':`tag ${v.state||''}`;
    const published=e.published_at?date(e.published_at):'—';
    return `<article class="${cls}" data-state="${esc(v.state||'attention')}">
      <div class="epoch-top"><div class="epoch-title"><h3>${esc(e.source_collection||'FORGE Reward Epoch')}</h3><p>${esc(e.reward_symbol)} · source ${esc(e.source_chain||'on-chain')} snapshot${e.snapshot_block?` #${fmt(e.snapshot_block)}`:''} · published ${esc(published)}</p></div><span class="${tagCls}">${esc(v.label||'CHECKING')}</span></div>
      <div class="epoch-grid">
        <div class="mini"><small>Reward pool</small><b>${esc(rewardTotal)} ${esc(e.reward_symbol)}</b></div>
        <div class="mini"><small>Total claimed</small><b>${esc(claimed)} ${esc(e.reward_symbol)}</b></div>
        <div class="mini"><small>Contract balance</small><b>${esc(remaining)} ${esc(e.reward_symbol)}</b></div>
        <div class="mini"><small>Claimed wallets</small><b>${esc(claims)}</b></div>
        <div class="mini"><small>Deadline</small><b>${esc(date(e.deadline))}</b></div>
        <div class="mini"><small>Claim contract</small><code>${esc(short(e.claim_contract))}</code></div>
      </div>
      <div class="progress-shell"><div class="progress" style="width:${Math.max(0,Math.min(100,Number(v.pct||0)))}%"></div></div>
      <div class="epoch-note"><span>${esc(v.note||'Reading on-chain state…')}</span><span>${Number(v.pct||0).toFixed(2)}% of pool claimed</span></div>
      <div class="actions">
        <a class="btn dark" href="/forge-claim?slug=${encodeURIComponent(e.slug)}">OPEN CLAIM</a>
        <a class="btn ghost" href="${TESTNET.explorer}/address/${encodeURIComponent(e.claim_contract)}" target="_blank" rel="noopener">CONTRACT ↗</a>
        <button class="btn soft copy-link" data-url="${esc(claimUrl(e))}" type="button">COPY CLAIM LINK</button>
        ${v.state==='recovery'?`<a class="btn good" href="/forge-claim?slug=${encodeURIComponent(e.slug)}#sponsor">RECOVER FUNDS →</a>`:''}
      </div>
    </article>`;
  }

  function render(){
    renderSummary();
    const html=epochs.map(card).join('');
    $('epochs').innerHTML=html;
    const any=Boolean(html);
    $('empty').classList.toggle('show',epochs.length===0);
    if(epochs.length>0&&!any) status('No epochs match this filter.','warn'); else clearStatus();
  }

  async function loadEpochs(){
    if(!wallet||loading)return;
    loading=true;$('refreshBtn').disabled=true;$('empty').classList.remove('show');$('epochs').innerHTML='';$('summary').hidden=true;$('toolbar').hidden=true;
    status('Loading published epochs for this sponsor wallet…');
    try{
      const indexed=await fetchIndex();
      if(!indexed.length){epochs=[];renderSummary();$('toolbar').hidden=false;$('empty').classList.add('show');status('No published epochs found for this sponsor wallet.','ok');return;}
      status(`Found ${fmt(indexed.length)} published epoch${indexed.length===1?'':'s'}. Verifying live contract state…`);
      epochs=await inspectAll(indexed);
      render();
      const bad=stateCount('attention');
      status(bad?`${fmt(epochs.length)} epochs loaded · ${fmt(bad)} need attention.`:`${fmt(epochs.length)} epochs loaded and checked directly on-chain.`,bad?'warn':'ok');
    }catch(e){epochs=[];$('empty').classList.add('show');status(e?.message||'Could not load epochs.','error');}
    finally{loading=false;$('refreshBtn').disabled=false;}
  }

  $('connectBtn').addEventListener('click',async()=>{try{await ensureWallet(true);if(wallet)await loadEpochs();}catch(e){status(e?.message||'Wallet connection failed.','error');}});
  $('refreshBtn').addEventListener('click',loadEpochs);
  document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');filter=b.dataset.filter||'all';render();}));
  $('epochs').addEventListener('click',async e=>{const b=e.target.closest('.copy-link');if(!b)return;try{await navigator.clipboard.writeText(b.dataset.url||'');toast('Claim link copied');}catch{toast('Could not copy link');}});
  if(window.ethereum?.on)window.ethereum.on('accountsChanged',async a=>{wallet=a?.[0]?String(a[0]).toLowerCase():null;$('connectBtn').textContent=wallet?short(wallet):'CONNECT WALLET';$('walletLabel').textContent=wallet||'Not connected';$('walletSub').textContent=wallet?'Sponsor wallet connected · read-only session':'Connect to load your published epochs';epochs=[];$('epochs').innerHTML='';$('summary').hidden=true;$('toolbar').hidden=true;$('empty').classList.remove('show');if(wallet)await loadEpochs();else status('Connect the sponsor wallet used to launch your epochs.','warn');});

  (async()=>{try{await ensureWallet(false);if(wallet)await loadEpochs();else status('Connect the sponsor wallet used to launch your epochs. No signature is required.','warn');}catch(e){status(e?.message||'Connect a wallet to begin.','warn');}})();
})();
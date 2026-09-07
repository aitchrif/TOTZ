(() => {
  const RUNTIME=window.TOTZ_FORGE_CONFIG||{};
  const FALLBACK=RUNTIME.claimNetwork||{chainId:46630,hex:'0xb626',name:'Robinhood Chain Testnet',rpc:'https://rpc.testnet.chain.robinhood.com',explorer:'https://explorer.testnet.chain.robinhood.com',environment:'testnet'};
  const SERVICE=RUNTIME.services?.claims||'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/forge-claims';
  const CLAIM_ABI=[
    'function token() view returns (address)','function sponsor() view returns (address)','function merkleRoot() view returns (bytes32)','function totalAllocated() view returns (uint256)','function deadline() view returns (uint64)','function totalClaimed() view returns (uint256)','function claimCount() view returns (uint256)','function claimed(address) view returns (bool)','function contractBalance() view returns (uint256)','function isFullyFunded() view returns (bool)','function claim(uint256,bytes32[])','function recoverUnclaimed()'
  ];
  const $=id=>document.getElementById(id);
  const short=a=>a?`${a.slice(0,6)}…${a.slice(-4)}`:'—';
  const fmt=n=>Number(n||0).toLocaleString();
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  let epoch=null,wallet=null,claimData=null,chainState=null,network=null;

  function status(id,m,type=''){const e=$(id);if(!e)return;e.textContent=m;e.className=`status show ${type}`;}
  function clearStatus(id){const e=$(id);if(!e)return;e.textContent='';e.className='status';}
  function formatUnits(v,d){try{return ethers.formatUnits(BigInt(v),d);}catch{return String(v)}}
  function formatEth(v){try{const n=Number(ethers.formatEther(BigInt(v)));if(!Number.isFinite(n))return ethers.formatEther(BigInt(v));return n<0.001?n.toFixed(6):n.toFixed(5).replace(/0+$/,'').replace(/\.$/,'');}catch{return String(v)}}
  async function getJson(url){const r=await fetch(url,{cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Request failed (${r.status})`);return d;}

  function resolveNetwork(chainId){
    if(window.ForgeRuntime?.resolveClaimNetwork)return window.ForgeRuntime.resolveClaimNetwork(Number(chainId));
    return Number(chainId)===Number(FALLBACK.chainId)?FALLBACK:null;
  }
  function interactionEnabled(){
    if(!network)return false;
    if(window.ForgeRuntime?.canInteractWithPublishedClaim)return window.ForgeRuntime.canInteractWithPublishedClaim(network);
    return Boolean(resolveNetwork(network.chainId));
  }
  function updateNetworkControls(){
    const b=$('switchBtn');
    if(!b||!network)return;
    b.textContent=network.environment==='mainnet'?'SWITCH TO MAINNET':'SWITCH TO TESTNET';
    b.disabled=!interactionEnabled();
  }

  async function ensureWallet(request=true){
    if(!window.ethereum?.request)throw new Error('No EVM browser wallet detected.');
    const a=await window.ethereum.request({method:request?'eth_requestAccounts':'eth_accounts'});
    wallet=a?.[0]?String(a[0]).toLowerCase():null;
    $('connectBtn').textContent=wallet?short(wallet):'CONNECT WALLET';
    return wallet;
  }

  async function assertWalletNetwork(){
    if(!window.ethereum?.request||!network)throw new Error('Wallet network is unavailable.');
    const activeHex=await window.ethereum.request({method:'eth_chainId'});
    const active=Number.parseInt(String(activeHex),16);
    if(active!==Number(network.chainId))throw new Error(`Wallet is on chain ${active}. Switch to ${network.name} (${network.chainId}) before signing.`);
    return active;
  }

  async function switchClaimNetwork(){
    if(!network||!interactionEnabled())throw new Error('Claim network is not available.');
    await ensureWallet(true);
    if(window.ForgeRuntime?.ensureClaimNetwork){
      // Published epochs are independent from the new-launch release gate.
      await window.ForgeRuntime.ensureClaimNetwork({requestAccounts:false,network,requireExecution:false});
      await assertWalletNetwork();
      return;
    }
    try{await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:network.hex}]});}
    catch(e){
      if(e?.code===4902||String(e?.message||'').toLowerCase().includes('unrecognized')){
        await window.ethereum.request({method:'wallet_addEthereumChain',params:[{chainId:network.hex,chainName:network.name,nativeCurrency:network.nativeCurrency||{name:'ETH',symbol:'ETH',decimals:18},rpcUrls:[network.rpc],blockExplorerUrls:[network.explorer]}]});
      }else throw e;
    }
    await assertWalletNetwork();
  }

  async function api(walletAddr=null){
    const p=new URLSearchParams({route:'get',slug:new URLSearchParams(location.search).get('slug')||''});
    if(walletAddr)p.set('wallet',walletAddr);
    return getJson(`${SERVICE}?${p}`);
  }
  function readProvider(){
    if(!network)throw new Error('Claim network is not available.');
    return window.ForgeRuntime?.createReadProvider?window.ForgeRuntime.createReadProvider(network):new ethers.JsonRpcProvider(network.rpc,network.chainId,{staticNetwork:true});
  }

  async function readOnChain(providerOverride=null){
    if(!epoch||!network)return false;
    const provider=providerOverride||readProvider();
    const c=new ethers.Contract(epoch.claim_contract,CLAIM_ABI,provider);
    const [root,token,total,deadline,sponsor,totalClaimed,claimCount,balance,full]=await Promise.all([c.merkleRoot(),c.token(),c.totalAllocated(),c.deadline(),c.sponsor(),c.totalClaimed(),c.claimCount(),c.contractBalance(),c.isFullyFunded()]);
    const ok=String(root).toLowerCase()===String(epoch.merkle_root).toLowerCase()&&String(token).toLowerCase()===String(epoch.reward_token).toLowerCase()&&BigInt(total)===BigInt(epoch.total_allocated_units)&&Number(deadline)===Math.floor(new Date(epoch.deadline).getTime()/1000)&&String(sponsor).toLowerCase()===String(epoch.creator_wallet).toLowerCase();
    const totalBI=BigInt(total),claimedBI=BigInt(totalClaimed),balanceBI=BigInt(balance),ended=Date.now()/1000>Number(deadline),fullyClaimed=claimedBI>=totalBI,settled=ended&&balanceBI===0n;
    chainState={provider,c,root,token,total:totalBI,deadline:Number(deadline),sponsor:String(sponsor).toLowerCase(),totalClaimed:claimedBI,claimCount:Number(claimCount),balance:balanceBI,full:Boolean(full),ok,ended,fullyClaimed,settled};
    let fundingLabel='UNDERFUNDED',epochLabel=ended?'ENDED':'OPEN',healthMessage='funding incomplete',healthType='warn';
    if(!ended&&full){fundingLabel='SOLVENT ✓';healthMessage='solvent for all remaining claims';healthType='ok';}
    else if(ended&&fullyClaimed){fundingLabel='FULLY CLAIMED ✓';epochLabel='CLOSED';healthMessage='epoch closed · all rewards claimed';healthType='ok';}
    else if(ended&&settled){fundingLabel='SETTLED ✓';epochLabel='CLOSED';healthMessage='epoch closed · unclaimed funds returned to sponsor';healthType='ok';}
    else if(ended&&balanceBI>0n){fundingLabel='RECOVERY READY';healthMessage='epoch ended · unclaimed funds ready for sponsor recovery';healthType='ok';}
    $('claimCount').textContent=fmt(claimCount);
    $('progress').style.width=`${Math.min(100,(Number(claimCount)/Math.max(1,Number(epoch.eligible_wallets)))*100)}%`;
    $('totalClaimed').textContent=`${formatUnits(totalClaimed,epoch.reward_decimals)} ${epoch.reward_symbol}`;
    $('remaining').textContent=`${formatUnits(balance,epoch.reward_decimals)} ${epoch.reward_symbol}`;
    $('funding').textContent=fundingLabel;
    $('epochState').textContent=epochLabel;
    $('statusTag').textContent=ok?'VERIFIED':'MISMATCH';
    $('statusTag').className=`tag ${ok?'good':'bad'}`;
    if(!ok){status('loadStatus','On-chain contract parameters do not match the published claim metadata. Claiming is disabled.','error');$('claimBtn').disabled=true;return false;}
    status('loadStatus',`On-chain contract verified on ${network.name} · ${healthMessage}.`,healthType);
    return true;
  }

  async function estimateClaimGas(){
    clearStatus('gasStatus');
    if(!epoch||!network||!wallet||!claimData||!chainState?.ok||chainState.ended||!interactionEnabled())return null;
    try{
      const provider=chainState?.provider||readProvider();
      const iface=new ethers.Interface(CLAIM_ABI);
      const data=iface.encodeFunctionData('claim',[BigInt(claimData.amount_units),claimData.proof]);
      const [gasLimit,feeData,balance]=await Promise.all([
        provider.estimateGas({from:wallet,to:epoch.claim_contract,data}),
        provider.getFeeData(),
        provider.getBalance(wallet),
      ]);
      const gasPrice=feeData?.maxFeePerGas??feeData?.gasPrice??null;
      if(gasPrice===null){
        status('gasStatus',`Live claim estimate: ~${fmt(gasLimit)} gas. Your wallet will show the final network fee before signing.`,'ok');
        return {gasLimit,balance,gasPrice:null,estimatedWei:null};
      }
      const estimatedWei=BigInt(gasLimit)*BigInt(gasPrice);
      const gwei=Number(ethers.formatUnits(gasPrice,'gwei'));
      let type='ok';
      let note='Wallet quote can differ slightly.';
      if(BigInt(balance)<estimatedWei){type='error';note='This wallet does not currently have enough native ETH for the estimate.';}
      else if(BigInt(balance)<estimatedWei*2n){type='warn';note='Native ETH margin is low; keep extra gas before signing.';}
      else if(BigInt(gasPrice)>=1_000_000_000n){type='warn';note='Network gas is elevated right now; waiting can reduce the fee.';}
      status('gasStatus',`Estimated network fee: ~${formatEth(estimatedWei)} ETH · ${fmt(gasLimit)} gas · ${Number.isFinite(gwei)?gwei.toFixed(3):'—'} gwei. ${note}`,type);
      return {gasLimit,balance,gasPrice,estimatedWei};
    }catch(e){
      status('gasStatus','Live gas estimate is temporarily unavailable. Your wallet will still show the exact fee before you approve the claim.','warn');
      return null;
    }
  }

  async function refreshAfterTransaction(provider,predicate){
    for(let attempt=0;attempt<5;attempt++){
      await readOnChain(provider);
      if(wallet)await checkWallet();
      if(!predicate||predicate(chainState))return true;
      await sleep(300*(attempt+1));
    }
    return false;
  }

  async function waitForClaimConfirmation(txHash,addr,timeoutMs=90000){
    const provider=readProvider();
    const c=new ethers.Contract(epoch.claim_contract,CLAIM_ABI,provider);
    const started=Date.now();
    while(Date.now()-started<timeoutMs){
      try{
        const receipt=await provider.getTransactionReceipt(txHash);
        if(receipt){
          if(Number(receipt.status)===0)throw new Error('Claim transaction reverted on-chain.');
          return {hash:txHash,receipt,stateConfirmed:true};
        }
      }catch(e){
        if(String(e?.message||'').includes('reverted on-chain'))throw e;
      }
      try{if(await c.claimed(addr))return {hash:txHash,receipt:null,stateConfirmed:true};}catch(_){ }
      await sleep(1000);
    }
    return {hash:txHash,receipt:null,stateConfirmed:false,pending:true};
  }

  async function load(){
    const slug=new URLSearchParams(location.search).get('slug');
    if(!slug){status('loadStatus','Missing claim slug.','error');return;}
    try{
      const d=await api();
      epoch=d.epoch;
      if(!epoch)throw new Error('Claim not found.');
      network=resolveNetwork(epoch.claim_chain_id);
      if(!network)throw new Error(`This claim belongs to unsupported chain ${epoch.claim_chain_id}.`);
      $('collection').textContent=epoch.source_collection||'FORGE Reward Epoch';
      $('meta').textContent=`${epoch.reward_symbol} · ${network.name} · source ${epoch.source_chain||'on-chain'} snapshot${epoch.snapshot_block?` #${fmt(epoch.snapshot_block)}`:''}`;
      $('pool').textContent=`${formatUnits(epoch.total_allocated_units,epoch.reward_decimals)} ${epoch.reward_symbol}`;
      $('eligible').textContent=fmt(epoch.eligible_wallets);
      $('deadline').textContent=new Date(epoch.deadline).toLocaleString();
      $('root').textContent=`MERKLE ROOT · ${epoch.merkle_root}`;
      $('contractLink').href=`${network.explorer}/address/${epoch.claim_contract}`;
      updateNetworkControls();
      await readOnChain();
      await ensureWallet(false).catch(()=>null);
      if(wallet)await checkWallet();
      else $('walletState').textContent='Connect a wallet to check eligibility.';
    }catch(e){
      status('loadStatus',e?.message||'Could not load claim.','error');
      $('statusTag').textContent='ERROR';$('statusTag').className='tag bad';
    }
  }

  async function checkWallet(){
    if(!epoch||!wallet||!network)return;
    clearStatus('claimStatus');
    clearStatus('gasStatus');
    try{
      const d=await api(wallet);claimData=d.claim;
      if(!claimData){
        $('amount').textContent='NOT ELIGIBLE';
        $('walletState').textContent=`${short(wallet)} is not included in this epoch.`;
        $('claimBtn').disabled=true;
      }else{
        const provider=chainState?.provider||readProvider();
        const c=new ethers.Contract(epoch.claim_contract,CLAIM_ABI,provider);
        const already=await c.claimed(wallet);
        $('amount').textContent=`${formatUnits(claimData.amount_units,epoch.reward_decimals)} ${epoch.reward_symbol}`;
        $('walletState').textContent=already?'Already claimed.':`Eligible wallet · ${short(wallet)}`;
        $('claimBtn').textContent=already?'CLAIMED ✓':'CLAIM';
        $('claimBtn').disabled=Boolean(already)||!chainState?.ok||Date.now()/1000>chainState.deadline||!interactionEnabled();
        updateNetworkControls();
        if(!already&&!$('claimBtn').disabled)await estimateClaimGas();
      }
      const isSponsor=wallet===String(epoch.creator_wallet).toLowerCase();
      $('sponsorBox').classList.toggle('show',isSponsor);
      if(isSponsor)$('recoverBtn').disabled=Date.now()/1000<=chainState.deadline||chainState.balance===0n||!interactionEnabled();
    }catch(e){status('claimStatus',e?.message||'Could not check wallet.','error');}
  }

  async function claim(){
    if(!claimData||!epoch||!network||!interactionEnabled())return;
    $('claimBtn').disabled=true;
    status('claimStatus',`Switching to ${network.name}…`);
    try{
      await switchClaimNetwork();
      const provider=new ethers.BrowserProvider(window.ethereum);
      const active=await provider.getNetwork();
      if(Number(active.chainId)!==Number(network.chainId))throw new Error(`Wallet chain mismatch. Expected ${network.name} (${network.chainId}), got ${active.chainId}.`);
      const signer=await provider.getSigner();
      const addr=(await signer.getAddress()).toLowerCase();
      if(addr!==wallet){wallet=addr;await checkWallet();throw new Error('Wallet account changed. Recheck eligibility.');}
      const c=new ethers.Contract(epoch.claim_contract,CLAIM_ABI,signer);
      const claimUnits=BigInt(claimData.amount_units);
      const beforeClaimed=chainState?.totalClaimed||0n;
      const beforeCount=chainState?.claimCount||0;
      await estimateClaimGas();
      status('claimStatus',`Wallet approval required to claim ${formatUnits(claimData.amount_units,epoch.reward_decimals)} ${epoch.reward_symbol} on ${network.name} · chain ${network.chainId}…`);
      const tx=await c.claim(claimUnits,claimData.proof);
      status('claimStatus',`Transaction submitted ${short(tx.hash)}. Waiting for on-chain confirmation…`);
      const confirmation=await waitForClaimConfirmation(tx.hash,addr);
      if(confirmation.pending){
        status('claimStatus',`Transaction submitted ${short(tx.hash)} but confirmation is taking longer than expected. Do not resubmit; use Refresh/reload to recheck on-chain state.`,'warn');
        return;
      }
      $('claimBtn').textContent='CLAIMED ✓';$('claimBtn').disabled=true;
      clearStatus('gasStatus');
      const synced=await refreshAfterTransaction(readProvider(),s=>Boolean(s)&&s.totalClaimed>=beforeClaimed+claimUnits&&s.claimCount>=beforeCount+1);
      status('claimStatus',synced?`Claim complete ✓ ${short(tx.hash)}`:'Claim confirmed on-chain ✓ Read RPC is still catching up; reload if live metrics lag.',synced?'ok':'warn');
    }catch(e){
      let already=false;
      try{
        if(wallet&&epoch){const c=new ethers.Contract(epoch.claim_contract,CLAIM_ABI,readProvider());already=Boolean(await c.claimed(wallet));}
      }catch(_){ }
      if(already){
        $('claimBtn').textContent='CLAIMED ✓';$('claimBtn').disabled=true;clearStatus('gasStatus');
        await readOnChain().catch(()=>null);
        status('claimStatus','Claim is confirmed on-chain even though the wallet UI reported an interruption. No resubmission is needed.','ok');
        return;
      }
      status('claimStatus',e?.shortMessage||e?.message||'Claim failed.','error');
      if(claimData&&interactionEnabled())$('claimBtn').disabled=false;
    }
  }

  async function recover(){
    if(!epoch||!wallet||!network||!interactionEnabled())return;
    $('recoverBtn').disabled=true;
    try{
      await switchClaimNetwork();
      const provider=new ethers.BrowserProvider(window.ethereum);
      const active=await provider.getNetwork();
      if(Number(active.chainId)!==Number(network.chainId))throw new Error(`Wallet chain mismatch. Expected ${network.name} (${network.chainId}), got ${active.chainId}.`);
      const signer=await provider.getSigner();
      const c=new ethers.Contract(epoch.claim_contract,CLAIM_ABI,signer);
      status('sponsorStatus','Wallet approval required to recover tokens remaining after deadline…');
      const tx=await c.recoverUnclaimed();
      const receipt=await tx.wait();
      if(receipt&&Number(receipt.status)===0)throw new Error('Recovery transaction reverted on-chain.');
      const synced=await refreshAfterTransaction(readProvider(),s=>Boolean(s)&&s.balance===0n);
      status('sponsorStatus',synced?'Unclaimed funds returned to sponsor wallet.':'Recovery confirmed. Read RPC is still catching up; use Refresh if live metrics lag.',synced?'ok':'warn');
    }catch(e){
      status('sponsorStatus',e?.shortMessage||e?.message||'Recovery failed.','error');
      if(interactionEnabled())$('recoverBtn').disabled=false;
    }
  }

  $('connectBtn').addEventListener('click',async()=>{try{await ensureWallet(true);await checkWallet();}catch(e){status('claimStatus',e?.message||'Wallet connection failed.','error');}});
  $('switchBtn').addEventListener('click',()=>switchClaimNetwork().then(async()=>{status('claimStatus',`${network.name} · chain ${network.chainId} ready.`,'ok');if(wallet&&claimData)await estimateClaimGas();}).catch(e=>status('claimStatus',e?.message||'Network switch failed.','error')));
  $('claimBtn').addEventListener('click',claim);
  $('recoverBtn').addEventListener('click',recover);
  $('refreshBtn').addEventListener('click',async()=>{await readOnChain();if(wallet)await checkWallet();});
  if(window.ethereum?.on){
    window.ethereum.on('accountsChanged',async a=>{wallet=a?.[0]?String(a[0]).toLowerCase():null;$('connectBtn').textContent=wallet?short(wallet):'CONNECT WALLET';if(wallet)await checkWallet();else{$('claimBtn').disabled=true;clearStatus('gasStatus');$('sponsorBox').classList.remove('show');}});
    window.ethereum.on('chainChanged',async()=>{updateNetworkControls();if(wallet&&claimData)await estimateClaimGas();});
  }
  load();
})();
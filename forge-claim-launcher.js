(() => {
  const RUNTIME = window.TOTZ_FORGE_CONFIG || {};
  const CLAIM_NETWORK = RUNTIME.claimNetwork || {
    chainId: 46630,
    hex: '0xb626',
    name: 'Robinhood Chain Testnet',
    rpc: 'https://rpc.testnet.chain.robinhood.com',
    explorer: 'https://explorer.testnet.chain.robinhood.com',
    environment: 'testnet'
  };
  const CLAIM_SERVICE = RUNTIME.services?.claims || 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/forge-claims';
  const ERC20_ABI = [
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function balanceOf(address) view returns (uint256)',
    'function transfer(address,uint256) returns (bool)'
  ];
  const CLAIM_VIEW_ABI = [
    'function token() view returns (address)',
    'function sponsor() view returns (address)',
    'function merkleRoot() view returns (bytes32)',
    'function totalAllocated() view returns (uint256)',
    'function deadline() view returns (uint64)',
    'function totalClaimed() view returns (uint256)',
    'function claimCount() view returns (uint256)',
    'function contractBalance() view returns (uint256)',
    'function isFullyFunded() view returns (bool)'
  ];
  const $ = id => document.getElementById(id);
  const isAddress = v => /^0x[a-fA-F0-9]{40}$/.test(String(v || ''));
  const isBytes32 = v => /^0x[a-fA-F0-9]{64}$/.test(String(v || ''));
  const short = a => a ? `${a.slice(0,6)}…${a.slice(-4)}` : '—';
  const fmt = n => Number(n || 0).toLocaleString();

  let pkg = null;
  let verified = false;
  let wallet = null;
  let claimAddress = null;
  let artifact = null;
  let tokenMeta = null;
  let deadlineUnix = 0;
  let uploadToken = null;
  let publishedSlug = null;

  function writesEnabled(){
    if(window.ForgeRuntime?.canExecuteClaims)return window.ForgeRuntime.canExecuteClaims(CLAIM_NETWORK);
    return Number(CLAIM_NETWORK.chainId)===46630;
  }
  function toast(m){const e=$('toast');e.textContent=m;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),2100);}
  function status(id,m,type=''){const e=$(id);e.textContent=m;e.className=`status show ${type}`;}
  function clearStatus(id){const e=$(id);e.textContent='';e.className='status';}
  function setCheck(label, ok, detail=''){
    const e=document.createElement('div');e.className=`check ${ok===true?'ok':ok===false?'bad':'wait'}`;e.textContent=`${ok===true?'✓':ok===false?'✕':'…'} ${label}${detail?` · ${detail}`:''}`;$('checks').appendChild(e);
  }
  function flow(stage){['Verify','Deploy','Fund','Publish'].forEach((s,i)=>{const e=$(`flow${s}`);e.classList.remove('active','done'); if(i<stage)e.classList.add('done'); else if(i===stage)e.classList.add('active');});}
  function compareHex(a,b){return BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0;}
  function pairHash(a,b){const ordered=compareHex(a,b)<=0?[a,b]:[b,a];return ethers.keccak256(ethers.concat(ordered));}
  function claimLeaf(address, units){const inner=ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address','uint256'],[ethers.getAddress(address),BigInt(units)]));return ethers.keccak256(inner);}
  function verifyProof(leaf, proof, root){let h=leaf;for(const p of proof)h=pairHash(h,p);return h.toLowerCase()===root.toLowerCase();}
  function formatUnits(units,decimals){try{return ethers.formatUnits(BigInt(units),decimals);}catch{return String(units);}}
  function setDefaultDeadline(){const d=new Date(Date.now()+30*86400000);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());$('deadlineInput').value=d.toISOString().slice(0,16);}
  function randomHex(bytes=32){const a=new Uint8Array(bytes);crypto.getRandomValues(a);return '0x'+[...a].map(b=>b.toString(16).padStart(2,'0')).join('');}
  async function sha256Hex(text){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return '0x'+[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');}
  function makeSlug(){const base=(pkg?.source?.collection||'claim').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,30)||'claim';return `${base}-${Date.now().toString(36)}-${randomHex(3).slice(2)}`;}
  function readProvider(){return window.ForgeRuntime?.createReadProvider?window.ForgeRuntime.createReadProvider(CLAIM_NETWORK):new ethers.JsonRpcProvider(CLAIM_NETWORK.rpc,CLAIM_NETWORK.chainId,{staticNetwork:true});}

  async function assertServerLaunchReady(sponsor){
    if(CLAIM_NETWORK.environment!=='mainnet')return true;
    if(!isAddress(sponsor))throw new Error('A valid sponsor wallet is required for the Mainnet release preflight.');
    const params=new URLSearchParams({route:'status',wallet:sponsor.toLowerCase()});
    const response=await fetch(`${CLAIM_SERVICE}?${params}`,{cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`Could not verify the FORGE Mainnet release state (${response.status}).`);
    const state=data?.mainnet||{};
    if(state.masterEnabled!==true||!['canary','public'].includes(String(state.mode||'')))throw new Error('FORGE Mainnet server release gate is still locked. No transaction was sent.');
    if(state.rpcReady!==true)throw new Error('FORGE Mainnet production RPC is not ready. No transaction was sent.');
    if(state.mode==='canary'){
      if(state.sponsorAllowed!==true)throw new Error('This wallet is not the configured FORGE Mainnet Canary sponsor. No transaction was sent.');
      const max=Number(state.canaryMaxWallets||0),eligible=Number(pkg?.eligibleWallets||0);
      if(!Number.isInteger(max)||max<1||!Number.isInteger(eligible)||eligible<1||eligible>max)throw new Error(`FORGE Mainnet Canary is limited to ${max||0} eligible wallets. No transaction was sent.`);
    }
    return true;
  }

  function installHardWriteGuard(){
    if(writesEnabled())return;
    const ids=['deployBtn','fundBtn','publishBtn'];
    const lock=()=>ids.forEach(id=>{const b=$(id);if(b)b.disabled=true;});
    document.addEventListener('click',e=>{
      const target=e.target?.closest?.('#deployBtn,#fundBtn,#publishBtn');
      if(!target)return;
      e.preventDefault();e.stopImmediatePropagation();
      status('deployStatus',`${CLAIM_NETWORK.name} writes are locked in this FORGE release.`,'warn');
    },true);
    const start=()=>{
      lock();
      const root=document.documentElement||document.body;
      if(root)new MutationObserver(lock).observe(root,{subtree:true,attributes:true,attributeFilter:['disabled'],childList:true});
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  }

  function renderNetworkUI(){
    const chip=$('claimNetworkChip');
    if(chip)chip.textContent=writesEnabled()?`🧪 ${CLAIM_NETWORK.name}`:`🔒 ${CLAIM_NETWORK.name} · locked`;
    const flowTag=$('claimFlowTag');
    if(flowTag)flowTag.textContent=writesEnabled()?`${CLAIM_NETWORK.environment==='mainnet'?'MAINNET':'TESTNET'} FLOW`:'MAINNET LOCKED';
    const chainTag=$('claimChainTag');
    if(chainTag)chainTag.textContent=`CHAIN ${CLAIM_NETWORK.chainId}`;
    const rewardLabel=$('rewardTokenLabel');
    if(rewardLabel)rewardLabel.textContent=`Reward token contract on ${CLAIM_NETWORK.name}`;
    const switchBtn=$('switchBtn');
    if(switchBtn)switchBtn.textContent=CLAIM_NETWORK.environment==='mainnet'?'SWITCH TO MAINNET':'SWITCH TO TESTNET';
    const footer=$('claimFooter');
    if(footer)footer.textContent=`© 2026 TOTZ FORGE · ${CLAIM_NETWORK.name} claim launcher · Never share a seed phrase or private key.`;
    if(!writesEnabled())status('deployStatus',`${CLAIM_NETWORK.name} is configured but mainnet write actions are locked until the release gate is explicitly enabled.`,'warn');
  }

  function publicationMessage(body){
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

  async function verifyPackage(data){
    verified=false;pkg=null;claimAddress=null;publishedSlug=null;$('checks').innerHTML='';$('summary').classList.remove('show');$('contractBox').classList.remove('show');$('publishBox').classList.remove('show');
    clearStatus('deployStatus');clearStatus('fundStatus');clearStatus('publishStatus');
    try{
      setCheck('Package format', null);
      if(!data||data.format!=='TOTZ_FORGE_MERKLE_V1')throw new Error('Unsupported claim package format.');
      if(!isBytes32(data.root))throw new Error('Invalid Merkle root.');
      if(!data.claims||typeof data.claims!=='object')throw new Error('Claim map missing.');
      const entries=Object.entries(data.claims);
      const eligible=Number(data.eligibleWallets||0);
      if(entries.length!==eligible)throw new Error(`Claim count mismatch (${entries.length}/${eligible}).`);
      $('checks').innerHTML='';setCheck('Package format',true,'TOTZ_FORGE_MERKLE_V1');
      setCheck('Claim count',true,`${fmt(entries.length)} wallets`);
      let total=0n, invalid=0, dupes=0;
      const seen=new Set();
      for(let i=0;i<entries.length;i++){
        const [raw,c]=entries[i];const addr=String(raw).toLowerCase();
        if(!isAddress(addr)||seen.has(addr)){if(seen.has(addr))dupes++;invalid++;continue;}seen.add(addr);
        const units=String(c?.amountUnits||'');if(!/^\d+$/.test(units)||BigInt(units)<=0n){invalid++;continue;}
        const leaf=claimLeaf(addr,units);
        if(String(c?.leaf||'').toLowerCase()!==leaf.toLowerCase()){invalid++;continue;}
        const proof=Array.isArray(c?.proof)?c.proof:[];
        if(proof.some(p=>!isBytes32(p))||!verifyProof(leaf,proof,data.root)){invalid++;continue;}
        total+=BigInt(units);
        if(i%300===0) await new Promise(r=>setTimeout(r,0));
      }
      const expected=BigInt(String(data.reward?.totalUnits||'0'));
      setCheck('Duplicate wallets',dupes===0,dupes?`${dupes} found`:'none');
      setCheck('Every leaf + proof',invalid===0,invalid?`${invalid} invalid`:`${fmt(entries.length)} verified`);
      setCheck('Exact pool total',total===expected,`${formatUnits(total,Number(data.reward?.decimals||0))} ${data.reward?.symbol||''}`);
      if(invalid||dupes||total!==expected||expected<=0n)throw new Error('Package verification failed. Do not deploy it.');
      pkg=data;verified=true;
      $('sumCollection').textContent=data.source?.collection||'NFT Collection';$('sumEligible').textContent=fmt(entries.length);$('sumPool').textContent=`${data.reward?.total||formatUnits(expected,Number(data.reward?.decimals||0))} ${data.reward?.symbol||''}`;$('sumSource').textContent=data.network?.name||`Chain ${data.network?.chainId||'—'}`;$('sumBlock').textContent=data.source?.snapshotBlock?`#${fmt(data.source.snapshotBlock)}`:'Pinned';$('sumRoot').textContent=`MERKLE ROOT · ${data.root}`;$('summary').classList.add('show');
      $('fundRequired').textContent=`${data.reward?.total||formatUnits(expected,Number(data.reward?.decimals||0))} ${data.reward?.symbol||''}`;
      status('verifyStatus',writesEnabled()?'Package verified locally. Deployment controls are now available.':`Package verified locally. ${CLAIM_NETWORK.name} writes remain locked.`,'ok');
      $('switchBtn').disabled=!writesEnabled();updateDeployReady();flow(1);
    }catch(e){status('verifyStatus',e?.message||'Package verification failed.','error');$('deployBtn').disabled=true;$('switchBtn').disabled=true;flow(0);}
  }

  async function readFile(file){$('fileName').textContent=file.name;status('verifyStatus','Verifying every allocation and Merkle proof…');try{const txt=await file.text();const data=JSON.parse(txt);await verifyPackage(data);}catch(e){status('verifyStatus',e?.message||'Could not read claim JSON.','error');}}

  async function ensureWallet(request=true){
    if(!window.ethereum?.request)throw new Error('No EVM browser wallet detected.');
    const a=await window.ethereum.request({method:request?'eth_requestAccounts':'eth_accounts'});wallet=a?.[0]?String(a[0]).toLowerCase():null;if(wallet){$('connectBtn').textContent=short(wallet);if(!$('sponsorInput').value)$('sponsorInput').value=wallet;}return wallet;
  }
  async function ensureClaimNetwork(){
    if(!writesEnabled())throw new Error(`${CLAIM_NETWORK.name} writes are locked in this FORGE release.`);
    await ensureWallet(true);
    if(window.ForgeRuntime?.ensureClaimNetwork){await window.ForgeRuntime.ensureClaimNetwork({requestAccounts:false,network:CLAIM_NETWORK,requireExecution:true});return new ethers.BrowserProvider(window.ethereum);}
    try{await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:CLAIM_NETWORK.hex}]});}
    catch(e){if(e?.code===4902||String(e?.message||'').toLowerCase().includes('unrecognized')){await window.ethereum.request({method:'wallet_addEthereumChain',params:[{chainId:CLAIM_NETWORK.hex,chainName:CLAIM_NETWORK.name,nativeCurrency:CLAIM_NETWORK.nativeCurrency||{name:'ETH',symbol:'ETH',decimals:18},rpcUrls:[CLAIM_NETWORK.rpc],blockExplorerUrls:[CLAIM_NETWORK.explorer]}]});}else throw e;}
    return new ethers.BrowserProvider(window.ethereum);
  }
  async function currentChain(){if(!window.ethereum?.request)return null;const h=await window.ethereum.request({method:'eth_chainId'});return parseInt(h,16);}
  function updateDeployReady(){const token=$('tokenInput').value.trim();const sponsor=$('sponsorInput').value.trim();const deadline=$('deadlineInput').value;deadlineUnix=deadline?Math.floor(new Date(deadline).getTime()/1000):0;$('deployBtn').disabled=!(writesEnabled()&&verified&&isAddress(token)&&isAddress(sponsor)&&deadlineUnix>Math.floor(Date.now()/1000)+60);}

  async function loadArtifact(){if(artifact)return artifact;const r=await fetch('/artifacts/ForgeMerkleClaim.json',{cache:'no-store'});if(!r.ok)throw new Error('Claim contract artifact is unavailable.');artifact=await r.json();if(!artifact?.abi||!/^0x[0-9a-f]+$/i.test(artifact?.bytecode||''))throw new Error('Invalid claim contract artifact.');return artifact;}
  async function inspectToken(provider, token){const c=new ethers.Contract(token,ERC20_ABI,provider);const [symbol,decimals]=await Promise.all([c.symbol(),c.decimals()]);return{symbol:String(symbol),decimals:Number(decimals),contract:c};}

  async function deploy(){
    if(!verified)return;
    if(!writesEnabled()){status('deployStatus',`${CLAIM_NETWORK.name} writes are locked in this FORGE release.`,'warn');return;}
    const token=$('tokenInput').value.trim().toLowerCase(), sponsor=$('sponsorInput').value.trim().toLowerCase();updateDeployReady();if($('deployBtn').disabled)return;
    $('deployBtn').disabled=true;status('deployStatus',`Checking server release gate before ${CLAIM_NETWORK.name} deployment…`);
    try{
      await assertServerLaunchReady(sponsor);
      const provider=await ensureClaimNetwork();const signer=await provider.getSigner();const signerAddr=(await signer.getAddress()).toLowerCase();
      if(signerAddr!==sponsor)throw new Error('Sponsor wallet must match the connected signing wallet for this claim flow.');
      tokenMeta=await inspectToken(provider,token);
      if(tokenMeta.decimals!==Number(pkg.reward.decimals))throw new Error(`Token decimals mismatch: package=${pkg.reward.decimals}, token=${tokenMeta.decimals}.`);
      if(tokenMeta.symbol!==String(pkg.reward.symbol))status('deployStatus',`Token symbol is ${tokenMeta.symbol}, while package says ${pkg.reward.symbol}. Decimals match; confirm this is intentional.`,'warn');
      $('tokenSymbol').textContent=tokenMeta.symbol;$('tokenDecimals').textContent=String(tokenMeta.decimals);
      const art=await loadArtifact();const factory=new ethers.ContractFactory(art.abi,art.bytecode,signer);
      status('deployStatus',`Wallet approval required to deploy the immutable claim contract on ${CLAIM_NETWORK.name}…`);
      const c=await factory.deploy(token,pkg.root,BigInt(pkg.reward.totalUnits),deadlineUnix,sponsor);await c.waitForDeployment();claimAddress=(await c.getAddress()).toLowerCase();
      const deployed=new ethers.Contract(claimAddress,CLAIM_VIEW_ABI,provider);const [r,t,total,d,s]=await Promise.all([deployed.merkleRoot(),deployed.token(),deployed.totalAllocated(),deployed.deadline(),deployed.sponsor()]);
      if(String(r).toLowerCase()!==pkg.root.toLowerCase()||String(t).toLowerCase()!==token||BigInt(total)!==BigInt(pkg.reward.totalUnits)||Number(d)!==deadlineUnix||String(s).toLowerCase()!==sponsor)throw new Error('Deployed contract verification failed. Do not fund it.');
      $('claimContract').textContent=claimAddress;$('explorerContract').href=`${CLAIM_NETWORK.explorer}/address/${claimAddress}`;$('contractBox').classList.add('show');status('deployStatus',`Claim contract deployed and verified on ${CLAIM_NETWORK.name}.`,'ok');$('refreshFundBtn').disabled=false;flow(2);await refreshFunding(provider);
    }catch(e){status('deployStatus',e?.shortMessage||e?.message||'Deployment failed.','error');updateDeployReady();}
  }

  async function refreshFunding(existingProvider=null){
    if(!claimAddress||!pkg)return;
    try{
      const provider=existingProvider||readProvider();const c=new ethers.Contract(claimAddress,CLAIM_VIEW_ABI,provider);const [bal,full]=await Promise.all([c.contractBalance(),c.isFullyFunded()]);const required=BigInt(pkg.reward.totalUnits);const b=BigInt(bal);$('fundBalance').textContent=`${formatUnits(b,Number(pkg.reward.decimals))} ${tokenMeta?.symbol||pkg.reward.symbol}`;$('fundState').textContent=full?'FULLY FUNDED':'NEEDS FUNDING';$('fundTag').textContent=full?'READY':'NEEDS FUNDS';$('fundProgress').style.width=`${Math.min(100,Number((b*10000n)/(required||1n))/100)}%`;$('fundBtn').disabled=Boolean(full)||!writesEnabled();$('publishBtn').disabled=!full||!writesEnabled();$('publishTag').textContent=full?'READY':'LOCKED';if(full){flow(3);status('fundStatus','Contract is fully funded. Publishing is unlocked.','ok');}else{flow(2);status('fundStatus',`Funding required: ${formatUnits(required>b?required-b:0n,Number(pkg.reward.decimals))} ${tokenMeta?.symbol||pkg.reward.symbol}.`,'warn');}
      return Boolean(full);
    }catch(e){status('fundStatus',e?.message||'Could not read contract funding.','error');return false;}
  }

  async function fund(){
    if(!claimAddress||!pkg)return;
    if(!writesEnabled()){status('fundStatus',`${CLAIM_NETWORK.name} writes are locked in this FORGE release.`,'warn');return;}
    $('fundBtn').disabled=true;status('fundStatus','Checking server release gate before transferring reward tokens…');
    try{
      await assertServerLaunchReady($('sponsorInput').value.trim().toLowerCase());
      const provider=await ensureClaimNetwork();const signer=await provider.getSigner();const token=$('tokenInput').value.trim().toLowerCase();const erc=new ethers.Contract(token,ERC20_ABI,signer);const owner=await signer.getAddress();const required=BigInt(pkg.reward.totalUnits);const claim=new ethers.Contract(claimAddress,CLAIM_VIEW_ABI,provider);const current=BigInt(await claim.contractBalance());const missing=required>current?required-current:0n;if(missing===0n){await refreshFunding(provider);return;}const balance=BigInt(await erc.balanceOf(owner));if(balance<missing)throw new Error(`Wallet balance is too low. Need ${formatUnits(missing,Number(pkg.reward.decimals))} ${tokenMeta?.symbol||pkg.reward.symbol}.`);status('fundStatus',`Wallet approval required to transfer ${formatUnits(missing,Number(pkg.reward.decimals))} ${tokenMeta?.symbol||pkg.reward.symbol}…`);const tx=await erc.transfer(claimAddress,missing);await tx.wait();await refreshFunding(provider);
    }catch(e){status('fundStatus',e?.shortMessage||e?.message||'Funding failed.','error');if(writesEnabled())$('fundBtn').disabled=false;}
  }

  async function api(route, body){const r=await fetch(`${CLAIM_SERVICE}?route=${encodeURIComponent(route)}`,{method:'POST',headers:{'Content-Type':'application/json','x-forge-upload-token':uploadToken||''},body:JSON.stringify(body),cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Publish service error (${r.status}).`);return d;}
  async function publish(){
    if(!claimAddress||!pkg)return;
    if(!writesEnabled()){status('publishStatus',`${CLAIM_NETWORK.name} writes are locked in this FORGE release.`,'warn');return;}
    $('publishBtn').disabled=true;status('publishStatus','Checking server release gate before publication…');
    try{
      await assertServerLaunchReady($('sponsorInput').value.trim().toLowerCase());
      if(!await refreshFunding())throw new Error('Claim contract is not fully funded.');
      const provider=await ensureClaimNetwork();
      const signer=await provider.getSigner();
      wallet=(await signer.getAddress()).toLowerCase();
      const sponsor=$('sponsorInput').value.trim().toLowerCase();
      if(wallet!==sponsor)throw new Error('Connected wallet must match the claim sponsor before publication.');
      const slug=makeSlug();uploadToken=randomHex(32);const uploadTokenHash=await sha256Hex(uploadToken);
      const createBody={
        slug,uploadToken,uploadTokenHash,creatorWallet:wallet,
        sourceChain:pkg.network?.key||'unknown',sourceChainId:Number(pkg.network?.chainId||0),
        sourceContract:String(pkg.source?.contract||'').toLowerCase(),sourceCollection:pkg.source?.collection,
        snapshotBlock:pkg.source?.snapshotBlock??null,
        rewardToken:$('tokenInput').value.trim().toLowerCase(),rewardSymbol:tokenMeta?.symbol||pkg.reward.symbol,
        rewardDecimals:Number(pkg.reward.decimals),merkleRoot:pkg.root,totalAllocatedUnits:String(pkg.reward.totalUnits),
        eligibleWallets:Number(pkg.eligibleWallets),claimChainId:CLAIM_NETWORK.chainId,claimContract:claimAddress,
        deadline:deadlineUnix,packageFingerprint:pkg.distributionFingerprint||null,issuedAt:Math.floor(Date.now()/1000)
      };
      status('publishStatus','Sponsor signature required to authorize this exact FORGE publication and protected upload session. No gas is used.','warn');
      createBody.authSignature=await signer.signMessage(publicationMessage(createBody));
      status('publishStatus','Authorization verified locally. Creating the protected upload session…');
      await api('create',createBody);
      const entries=Object.entries(pkg.claims).map(([wallet,c])=>({wallet:wallet.toLowerCase(),amountUnits:String(c.amountUnits),leaf:c.leaf,proof:c.proof}));
      for(let i=0;i<entries.length;i+=200){status('publishStatus',`Uploading verified proofs… ${Math.min(i+200,entries.length)}/${entries.length}`);await api('upload',{slug,uploadToken,entries:entries.slice(i,i+200)});}
      status('publishStatus','Server is re-checking the exact allocation total, approved claim runtime and live contract…');
      await api('publish',{slug,uploadToken});publishedSlug=slug;const url=`${location.origin}/forge-claim?slug=${encodeURIComponent(slug)}`;$('claimLink').textContent=url;$('claimLink').href=url;$('openClaimBtn').href=url;$('publishBox').classList.add('show');$('publishTag').textContent='PUBLISHED';flow(4);status('publishStatus',`Published ${fmt(entries.length)} server-verified proofs. The holder claim page is live.`,'ok');uploadToken=null;
    }catch(e){status('publishStatus',e?.shortMessage||e?.message||'Could not publish claim.','error');if(writesEnabled())$('publishBtn').disabled=false;}
  }

  $('fileInput').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)readFile(f);});
  $('connectBtn').addEventListener('click',async()=>{try{await ensureWallet(true);const chain=await currentChain();if(chain===CLAIM_NETWORK.chainId)toast(`Wallet connected on ${CLAIM_NETWORK.name}`);else toast(`Wallet connected · switch to ${CLAIM_NETWORK.name} before deployment`);updateDeployReady();}catch(e){toast(e?.message||'Wallet connection failed');}});
  $('switchBtn').addEventListener('click',async()=>{try{await ensureClaimNetwork();toast(`${CLAIM_NETWORK.name} ready`);}catch(e){status('deployStatus',e?.message||'Could not switch network.','error');}});
  ['tokenInput','sponsorInput','deadlineInput'].forEach(id=>$(id).addEventListener('input',updateDeployReady));
  $('deployBtn').addEventListener('click',deploy);$('fundBtn').addEventListener('click',fund);$('refreshFundBtn').addEventListener('click',()=>refreshFunding());$('publishBtn').addEventListener('click',publish);$('copyLinkBtn').addEventListener('click',async()=>{const u=$('claimLink').textContent;if(u){await navigator.clipboard.writeText(u);toast('Claim link copied');}});
  if(window.ethereum?.on){window.ethereum.on('accountsChanged',a=>{wallet=a?.[0]?String(a[0]).toLowerCase():null;$('connectBtn').textContent=wallet?short(wallet):'CONNECT WALLET';if(wallet)$('sponsorInput').value=wallet;updateDeployReady();});}
  renderNetworkUI();installHardWriteGuard();setDefaultDeadline();ensureWallet(false).catch(()=>{}).finally(updateDeployReady);flow(0);
})();
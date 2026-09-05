(() => {
  const TESTNET = {
    chainId: 46630,
    hex: '0xb626',
    name: 'Robinhood Chain Testnet',
    rpc: 'https://rpc.testnet.chain.robinhood.com',
    explorer: 'https://explorer.testnet.chain.robinhood.com'
  };

  const $ = id => document.getElementById(id);
  const short = a => a ? `${a.slice(0,6)}…${a.slice(-4)}` : '—';
  const isAddress = v => /^0x[a-fA-F0-9]{40}$/.test(String(v || ''));
  let deploying = false;
  let packageDecimals = 6;

  function setStatus(message, type='') {
    const el = $('testTokenStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `status show ${type}`;
  }

  async function readPackageMeta(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const d = Number(data?.reward?.decimals);
      if (Number.isInteger(d) && d >= 0 && d <= 18) {
        packageDecimals = d;
        const btn = $('createTestTokenBtn');
        if (btn && !deploying && !btn.dataset.ready) btn.textContent = `CREATE ${d}-DECIMAL TEST TOKEN`;
        setStatus(`Test helper detected the package uses ${d} decimals. The test token will match it exactly.`, 'ok');
        try{
          const saved=localStorage.getItem(`forge_test_token_${TESTNET.chainId}_${d}`);
          if(saved&&isAddress(saved)&&$('tokenInput')){$('tokenInput').value=saved;$('tokenInput').dispatchEvent(new Event('input',{bubbles:true}));}
        }catch(_){ }
      }
    } catch (_) {}
  }

  async function ensureTestnet() {
    if (!window.ethereum?.request) throw new Error('No EVM browser wallet detected.');
    const accounts = await window.ethereum.request({method:'eth_requestAccounts'});
    if (!accounts?.[0]) throw new Error('Connect a wallet first.');
    try {
      await window.ethereum.request({method:'wallet_switchEthereumChain', params:[{chainId:TESTNET.hex}]});
    } catch (e) {
      if (e?.code === 4902 || String(e?.message || '').toLowerCase().includes('unrecognized')) {
        await window.ethereum.request({
          method:'wallet_addEthereumChain',
          params:[{
            chainId:TESTNET.hex,
            chainName:TESTNET.name,
            nativeCurrency:{name:'ETH',symbol:'ETH',decimals:18},
            rpcUrls:[TESTNET.rpc],
            blockExplorerUrls:[TESTNET.explorer]
          }]
        });
      } else throw e;
    }
    return new ethers.BrowserProvider(window.ethereum);
  }

  async function loadArtifact() {
    const r = await fetch('/artifacts/ForgeTestUSDG.json', {cache:'no-store'});
    if (!r.ok) throw new Error('Test-token artifact is not ready yet. Refresh in a moment.');
    const a = await r.json();
    if (!a?.abi || !/^0x[0-9a-f]+$/i.test(a?.bytecode || '')) throw new Error('Invalid test-token artifact.');
    return a;
  }

  async function createToken() {
    if (deploying) return;
    deploying = true;
    const btn = $('createTestTokenBtn');
    if (btn) btn.disabled = true;
    setStatus(`Preparing a fixed-supply tUSDG token with ${packageDecimals} decimals on Robinhood Chain Testnet…`);
    try {
      const provider = await ensureTestnet();
      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();
      const balance = await provider.getBalance(signerAddress);
      if (balance === 0n) throw new Error('This wallet has no testnet ETH for gas. Use the Robinhood testnet faucet first.');

      const artifact = await loadArtifact();
      const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
      setStatus(`MetaMask approval required. This deploys TEST tokens only and matches the package at ${packageDecimals} decimals.`, 'warn');
      const token = await factory.deploy(packageDecimals);
      await token.waitForDeployment();
      const address = (await token.getAddress()).toLowerCase();

      const [symbol, decimals, tokenBalance] = await Promise.all([
        token.symbol(), token.decimals(), token.balanceOf(signerAddress)
      ]);
      if (String(symbol) !== 'tUSDG' || Number(decimals) !== packageDecimals) throw new Error('Deployed test token failed metadata verification.');

      const input = $('tokenInput');
      if (input) {
        input.value = address;
        input.dispatchEvent(new Event('input', {bubbles:true}));
        input.dispatchEvent(new Event('change', {bubbles:true}));
      }
      if ($('tokenSymbol')) $('tokenSymbol').textContent = 'tUSDG';
      if ($('tokenDecimals')) $('tokenDecimals').textContent = String(packageDecimals);
      try{localStorage.setItem(`forge_test_token_${TESTNET.chainId}_${packageDecimals}`,address);}catch(_){ }

      const amount = ethers.formatUnits(tokenBalance, packageDecimals);
      setStatus(`Test token ready ✓ ${amount} tUSDG (${packageDecimals} decimals) minted to ${short(signerAddress)}. Contract ${short(address)} was filled in automatically.`, 'ok');
      if (btn) {
        btn.textContent = 'TEST TOKEN READY ✓';
        btn.disabled = true;
        btn.dataset.ready = '1';
      }
      const open = $('testTokenExplorer');
      if (open) {
        open.href = `${TESTNET.explorer}/address/${address}`;
        open.style.display = 'inline-flex';
      }

      try {
        await window.ethereum.request({
          method:'wallet_watchAsset',
          params:{type:'ERC20',options:{address,symbol:'tUSDG',decimals:packageDecimals}}
        });
      } catch (_) {}
    } catch (e) {
      setStatus(e?.shortMessage || e?.message || 'Could not create the test token.', 'error');
      if (btn) btn.disabled = false;
    } finally {
      deploying = false;
    }
  }

  function compareHex(a,b){const A=BigInt(a),B=BigInt(b);return A===B?0:(A<B?-1:1);}
  function pairHash(a,b){const ordered=compareHex(a,b)<=0?[a,b]:[b,a];return ethers.keccak256(ethers.concat(ordered));}
  function claimLeaf(address,units){const inner=ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address','uint256'],[ethers.getAddress(address),BigInt(units)]));return ethers.keccak256(inner);}
  function makeMerkle(entries){
    const leaves=entries.map(e=>claimLeaf(e.address,e.units));const layers=[leaves];
    while(layers[layers.length-1].length>1){const prev=layers[layers.length-1],next=[];for(let i=0;i<prev.length;i+=2)next.push(i+1<prev.length?pairHash(prev[i],prev[i+1]):prev[i]);layers.push(next);}
    const root=layers[layers.length-1][0];
    const claims=entries.map((e,index)=>{let idx=index;const proof=[];for(let level=0;level<layers.length-1;level++){const layer=layers[level],sib=idx%2===0?idx+1:idx-1;if(sib<layer.length)proof.push(layer[sib]);idx=Math.floor(idx/2);}return{...e,leaf:leaves[index],proof};});
    return{root,claims};
  }
  async function digest(text){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return'0x'+[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');}
  function quickStatus(message,type='warn'){const e=$('quickTestStatus');if(!e)return;e.textContent=message;e.className=`status show ${type}`;}
  function parseQuickWallets(){
    const vals=String($('quickTestWallets')?.value||'').split(/[\s,;]+/).map(v=>v.trim().toLowerCase()).filter(Boolean);const out=[],seen=new Set();
    for(const v of vals){if(!isAddress(v))throw new Error(`Invalid wallet: ${v}`);if(!seen.has(v)){seen.add(v);out.push(v);}}
    if(out.length<2)throw new Error('Paste at least 2 different wallet addresses. 3 is ideal.');
    if(out.length>5)throw new Error('Quick Test supports up to 5 wallets.');
    return out;
  }
  async function addConnectedTestWallet(){
    try{if(!window.ethereum?.request)throw new Error('No EVM wallet detected.');const a=(await window.ethereum.request({method:'eth_requestAccounts'}))?.[0];if(!a)throw new Error('No connected wallet.');const area=$('quickTestWallets');const existing=String(area.value||'').trim();const vals=existing.split(/[\s,;]+/).map(v=>v.toLowerCase()).filter(Boolean);if(!vals.includes(a.toLowerCase()))area.value=(existing?existing+'\n':'')+a.toLowerCase();quickStatus(`Added ${short(a)}. Switch MetaMask account and press again to add another.`,'ok');}catch(e){quickStatus(e?.message||'Could not add wallet.','error');}
  }
  async function buildQuickTest(){
    const btn=$('buildQuickTestBtn');if(btn)btn.disabled=true;
    try{
      const wallets=parseQuickWallets();const decimals=2;packageDecimals=decimals;
      const assigned=wallets.map((address,i)=>({address,units:BigInt((i+1)*10)*100n}));
      const entries=assigned.slice().sort((a,b)=>a.address.localeCompare(b.address));const tree=makeMerkle(entries);const claims={};
      tree.claims.forEach(c=>{claims[c.address]={amountUnits:c.units.toString(),amount:ethers.formatUnits(c.units,decimals),leaf:c.leaf,proof:c.proof};});
      const totalUnits=entries.reduce((s,e)=>s+e.units,0n);const now=new Date().toISOString();const fingerprint=await digest('FORGE_QUICK_TEST_V1\n'+entries.map(e=>`${e.address}:${e.units}`).join('\n'));
      const pkg={format:'TOTZ_FORGE_MERKLE_V1',leafEncoding:'keccak256(bytes.concat(keccak256(abi.encode(address,uint256))))',pairHashing:'sorted-keccak256',root:tree.root,network:{name:'Robinhood Chain Testnet',chainId:46630,key:'robinhood-testnet'},source:{contract:'0x0000000000000000000000000000000000000001',collection:'FORGE QUICK TEST',snapshotBlock:0,snapshotUTC:now},reward:{symbol:'tUSDG',decimals,totalUnits:totalUnits.toString(),total:ethers.formatUnits(totalUnits,decimals)},eligibleWallets:entries.length,distributionFingerprint:fingerprint,createdUTC:now,quickTest:true,claims};
      const file=new File([JSON.stringify(pkg,null,2)],`forge-quick-test-${entries.length}-wallets.json`,{type:'application/json'});const dt=new DataTransfer();dt.items.add(file);const input=$('fileInput');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
      const deadline=$('deadlineInput');if(deadline){const d=new Date(Date.now()+10*60*1000);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());deadline.value=d.toISOString().slice(0,16);deadline.dispatchEvent(new Event('input',{bubbles:true}));}
      try{const saved=localStorage.getItem(`forge_test_token_${TESTNET.chainId}_${decimals}`);if(saved&&isAddress(saved)&&$('tokenInput')){$('tokenInput').value=saved;$('tokenInput').dispatchEvent(new Event('input',{bubbles:true}));}}catch(_){ }
      quickStatus(`Loaded TEST package: ${entries.length} wallets · ${ethers.formatUnits(totalUnits,decimals)} tUSDG total · W1=10, W2=20${entries.length>=3?', W3=30':''} · deadline 10 minutes.`,'ok');
      setTimeout(()=>document.querySelector('.card.blue')?.scrollIntoView({behavior:'smooth',block:'start'}),250);
    }catch(e){quickStatus(e?.message||'Could not build test package.','error');}
    finally{if(btn)btn.disabled=false;}
  }

  function install() {
    const switchBtn = $('switchBtn');
    if (!switchBtn || $('createTestTokenBtn')) return;
    const actions = switchBtn.parentElement;
    if (!actions) return;

    const btn = document.createElement('button');
    btn.id = 'createTestTokenBtn';
    btn.type = 'button';
    btn.className = 'btn good';
    btn.textContent = 'CREATE TEST TOKEN';
    btn.addEventListener('click', createToken);
    actions.insertBefore(btn, switchBtn);

    const explorer = document.createElement('a');
    explorer.id = 'testTokenExplorer';
    explorer.className = 'btn ghost';
    explorer.target = '_blank';
    explorer.rel = 'noopener';
    explorer.textContent = 'OPEN TEST TOKEN ↗';
    explorer.style.display = 'none';
    actions.appendChild(explorer);

    const note = document.createElement('div');
    note.id = 'testTokenStatus';
    note.className = 'status show warn';
    note.textContent = 'CREATE TEST TOKEN deploys 100,000 fixed-supply tUSDG on Chain 46630 and automatically matches the decimals in the loaded package.';
    actions.parentElement.insertBefore(note, actions.nextSibling);

    const fileInput = $('fileInput');
    if (fileInput) {
      fileInput.addEventListener('change', () => readPackageMeta(fileInput.files?.[0]));
      if (fileInput.files?.[0]) readPackageMeta(fileInput.files[0]);
    }

    const first=document.querySelector('main.grid > .card.blue');
    if(first && !$('quickTestCard')){
      const card=document.createElement('section');card.id='quickTestCard';card.className='card';card.style.border='2px solid var(--lime)';
      card.innerHTML=`<div class="head"><div><h2>🧪 Quick multi-wallet test</h2><p>Paste 2–5 of your MetaMask account addresses. No NFT eligibility is needed. FORGE builds a mini Merkle package locally so you can test several eligible wallets.</p></div><span class="tag test">TEST ONLY</span></div><div class="field full"><label>Test wallet addresses · one per line</label><textarea id="quickTestWallets" rows="5" placeholder="0x wallet 1…\n0x wallet 2…\n0x wallet 3…" style="width:100%;border:2px solid var(--sky2);border-radius:15px;background:var(--cream);padding:11px 12px;color:var(--ink);font:inherit;font-weight:800;outline:none;resize:vertical"></textarea></div><div style="margin-top:10px;padding:11px 13px;border-radius:14px;background:var(--cream);font-size:.72rem;font-weight:900">Automatic test allocations: wallet 1 = 10 tUSDG · wallet 2 = 20 tUSDG · wallet 3 = 30 tUSDG. Claim window is set to 10 minutes so recovery can be tested.</div><div class="actions"><button id="addConnectedTestWalletBtn" class="btn soft" type="button">ADD CONNECTED WALLET</button><button id="buildQuickTestBtn" class="btn good" type="button">BUILD & LOAD TEST PACKAGE</button></div><div id="quickTestStatus" class="status show warn">Best test: use 3 accounts. Claim with two and leave the third unclaimed for the deadline/recovery test.</div>`;
      first.parentElement.insertBefore(card,first);$('addConnectedTestWalletBtn').addEventListener('click',addConnectedTestWallet);$('buildQuickTestBtn').addEventListener('click',buildQuickTest);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();

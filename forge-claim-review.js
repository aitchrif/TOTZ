(() => {
  const RUNTIME = window.TOTZ_FORGE_CONFIG || {};
  const TESTNET = RUNTIME.claimNetwork || {chainId:46630,name:'Robinhood Chain Testnet',rpc:'https://rpc.testnet.chain.robinhood.com'};
  const ERC20_ABI = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function balanceOf(address) view returns (uint256)'
  ];
  const $ = id => document.getElementById(id);
  const isAddress = v => /^0x[a-fA-F0-9]{40}$/.test(String(v || ''));
  const short = a => a ? `${a.slice(0,6)}…${a.slice(-4)}` : '—';
  let packageData = null;
  let tokenMeta = null;
  let tokenVerifyTimer = null;
  let reviewConfirmed = false;
  let deploymentStarted = false;

  function readProvider() {
    return window.ForgeRuntime?.createReadProvider
      ? window.ForgeRuntime.createReadProvider()
      : new ethers.JsonRpcProvider(TESTNET.rpc,TESTNET.chainId,{staticNetwork:true});
  }

  function reviewStatus(message,type='warn') {
    const el = $('finalReviewStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `status show ${type}`;
  }

  function tokenStatus(message,type='warn') {
    const el = $('launcherTokenStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `status show ${type}`;
  }

  async function connectedWallet() {
    if (!window.ethereum?.request) return null;
    try {
      const a = await window.ethereum.request({method:'eth_accounts'});
      return a?.[0] ? String(a[0]).toLowerCase() : null;
    } catch { return null; }
  }

  function parseDeadline() {
    const v = $('deadlineInput')?.value;
    if (!v) return 0;
    const ms = new Date(v).getTime();
    return Number.isFinite(ms) ? Math.floor(ms/1000) : 0;
  }

  function packageVerifiedByCore() {
    const el = $('verifyStatus');
    return Boolean(el?.classList.contains('ok'));
  }

  function tokenMatchesPackage() {
    if (!tokenMeta || !packageData?.reward) return false;
    const expectedDecimals = Number(packageData.reward.decimals);
    const expectedSymbol = String(packageData.reward.symbol || '');
    const contractExpected = String(packageData.reward.contract || '').toLowerCase();
    if (tokenMeta.decimals !== expectedDecimals) return false;
    if (tokenMeta.symbol !== expectedSymbol) return false;
    if (isAddress(contractExpected) && tokenMeta.address !== contractExpected) return false;
    return true;
  }

  function canReview() {
    const sponsor = $('sponsorInput')?.value.trim().toLowerCase();
    const deadline = parseDeadline();
    return packageVerifiedByCore() && tokenMatchesPackage() && isAddress(sponsor) && deadline > Math.floor(Date.now()/1000)+60;
  }

  function canDeploy() {
    return canReview() && reviewConfirmed && !deploymentStarted;
  }

  function resetReview(message='A setting changed. Review the immutable launch details again before deployment.') {
    reviewConfirmed = false;
    const ack = $('reviewAck');
    if (ack) ack.checked = false;
    reviewStatus(message,'warn');
    refreshReview();
  }

  function setReviewCell(id,label,value,mono=false) {
    const el = $(id);
    if (!el) return;
    el.innerHTML = `<small>${label}</small><b${mono?' class="mono"':''}>${value || '—'}</b>`;
  }

  function refreshReview() {
    if (!$('finalReviewCard')) return;
    const sponsor = $('sponsorInput')?.value.trim().toLowerCase();
    const deadline = $('deadlineInput')?.value;
    const rewardAddress = $('tokenInput')?.value.trim().toLowerCase();
    const rewardPool = packageData?.reward ? `${packageData.reward.total ?? ''} ${packageData.reward.symbol ?? ''}`.trim() : '—';
    const source = packageData?.network?.name || '—';
    const block = packageData?.source?.snapshotBlock ? `#${Number(packageData.source.snapshotBlock).toLocaleString()}` : 'Pinned';
    const root = packageData?.root || '—';

    setReviewCell('reviewCollection','COLLECTION',packageData?.source?.collection || '—');
    setReviewCell('reviewSource','ELIGIBILITY SOURCE',source);
    setReviewCell('reviewBlock','SNAPSHOT BLOCK',block);
    setReviewCell('reviewEligible','ELIGIBLE WALLETS',packageData?.eligibleWallets ? Number(packageData.eligibleWallets).toLocaleString() : '—');
    setReviewCell('reviewPool','REWARD POOL',rewardPool);
    setReviewCell('reviewToken','REWARD TOKEN',tokenMeta ? `${tokenMeta.symbol} · ${short(rewardAddress)}` : (isAddress(rewardAddress)?short(rewardAddress):'—'));
    setReviewCell('reviewRewardNetwork','REWARD NETWORK',`${TESTNET.name} · ${TESTNET.chainId}`);
    setReviewCell('reviewSponsor','SPONSOR / RECOVERY',isAddress(sponsor)?short(sponsor):'—');
    setReviewCell('reviewDeadline','CLAIM DEADLINE',deadline ? new Date(deadline).toLocaleString() : '—');
    setReviewCell('reviewRoot','MERKLE ROOT',root,true);

    const ack = $('reviewAck');
    if (ack) ack.disabled = !canReview() || deploymentStarted;
    const btn = $('deployBtn');
    if (btn && !deploymentStarted) {
      btn.textContent = reviewConfirmed ? 'CONFIRM & DEPLOY' : 'REVIEW & CONFIRM';
      btn.disabled = !canDeploy();
    }

    if (!packageData) reviewStatus('Load and verify a Merkle package first.','warn');
    else if (!packageVerifiedByCore()) reviewStatus('FORGE is still verifying the package. Deployment remains locked.','warn');
    else if (!tokenMeta) reviewStatus('Verify the reward token on-chain before deployment.','warn');
    else if (!tokenMatchesPackage()) reviewStatus('Reward token metadata does not match the package. Deployment is blocked.','error');
    else if (!isAddress(sponsor)) reviewStatus('Enter a valid sponsor / recovery wallet.','warn');
    else if (parseDeadline() <= Math.floor(Date.now()/1000)+60) reviewStatus('Choose a claim deadline safely in the future.','warn');
    else if (!reviewConfirmed) reviewStatus('Everything matches. Review the immutable values below, then tick the confirmation box.','ok');
    else reviewStatus('Final review confirmed ✓ Deployment is unlocked. MetaMask will still show the transaction before anything is written.','ok');
  }

  async function verifyToken() {
    const input = $('tokenInput');
    if (!input) return;
    const address = input.value.trim().toLowerCase();
    tokenMeta = null;
    resetReview('Reward token changed. FORGE is re-checking it on-chain.');
    if (!isAddress(address)) {
      tokenStatus('Paste a valid ERC-20 reward token contract.','warn');
      return;
    }
    tokenStatus(`Reading reward token directly from ${TESTNET.name}…`);
    try {
      const provider = readProvider();
      const code = await provider.getCode(address);
      if (!code || code === '0x') throw new Error(`No contract code found at this address on ${TESTNET.name}.`);
      const c = new ethers.Contract(address,ERC20_ABI,provider);
      const [name,symbolRaw,decimalsRaw,walletAddr] = await Promise.all([
        c.name().catch(()=>''),c.symbol(),c.decimals(),connectedWallet()
      ]);
      const decimals = Number(decimalsRaw);
      const symbol = String(symbolRaw||'').trim().replace(/[^a-zA-Z0-9_$.-]/g,'').slice(0,16);
      if (!symbol || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error('Token metadata is not supported.');
      let walletBalance = null;
      if (walletAddr) walletBalance = BigInt(await c.balanceOf(walletAddr));
      tokenMeta = {address,name:String(name||''),symbol,decimals,wallet:walletAddr,walletBalance};
      const expectedSymbol = String(packageData?.reward?.symbol || '');
      const expectedDecimals = Number(packageData?.reward?.decimals);
      if (packageData && decimals !== expectedDecimals) {
        tokenStatus(`Decimals mismatch: package=${expectedDecimals}, token=${decimals}. Deployment is blocked.`,'error');
      } else if (packageData && symbol !== expectedSymbol) {
        tokenStatus(`Symbol mismatch: package=${expectedSymbol}, token=${symbol}. Deployment is blocked to avoid rewarding the wrong asset.`,'error');
      } else {
        const bal = walletBalance == null ? '' : ` · connected wallet balance ${ethers.formatUnits(walletBalance,decimals)} ${symbol}`;
        tokenStatus(`On-chain token verified ✓ ${symbol} · ${decimals} decimals · ${short(address)}${bal}`,'ok');
      }
    } catch (e) {
      tokenMeta = null;
      tokenStatus(e?.shortMessage || e?.message || 'Could not verify reward token.','error');
    }
    refreshReview();
  }

  async function readPackage(file) {
    packageData = null;
    tokenMeta = null;
    resetReview('New package loaded. Review will unlock after FORGE verifies all claims and the reward token.');
    if (!file) { refreshReview(); return; }
    try {
      packageData = JSON.parse(await file.text());
      const packagedToken = String(packageData?.reward?.contract || '').toLowerCase();
      if (isAddress(packagedToken) && $('tokenInput')) {
        $('tokenInput').value = packagedToken;
        $('tokenInput').dispatchEvent(new Event('input',{bubbles:true}));
      }
    } catch {
      packageData = null;
    }
    setTimeout(refreshReview,120);
  }

  function hydrateTokenFromContext() {
    const input = $('tokenInput');
    if (!input || input.value.trim()) return;
    const p = new URLSearchParams(location.search);
    let value = p.get('rewardToken') || '';
    if (!value) {
      try { value = JSON.parse(localStorage.getItem('totz_forge_reward_token_v1') || '{}').address || ''; } catch {}
    }
    if (isAddress(value)) {
      input.value = value.toLowerCase();
      input.dispatchEvent(new Event('input',{bubbles:true}));
      input.dispatchEvent(new Event('change',{bubbles:true}));
    }
  }

  function install() {
    const form = document.querySelector('#tokenInput')?.closest('.formgrid');
    const deployBtn = $('deployBtn');
    if (!form || !deployBtn || $('finalReviewCard')) return;

    const style = document.createElement('style');
    style.textContent = `.launcher-token-status{grid-column:1/-1}.final-review{margin-top:14px;border:2px solid var(--ink);border-radius:21px;padding:16px;background:#FFFDF8}.final-review h3{margin:0;font-size:1.15rem}.final-review>p{margin:3px 0 12px;color:var(--soft);font-size:.7rem;font-weight:800}.review-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}.review-cell{background:var(--cream);border-radius:13px;padding:9px;min-width:0}.review-cell small{display:block;color:var(--soft);font-size:.5rem;font-weight:900}.review-cell b{display:block;margin-top:3px;font-size:.68rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.review-cell.root-cell{grid-column:1/-1}.review-cell.root-cell b{white-space:normal;word-break:break-all;font-family:monospace;font-size:.62rem}.immutable-warning{margin-top:10px;background:#FFDEDA;color:#7B2A20;border-radius:13px;padding:10px 12px;font-size:.68rem;font-weight:900}.review-ack{display:flex;align-items:flex-start;gap:9px;margin-top:11px;padding:10px 12px;border-radius:13px;background:var(--mint);font-size:.7rem;font-weight:900}.review-ack input{width:18px;height:18px;margin-top:1px;accent-color:var(--ink)}@media(max-width:900px){.review-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:650px){.review-grid{grid-template-columns:1fr}.review-cell.root-cell{grid-column:auto}}`;
    document.head.appendChild(style);

    const tokenField = $('tokenInput').closest('.field');
    const tokenNote = document.createElement('div');
    tokenNote.id = 'launcherTokenStatus';
    tokenNote.className = 'status show warn launcher-token-status';
    tokenNote.textContent = 'FORGE will verify the reward token on-chain and compare its symbol and decimals with the package.';
    tokenField.appendChild(tokenNote);

    const card = document.createElement('div');
    card.id = 'finalReviewCard';
    card.className = 'final-review';
    card.innerHTML = `<h3>🔎 Final immutable review</h3><p>One last check before MetaMask. These values are the exact parameters that the claim contract will lock.</p><div class="review-grid"><div id="reviewCollection" class="review-cell"></div><div id="reviewSource" class="review-cell"></div><div id="reviewBlock" class="review-cell"></div><div id="reviewEligible" class="review-cell"></div><div id="reviewPool" class="review-cell"></div><div id="reviewToken" class="review-cell"></div><div id="reviewRewardNetwork" class="review-cell"></div><div id="reviewSponsor" class="review-cell"></div><div id="reviewDeadline" class="review-cell"></div><div id="reviewRoot" class="review-cell root-cell"></div></div><div class="immutable-warning">⚠️ After deployment, the Merkle root, reward token, total allocation, deadline and sponsor cannot be changed.</div><label class="review-ack"><input id="reviewAck" type="checkbox" disabled><span>I reviewed these immutable settings and want to deploy this exact claim contract.</span></label><div id="finalReviewStatus" class="status show warn">Load and verify a package first.</div>`;
    form.insertAdjacentElement('afterend',card);

    const fileInput = $('fileInput');
    fileInput?.addEventListener('change',()=>readPackage(fileInput.files?.[0]));
    if (fileInput?.files?.[0]) readPackage(fileInput.files[0]);

    $('tokenInput').addEventListener('input',()=>{
      tokenMeta = null;
      resetReview('Reward token changed. FORGE must verify it again.');
      clearTimeout(tokenVerifyTimer);
      if (isAddress($('tokenInput').value.trim())) tokenVerifyTimer = setTimeout(verifyToken,350);
    });
    $('tokenInput').addEventListener('change',()=>{ if (isAddress($('tokenInput').value.trim())) verifyToken(); });
    $('sponsorInput').addEventListener('input',()=>resetReview());
    $('deadlineInput').addEventListener('input',()=>resetReview());
    $('reviewAck').addEventListener('change',e=>{reviewConfirmed=Boolean(e.target.checked)&&canReview();refreshReview();});

    deployBtn.addEventListener('click',e=>{
      if (!canDeploy()) {
        e.preventDefault();e.stopImmediatePropagation();
        reviewStatus('Deployment is locked until the package, reward token, sponsor and deadline are verified and the final review is confirmed.','error');
        $('finalReviewCard').scrollIntoView({behavior:'smooth',block:'center'});
        return;
      }
      deploymentStarted = true;
      deployBtn.disabled = true;
      deployBtn.textContent = 'DEPLOYING…';
      reviewStatus('Final review locked ✓ Waiting for the wallet deployment transaction.','ok');
    },true);

    const verifyObserver = new MutationObserver(()=>setTimeout(refreshReview,0));
    if ($('verifyStatus')) verifyObserver.observe($('verifyStatus'),{attributes:true,childList:true,subtree:true});
    const deployObserver = new MutationObserver(()=>{
      const text = String($('deployStatus')?.textContent || '').toLowerCase();
      if (text.includes('deployed and verified')) {
        deploymentStarted = true;
        deployBtn.disabled = true;
        deployBtn.textContent = 'DEPLOYED ✓';
      } else if (deploymentStarted && (text.includes('failed') || text.includes('rejected') || text.includes('mismatch') || text.includes('error'))) {
        deploymentStarted = false;
        reviewConfirmed = false;
        if ($('reviewAck')) $('reviewAck').checked = false;
        refreshReview();
      }
    });
    if ($('deployStatus')) deployObserver.observe($('deployStatus'),{attributes:true,childList:true,subtree:true});

    if (window.ethereum?.on) window.ethereum.on('accountsChanged',async()=>{
      if (isAddress($('tokenInput').value.trim())) await verifyToken();
      resetReview('Connected wallet changed. Reconfirm the sponsor and immutable review.');
    });

    hydrateTokenFromContext();
    setInterval(()=>{ if (!deploymentStarted) refreshReview(); },1200);
    refreshReview();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install);
  else install();
})();
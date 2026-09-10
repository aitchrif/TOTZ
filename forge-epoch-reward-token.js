(() => {
  const RUNTIME = window.TOTZ_FORGE_CONFIG || {};
  const REWARD_NETWORK = RUNTIME.claimNetwork || {
    chainId: 46630,
    hex: '0xb626',
    name: 'Robinhood Chain Testnet',
    rpc: 'https://rpc.testnet.chain.robinhood.com',
    explorer: 'https://explorer.testnet.chain.robinhood.com'
  };
  const ERC20_ABI = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function balanceOf(address) view returns (uint256)'
  ];
  const PREVIEW_SYMBOL = 'UNITS';
  const PREVIEW_DECIMALS = 6;
  const $ = id => document.getElementById(id);
  const isAddress = v => /^0x[a-fA-F0-9]{40}$/.test(String(v || ''));
  const short = a => a ? `${a.slice(0,6)}…${a.slice(-4)}` : '—';

  let verifiedAddress = null;
  let tokenMeta = null;
  let detecting = false;
  let detectTimer = null;

  function readProvider() {
    return window.ForgeRuntime?.createReadProvider
      ? window.ForgeRuntime.createReadProvider()
      : new ethers.JsonRpcProvider(REWARD_NETWORK.rpc, REWARD_NETWORK.chainId, { staticNetwork:true });
  }

  function tokenReady() {
    const current = $('rewardTokenInput')?.value.trim().toLowerCase();
    return Boolean(tokenMeta && verifiedAddress && current === verifiedAddress);
  }

  function setTokenStatus(message, type='warn') {
    const el = $('rewardTokenStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `status show ${type}`;
  }

  function setDeliveryStatus(message, type='warn') {
    const el = $('deliveryStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `status show ${type}`;
  }

  function ensureDecimalOption(value) {
    const select = $('decimals');
    if (!select) return;
    const v = String(value);
    if (![...select.options].some(o => o.value === v)) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = `${v} decimals · detected on-chain`;
      select.appendChild(o);
    }
    select.value = v;
  }

  function usePreviewUnits() {
    if ($('symbol')) {
      $('symbol').value = PREVIEW_SYMBOL;
      $('symbol').readOnly = true;
    }
    if ($('decimals')) {
      ensureDecimalOption(PREVIEW_DECIMALS);
      $('decimals').disabled = true;
    }
  }

  function hideStaleDistribution() {
    if ($('results')) $('results').hidden = true;
    if ($('delivery')) $('delivery').hidden = true;
    if ($('merkleResult')) $('merkleResult').hidden = true;
  }

  function updateLauncherLink() {
    const link = [...document.querySelectorAll('a[href^="/forge/claim-launcher"],a[href^="/forge-claim-launcher"]')][0];
    if (!link) return;
    link.href = tokenReady()
      ? `/forge/claim-launcher?rewardToken=${encodeURIComponent(verifiedAddress)}`
      : '/forge/claim-launcher';
  }

  function snapshotReady() {
    const snap = $('snapshot');
    return Boolean(snap && !snap.hidden);
  }

  function updateBuildGate() {
    const build = $('buildBtn');
    if (!build) return;
    build.disabled = !snapshotReady();
    build.title = snapshotReady() ? '' : 'Load a source snapshot first';
    if ($('pool')) $('pool').disabled = false;
  }

  function currentPoolUnits() {
    if (!tokenMeta) return null;
    const raw = String($('pool')?.value || '').trim();
    if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
    try { return ethers.parseUnits(raw, tokenMeta.decimals); } catch { return null; }
  }

  function renderMeta() {
    const box = $('rewardTokenMeta');
    if (!box) return;
    if (!tokenMeta) {
      box.hidden = true;
      return;
    }
    const poolUnits = currentPoolUnits();
    const enough = tokenMeta.walletBalance == null || poolUnits == null ? null : tokenMeta.walletBalance >= poolUnits;
    const balanceText = tokenMeta.walletBalance == null
      ? 'Connect wallet to read balance'
      : `${ethers.formatUnits(tokenMeta.walletBalance, tokenMeta.decimals)} ${tokenMeta.symbol}`;
    box.hidden = false;
    box.innerHTML = `<div><small>TOKEN</small><b>${tokenMeta.symbol}</b></div><div><small>DECIMALS</small><b>${tokenMeta.decimals}</b></div><div><small>REWARD NETWORK</small><b>${REWARD_NETWORK.name} · ${REWARD_NETWORK.chainId}</b></div><div><small>WALLET BALANCE</small><b>${balanceText}</b></div>${enough === false ? '<div class="token-balance-warning">Wallet balance is below the current reward pool.</div>' : ''}`;
  }

  async function connectedWallet() {
    if (!window.ethereum?.request) return null;
    try {
      const accounts = await window.ethereum.request({method:'eth_accounts'});
      return accounts?.[0] ? String(accounts[0]).toLowerCase() : null;
    } catch { return null; }
  }

  async function detectToken({quiet=false}={}) {
    const input = $('rewardTokenInput');
    if (!input || detecting) return;
    const address = input.value.trim().toLowerCase();
    if (!isAddress(address)) {
      verifiedAddress = null;
      tokenMeta = null;
      renderMeta();
      updateLauncherLink();
      updateBuildGate();
      if (!quiet) {
        setTokenStatus(`Reward token is optional for preview. Leave this blank and build the epoch now, or paste an ERC-20 contract on ${REWARD_NETWORK.name} when you are ready to deliver rewards.`, 'warn');
      }
      return;
    }

    detecting = true;
    const btn = $('verifyRewardTokenBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'CHECKING…'; }
    setTokenStatus(`Reading token metadata directly from ${REWARD_NETWORK.name}…`);

    try {
      const provider = readProvider();
      const code = await provider.getCode(address);
      if (!code || code === '0x') throw new Error(`No contract code found at this address on ${REWARD_NETWORK.name}.`);
      const contract = new ethers.Contract(address, ERC20_ABI, provider);
      const [name, symbolRaw, decimalsRaw, walletAddr] = await Promise.all([
        contract.name().catch(() => ''),
        contract.symbol(),
        contract.decimals(),
        connectedWallet()
      ]);
      const decimals = Number(decimalsRaw);
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error(`Unsupported token decimals: ${decimals}.`);
      const symbol = String(symbolRaw || '').trim().replace(/[^a-zA-Z0-9_$.-]/g,'').slice(0,16);
      if (!symbol) throw new Error('Token symbol could not be read safely.');
      let walletBalance = null;
      if (walletAddr) walletBalance = BigInt(await contract.balanceOf(walletAddr));

      tokenMeta = {address, name:String(name || ''), symbol, decimals, wallet:walletAddr, walletBalance};
      verifiedAddress = address;
      if ($('symbol')) {
        $('symbol').value = symbol;
        $('symbol').readOnly = true;
      }
      if ($('decimals')) {
        ensureDecimalOption(decimals);
        $('decimals').disabled = true;
      }
      renderMeta();
      updateLauncherLink();
      updateBuildGate();
      try {
        localStorage.setItem('totz_forge_reward_token_v1', JSON.stringify({
          address,
          symbol,
          decimals,
          chainId:REWARD_NETWORK.chainId,
          chainName:REWARD_NETWORK.name,
          verifiedAt:new Date().toISOString()
        }));
      } catch {}
      setTokenStatus(`Reward token verified ✓ ${symbol} · ${decimals} decimals · ${short(address)}. Rebuild the epoch with this token before preparing delivery.`, 'ok');
    } catch (e) {
      verifiedAddress = null;
      tokenMeta = null;
      usePreviewUnits();
      updateLauncherLink();
      renderMeta();
      updateBuildGate();
      setTokenStatus(`${e?.shortMessage || e?.message || 'Could not verify this reward token.'} You can still build a preview without a token.`, 'error');
    } finally {
      detecting = false;
      if (btn) { btn.disabled = false; btn.textContent = 'VERIFY TOKEN'; }
    }
  }

  function resetTokenVerification() {
    const value = $('rewardTokenInput')?.value.trim().toLowerCase();
    if (value === verifiedAddress) return;
    const hadVerifiedToken = Boolean(verifiedAddress || tokenMeta);
    verifiedAddress = null;
    tokenMeta = null;
    renderMeta();
    updateLauncherLink();
    usePreviewUnits();
    updateBuildGate();
    if (hadVerifiedToken || ($('results') && !$('results').hidden)) hideStaleDistribution();
    setTokenStatus('Reward token is optional for preview. If you change or add a token, rebuild the epoch before delivery so exact token units stay correct.', 'warn');
  }

  function guardBuild() {
    if (tokenReady()) {
      $('symbol').value = tokenMeta.symbol;
      ensureDecimalOption(tokenMeta.decimals);
      setTokenStatus(`Using verified reward token ${tokenMeta.symbol} for exact allocation units.`, 'ok');
      return;
    }
    usePreviewUnits();
    setTokenStatus('Preview mode · no reward token selected. The holder allocation can be built now in neutral UNITS. Verify an ERC-20 token and rebuild before Direct Drop or Merkle Claim delivery.', 'warn');
  }

  function focusRewardToken() {
    const input = $('rewardTokenInput');
    input?.scrollIntoView({behavior:'smooth', block:'center'});
    setTimeout(() => input?.focus(), 350);
  }

  function guardDelivery(event) {
    if (tokenReady()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setDeliveryStatus('Delivery needs a verified ERC-20 reward token. Your allocation preview is safe — choose the token above, verify it, then rebuild the epoch for exact token units.', 'warn');
    setTokenStatus('Choose and verify the ERC-20 token you want holders to receive. The token is required only for delivery, not for previewing the allocation.', 'warn');
    focusRewardToken();
  }

  function announceDeliveryRequirement() {
    const delivery = $('delivery');
    if (!delivery || delivery.hidden || tokenReady()) return;
    setDeliveryStatus('Preview ready. To prepare Direct Drop or Merkle Claim delivery, choose and verify an ERC-20 reward token above, then rebuild once.', 'warn');
  }

  function installDeliveryGuards() {
    ['copyBatchBtn','exportBatchBtn','generateMerkleBtn'].forEach(id => {
      $(id)?.addEventListener('click', guardDelivery, true);
    });
    const launcher = [...document.querySelectorAll('a[href^="/forge/claim-launcher"],a[href^="/forge-claim-launcher"]')][0];
    launcher?.addEventListener('click', guardDelivery, true);
    const delivery = $('delivery');
    if (delivery) new MutationObserver(announceDeliveryRequirement).observe(delivery,{attributes:true,attributeFilter:['hidden']});
  }

  function install() {
    const pool = $('pool');
    const symbol = $('symbol');
    const decimals = $('decimals');
    if (!pool || !symbol || !decimals || $('rewardTokenInput')) return;
    const fields = pool.closest('.fields');
    if (!fields) return;

    const symbolField = symbol.closest('.field');
    const decimalsField = decimals.closest('.field');
    if (symbolField) symbolField.classList.add('token-internal-field');
    if (decimalsField) decimalsField.classList.add('token-internal-field');

    const poolField = pool.closest('.field');
    const poolLabel = poolField?.querySelector('label');
    if (poolLabel) poolLabel.textContent = '2 · Reward amount';

    const style = document.createElement('style');
    style.textContent = `.token-address-row{display:grid;grid-template-columns:1fr auto;gap:8px}.token-address-row .btn{padding:10px 14px}.reward-token-meta{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:2px}.reward-token-meta[hidden]{display:none!important}.reward-token-meta>div{background:var(--mint);border-radius:13px;padding:9px;min-width:0}.reward-token-meta small{display:block;color:var(--soft);font-size:.52rem;font-weight:900}.reward-token-meta b{display:block;margin-top:3px;font-size:.7rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.reward-token-meta .token-balance-warning{grid-column:1/-1;background:#FFF0C9;color:#8A6410;font-weight:900;font-size:.65rem}.token-internal-field{display:none!important}.reward-token-step{margin-bottom:2px}.reward-token-step label{font-size:.61rem}.reward-token-help{grid-column:1/-1;border:1px dashed var(--sky2);border-radius:14px;padding:9px 11px;background:#F7FCFD;color:var(--soft);font-size:.63rem;font-weight:800;line-height:1.45}.reward-token-guide{grid-column:1/-1;border:2px solid var(--sky2);border-radius:16px;padding:12px;background:#fff}.reward-token-guide-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.reward-token-guide-head b{font-family:'Baloo 2',cursive;font-size:.82rem;color:var(--ink)}.reward-token-guide-head span{background:var(--lime);color:var(--ink);border-radius:999px;padding:4px 7px;font-size:.5rem;font-weight:900;white-space:nowrap}.reward-token-guide-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.reward-token-guide-item{background:var(--cream);border-radius:12px;padding:9px}.reward-token-guide-item b{display:block;color:var(--ink);font-size:.62rem}.reward-token-guide-item span{display:block;color:var(--soft);font-size:.56rem;font-weight:800;line-height:1.35;margin-top:2px}.reward-token-guide-warning{margin-top:8px;background:#FFF0C9;border-radius:11px;padding:8px 9px;color:#765616;font-size:.57rem;font-weight:900;line-height:1.4}@media(max-width:650px){.token-address-row{grid-template-columns:1fr}.reward-token-meta{grid-template-columns:1fr 1fr}.reward-token-guide-grid{grid-template-columns:1fr}}`;
    document.head.appendChild(style);

    const field = document.createElement('div');
    field.className = 'field full reward-token-step';
    field.innerHTML = `<label>1 · Reward token · optional for preview · ${REWARD_NETWORK.name}</label><div class="token-address-row"><input id="rewardTokenInput" placeholder="0x ERC-20 reward token…" spellcheck="false"><button id="verifyRewardTokenBtn" class="btn soft" type="button">VERIFY TOKEN</button></div><div id="rewardTokenStatus" class="status show warn">Reward token is optional for preview. Build the holder allocation now; add and verify the ERC-20 token only when you are ready to deliver rewards.</div><div class="reward-token-guide"><div class="reward-token-guide-head"><b>❓ Where do I get a reward token?</b><span>ERC-20 CONTRACT</span></div><div class="reward-token-guide-grid"><div class="reward-token-guide-item"><b>🪙 Your project token</b><span>Use the official ERC-20 contract for your own project token.</span></div><div class="reward-token-guide-item"><b>💵 Stablecoin</b><span>Use the official contract for a supported stablecoin such as USDC or USDG.</span></div><div class="reward-token-guide-item"><b>🤝 Partner token</b><span>Reward holders with an ERC-20 from a partner project using its official contract.</span></div></div><div class="reward-token-guide-warning">⚠️ The reward token must exist on <b>${REWARD_NETWORK.name}</b>. Copy the contract only from the token project's official website/docs or a verified block explorer entry. Never paste a random contract from a post or search result.</div></div><div class="reward-token-help">No token yet? That is fine. EPOCHS will use neutral <b>UNITS</b> for the preview. Before Direct Drop or Merkle Claim, verify the real reward token and rebuild once so symbol, decimals and exact smallest units are locked on-chain.</div><div id="rewardTokenMeta" class="reward-token-meta" hidden></div>`;
    fields.insertBefore(field, fields.firstChild);

    usePreviewUnits();
    pool.disabled = false;
    if ($('buildBtn')) $('buildBtn').disabled = !snapshotReady();

    $('verifyRewardTokenBtn').addEventListener('click', () => detectToken());
    $('rewardTokenInput').addEventListener('input', () => {
      resetTokenVerification();
      clearTimeout(detectTimer);
      if (isAddress($('rewardTokenInput').value.trim())) detectTimer = setTimeout(() => detectToken({quiet:true}), 450);
    });
    pool.addEventListener('input', renderMeta);
    $('buildBtn')?.addEventListener('click', guardBuild, true);

    const snap = $('snapshot');
    if (snap) new MutationObserver(updateBuildGate).observe(snap,{attributes:true,attributeFilter:['hidden']});
    installDeliveryGuards();

    if (window.ethereum?.on) window.ethereum.on('accountsChanged', async () => {
      if (verifiedAddress) await detectToken({quiet:true});
    });

    const params = new URLSearchParams(location.search);
    let initial = params.get('rewardToken') || '';
    if (!initial) {
      try {
        const saved = JSON.parse(localStorage.getItem('totz_forge_reward_token_v1') || '{}');
        if (saved?.chainId === REWARD_NETWORK.chainId) initial = saved.address || '';
      } catch {}
    }
    if (isAddress(initial)) {
      $('rewardTokenInput').value = initial.toLowerCase();
      setTimeout(() => detectToken({quiet:true}), 120);
    }
    updateBuildGate();
  }

  window.ForgeEpochRewardToken = {
    isReady: tokenReady,
    getMeta: () => tokenMeta ? {...tokenMeta} : null,
    focus: focusRewardToken
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
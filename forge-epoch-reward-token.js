(() => {
  const TESTNET = {
    chainId: 46630,
    name: 'Robinhood Chain Testnet',
    rpc: 'https://rpc.testnet.chain.robinhood.com'
  };
  const ERC20_ABI = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function balanceOf(address) view returns (uint256)'
  ];
  const $ = id => document.getElementById(id);
  const isAddress = v => /^0x[a-fA-F0-9]{40}$/.test(String(v || ''));
  const short = a => a ? `${a.slice(0,6)}…${a.slice(-4)}` : '—';
  let verifiedAddress = null;
  let tokenMeta = null;
  let detecting = false;
  let detectTimer = null;

  function setTokenStatus(message, type='warn') {
    const el = $('rewardTokenStatus');
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

  function hideStaleDistribution() {
    if ($('results')) $('results').hidden = true;
    if ($('delivery')) $('delivery').hidden = true;
    if ($('merkleResult')) $('merkleResult').hidden = true;
  }

  function updateLauncherLink() {
    const link = [...document.querySelectorAll('a[href^="/forge-claim-launcher"]')][0];
    if (!link) return;
    link.href = verifiedAddress ? `/forge-claim-launcher?rewardToken=${encodeURIComponent(verifiedAddress)}` : '/forge-claim-launcher';
  }

  function snapshotReady() {
    const snap = $('snapshot');
    return Boolean(snap && !snap.hidden);
  }

  function updateBuildGate() {
    const build = $('buildBtn');
    if (!build) return;
    const current = $('rewardTokenInput')?.value.trim().toLowerCase();
    const tokenReady = Boolean(tokenMeta && verifiedAddress && current === verifiedAddress);
    build.disabled = !(tokenReady && snapshotReady());
    build.title = !tokenReady ? 'Verify the reward token first' : !snapshotReady() ? 'Load a source snapshot first' : '';
    if ($('pool')) $('pool').disabled = !tokenReady;
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
    const balanceText = tokenMeta.walletBalance == null ? 'Connect wallet to read balance' : `${ethers.formatUnits(tokenMeta.walletBalance, tokenMeta.decimals)} ${tokenMeta.symbol}`;
    box.hidden = false;
    box.innerHTML = `<div><small>TOKEN</small><b>${tokenMeta.symbol}</b></div><div><small>DECIMALS</small><b>${tokenMeta.decimals}</b></div><div><small>REWARD NETWORK</small><b>Robinhood Testnet · 46630</b></div><div><small>WALLET BALANCE</small><b>${balanceText}</b></div>${enough === false ? '<div class="token-balance-warning">Wallet balance is below the current reward pool.</div>' : ''}`;
  }

  async function connectedWallet() {
    if (!window.ethereum?.request) return null;
    try {
      const a = await window.ethereum.request({method:'eth_accounts'});
      return a?.[0] ? String(a[0]).toLowerCase() : null;
    } catch { return null; }
  }

  async function detectToken({quiet=false}={}) {
    const input = $('rewardTokenInput');
    if (!input || detecting) return;
    const address = input.value.trim().toLowerCase();
    if (!isAddress(address)) {
      verifiedAddress = null;
      tokenMeta = null;
      updateLauncherLink();
      renderMeta();
      updateBuildGate();
      if (!quiet) setTokenStatus('Paste a valid ERC-20 reward token contract on Robinhood Chain Testnet.', 'warn');
      return;
    }
    detecting = true;
    const btn = $('verifyRewardTokenBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'CHECKING…'; }
    setTokenStatus('Reading token metadata directly from Robinhood Chain Testnet…');
    try {
      const provider = new ethers.JsonRpcProvider(TESTNET.rpc, TESTNET.chainId);
      const code = await provider.getCode(address);
      if (!code || code === '0x') throw new Error('No contract code found at this address on Robinhood Chain Testnet.');
      const c = new ethers.Contract(address, ERC20_ABI, provider);
      const [name, symbolRaw, decimalsRaw, walletAddr] = await Promise.all([
        c.name().catch(() => ''),
        c.symbol(),
        c.decimals(),
        connectedWallet()
      ]);
      const decimals = Number(decimalsRaw);
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error(`Unsupported token decimals: ${decimals}.`);
      const symbol = String(symbolRaw || '').trim().replace(/[^a-zA-Z0-9_$.-]/g,'').slice(0,16);
      if (!symbol) throw new Error('Token symbol could not be read safely.');
      let walletBalance = null;
      if (walletAddr) walletBalance = BigInt(await c.balanceOf(walletAddr));

      tokenMeta = {address, name:String(name||''), symbol, decimals, wallet:walletAddr, walletBalance};
      verifiedAddress = address;
      if ($('symbol')) { $('symbol').value = symbol; $('symbol').readOnly = true; }
      if ($('decimals')) { ensureDecimalOption(decimals); $('decimals').disabled = true; }
      renderMeta();
      updateLauncherLink();
      updateBuildGate();
      try {
        localStorage.setItem('totz_forge_reward_token_v1', JSON.stringify({address, symbol, decimals, chainId:TESTNET.chainId, chainName:TESTNET.name, verifiedAt:new Date().toISOString()}));
      } catch {}
      setTokenStatus(`On-chain token verified ✓ ${symbol} · ${decimals} decimals · ${short(address)}. Units are locked to the contract.`, 'ok');
    } catch (e) {
      verifiedAddress = null;
      tokenMeta = null;
      updateLauncherLink();
      renderMeta();
      updateBuildGate();
      setTokenStatus(e?.shortMessage || e?.message || 'Could not verify this reward token.', 'error');
    } finally {
      detecting = false;
      if (btn) { btn.disabled = false; btn.textContent = 'VERIFY TOKEN'; }
    }
  }

  function resetTokenVerification() {
    const value = $('rewardTokenInput')?.value.trim().toLowerCase();
    if (value === verifiedAddress) return;
    verifiedAddress = null;
    tokenMeta = null;
    updateLauncherLink();
    renderMeta();
    hideStaleDistribution();
    if ($('symbol')) { $('symbol').value = ''; $('symbol').readOnly = true; }
    if ($('decimals')) $('decimals').disabled = true;
    updateBuildGate();
    setTokenStatus('Reward token changed. FORGE must verify it on-chain before the distribution can be built.', 'warn');
  }

  function guardBuild(e) {
    const input = $('rewardTokenInput');
    const current = input?.value.trim().toLowerCase();
    if (!verifiedAddress || current !== verifiedAddress || !tokenMeta) {
      e.preventDefault();
      e.stopImmediatePropagation();
      setTokenStatus('Verify the reward token first. FORGE reads symbol and decimals on-chain so the allocation cannot use the wrong units.', 'error');
      input?.scrollIntoView({behavior:'smooth', block:'center'});
      return;
    }
    $('symbol').value = tokenMeta.symbol;
    ensureDecimalOption(tokenMeta.decimals);
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
    if (poolLabel) poolLabel.textContent = 'Reward amount';

    const style = document.createElement('style');
    style.textContent = `.token-address-row{display:grid;grid-template-columns:1fr auto;gap:8px}.token-address-row .btn{padding:10px 14px}.reward-token-meta{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:2px}.reward-token-meta[hidden]{display:none!important}.reward-token-meta>div{background:var(--mint);border-radius:13px;padding:9px;min-width:0}.reward-token-meta small{display:block;color:var(--soft);font-size:.52rem;font-weight:900}.reward-token-meta b{display:block;margin-top:3px;font-size:.7rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.reward-token-meta .token-balance-warning{grid-column:1/-1;background:#FFF0C9;color:#8A6410;font-weight:900;font-size:.65rem}.token-internal-field{display:none!important}.reward-token-step{margin-bottom:2px}.reward-token-step label{font-size:.61rem}@media(max-width:650px){.token-address-row{grid-template-columns:1fr}.reward-token-meta{grid-template-columns:1fr 1fr}}`;
    document.head.appendChild(style);

    const field = document.createElement('div');
    field.className = 'field full reward-token-step';
    field.innerHTML = `<label>1 · Reward token contract · Robinhood Chain Testnet</label><div class="token-address-row"><input id="rewardTokenInput" placeholder="0x ERC-20 reward token…" spellcheck="false"><button id="verifyRewardTokenBtn" class="btn soft" type="button">VERIFY TOKEN</button></div><div id="rewardTokenStatus" class="status show warn">Select the reward token first. FORGE reads its symbol and decimals directly on-chain.</div><div id="rewardTokenMeta" class="reward-token-meta" hidden></div>`;
    fields.insertBefore(field, fields.firstChild);

    if (poolLabel) poolLabel.textContent = '2 · Reward amount';
    symbol.value = '';
    symbol.readOnly = true;
    decimals.disabled = true;
    pool.disabled = true;
    if ($('buildBtn')) $('buildBtn').disabled = true;

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

    if (window.ethereum?.on) window.ethereum.on('accountsChanged', async () => {
      if (verifiedAddress) await detectToken({quiet:true});
    });

    const p = new URLSearchParams(location.search);
    let initial = p.get('rewardToken') || '';
    if (!initial) {
      try { initial = JSON.parse(localStorage.getItem('totz_forge_reward_token_v1') || '{}').address || ''; } catch {}
    }
    if (isAddress(initial)) {
      $('rewardTokenInput').value = initial.toLowerCase();
      setTimeout(() => detectToken({quiet:true}), 120);
    }
    updateBuildGate();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
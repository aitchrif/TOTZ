(() => {
  const GENESIS = '0x107c4e7cf931b18e022d40184d03d00b4ec99d5a';
  const $ = (id) => document.getElementById(id);
  const state = { checked: false, genesis: false, wallet: null, balance: 0 };
  window.__totzForgeAccess = state;

  function short(address) { return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '—'; }
  function toast(message) {
    const el = $('toast');
    if (!el) return alert(message);
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 2200);
  }
  function promptGenesis() {
    toast('TOTZ Genesis unlocks this FORGE feature. Connect a holder wallet to continue.');
    $('accessCard')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function emit() {
    applyGate();
    window.dispatchEvent(new CustomEvent('totz-forge-access', { detail: { ...state } }));
  }

  function installStyle() {
    if (document.getElementById('forge-access-style')) return;
    const style = document.createElement('style');
    style.id = 'forge-access-style';
    style.textContent = `
      .forge-access-legend{margin-top:9px;display:flex;gap:7px;flex-wrap:wrap;color:var(--soft,#5B5270);font-size:.64rem;font-weight:900}
      .forge-access-legend span{padding:6px 9px;border-radius:999px;background:var(--cream,#FFF3DC)}
      .forge-access-legend .genesis{background:var(--ink,#2B2140);color:#fff}
      .forge-history-period.locked{opacity:.45;cursor:not-allowed!important}
      .forge-premium-control.locked{opacity:.62}
      .forge-genesis-locked{opacity:.35;filter:saturate(.55)}
      .forge-genesis-lockbar{display:flex;align-items:center;justify-content:space-between;gap:9px;margin:8px 0 0;padding:8px 10px;border-radius:13px;background:rgba(43,33,64,.06);color:var(--soft,#5B5270);font-size:.62rem;font-weight:900}
      .forge-genesis-lockbar b{color:var(--ink,#2B2140)}
      .access-card .access-benefits{margin-top:7px!important;color:#e9e4ef!important;font-size:.68rem!important}
      .access-card.unlocked .access-benefits{color:#edf8e8!important}
    `;
    document.head.appendChild(style);
  }

  function updateAccessCard() {
    const card = $('accessCard');
    if (!card) return;
    const copy = card.querySelector('div:first-child p');
    const desiredCopy = state.genesis
      ? `Genesis verified. Advanced FORGE tools are unlocked for this wallet.<br><span class="access-benefits">7D / 30D history · advanced deltas · filtered exports · Copy Wallets</span>`
      : `X-RAY core stays free for everyone. Genesis holders unlock the advanced operator tools.<br><span class="access-benefits">7D / 30D history · advanced deltas · filtered exports · Copy Wallets</span>`;
    if (copy && copy.innerHTML !== desiredCopy) copy.innerHTML = desiredCopy;

    const title = $('accessTitle');
    const sub = $('accessSub');
    if (state.genesis) {
      card.classList.add('unlocked');
      if (title && title.textContent !== 'GENESIS ACCESS ✓') title.textContent = 'GENESIS ACCESS ✓';
      const text = `${state.balance} TOTZ Genesis · advanced tools unlocked`;
      if (sub && sub.textContent !== text) sub.textContent = text;
    } else if (state.checked) {
      card.classList.remove('unlocked');
      if (title && title.textContent !== 'FREE MODE') title.textContent = 'FREE MODE';
      const text = `${short(state.wallet)} · core X-RAY active`;
      if (sub && sub.textContent !== text) sub.textContent = text;
    } else {
      card.classList.remove('unlocked');
      if (title && title.textContent !== 'FREE MODE') title.textContent = 'FREE MODE';
      if (sub && sub.textContent !== 'Connect wallet to check Genesis access') sub.textContent = 'Connect wallet to check Genesis access';
    }
  }

  function installLegend() {
    const tools = document.querySelector('.table-tools');
    if (!tools || document.querySelector('.forge-access-legend')) return;
    const legend = document.createElement('div');
    legend.className = 'forge-access-legend';
    legend.innerHTML = '<span>FREE · scan, stats, search, wallet lookup, basic CSV, 24H</span><span class="genesis">GENESIS · filters, copy wallets, 7D / 30D, advanced compare</span>';
    tools.insertAdjacentElement('afterend', legend);
  }

  function gateExportControls() {
    const select = $('minHoldings');
    if (select) {
      [...select.options].forEach((option) => {
        if (option.value === '1') return;
        option.disabled = !state.genesis;
        const base = option.textContent.replace(/\s*🔒$/,'');
        const desired = state.genesis ? base : `${base} 🔒`;
        if (option.textContent !== desired) option.textContent = desired;
      });
      if (!state.genesis && select.value !== '1') {
        select.value = '1';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      select.classList.add('forge-premium-control');
      select.classList.toggle('locked', !state.genesis);
      select.title = state.genesis ? 'Advanced holder filters unlocked' : 'Genesis required for holdings filters';
    }
    const custom = $('customMin');
    if (custom && !state.genesis) { custom.classList.remove('show'); custom.value = ''; }
    const copy = $('copyBtn');
    if (copy) {
      const desired = state.genesis ? 'COPY WALLETS' : '🔒 COPY WALLETS';
      if (copy.textContent !== desired) copy.textContent = desired;
      copy.classList.toggle('locked', !state.genesis);
      copy.title = state.genesis ? 'Copy the active filtered wallet list' : 'TOTZ Genesis required';
    }
    const exportBtn = $('exportBtn');
    if (exportBtn) exportBtn.title = state.genesis ? 'Export the active filtered snapshot' : 'Free export includes the basic holder snapshot';
  }

  function gateHistory() {
    const periods = document.querySelectorAll('.forge-history-period[data-period]');
    periods.forEach((button) => {
      const premium = button.dataset.period === '7d' || button.dataset.period === '30d';
      if (!premium) return;
      button.classList.toggle('locked', !state.genesis);
      button.setAttribute('aria-disabled', state.genesis ? 'false' : 'true');
      const label = button.dataset.period === '7d' ? '7D' : '30D';
      const desired = state.genesis ? label : `${label} 🔒`;
      if (button.textContent !== desired) button.textContent = desired;
    });

    if (!state.genesis) {
      const premiumActive = document.querySelector('.forge-history-period.active[data-period="7d"],.forge-history-period.active[data-period="30d"]');
      if (premiumActive) document.querySelector('.forge-history-period[data-period="24h"]')?.click();
    }

    const trends = document.querySelector('.forge-history-trends');
    if (!trends) return;
    trends.classList.toggle('forge-genesis-locked', !state.genesis);
    let lockbar = document.getElementById('forgeAdvancedCompareLock');
    if (!state.genesis && !lockbar) {
      lockbar = document.createElement('div');
      lockbar.id = 'forgeAdvancedCompareLock';
      lockbar.className = 'forge-genesis-lockbar';
      lockbar.innerHTML = '<span>🔒 Advanced deltas</span><b>TOTZ Genesis</b>';
      trends.insertAdjacentElement('beforebegin', lockbar);
    }
    if (state.genesis && lockbar) lockbar.remove();
  }

  function applyGate() {
    installStyle();
    updateAccessCard();
    installLegend();
    gateExportControls();
    gateHistory();
  }

  async function checkWallet(wallet) {
    state.wallet = wallet ? String(wallet).toLowerCase() : null;
    state.checked = Boolean(state.wallet);
    state.genesis = false;
    state.balance = 0;
    if (!state.wallet) return emit();
    try {
      const response = await fetch(`/api/forge-holders?chain=robinhood&mode=balance&contract=${GENESIS}&wallet=${encodeURIComponent(state.wallet)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Access check failed');
      state.balance = Number(data.balance || 0);
      state.genesis = state.balance > 0;
    } catch (_) {
      state.genesis = false;
    }
    emit();
  }

  async function refreshFromConnectedWallet() {
    if (!window.ethereum?.request) return emit();
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      const wallet = accounts?.[0] || null;
      if (wallet) {
        const btn = $('connectBtn');
        if (btn) btn.textContent = short(wallet.toLowerCase());
      }
      await checkWallet(wallet);
    } catch (_) { emit(); }
  }

  document.addEventListener('click', (event) => {
    const copy = event.target.closest('#copyBtn');
    if (copy && !state.genesis) {
      event.preventDefault();
      event.stopImmediatePropagation();
      promptGenesis();
      return;
    }
    const period = event.target.closest('.forge-history-period[data-period="7d"],.forge-history-period[data-period="30d"]');
    if (period && !state.genesis) {
      event.preventDefault();
      event.stopImmediatePropagation();
      promptGenesis();
    }
  }, true);

  const connectBtn = $('connectBtn');
  if (connectBtn) {
    connectBtn.addEventListener('click', () => {
      setTimeout(refreshFromConnectedWallet, 450);
      setTimeout(refreshFromConnectedWallet, 1400);
    });
  }

  if (window.ethereum?.on) window.ethereum.on('accountsChanged', (accounts) => checkWallet(accounts?.[0] || null));

  installStyle();
  applyGate();
  refreshFromConnectedWallet();
})();

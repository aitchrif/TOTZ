(() => {
  if (window.__TOTZ_EPOCH_REWARD_PICKER__) return;
  window.__TOTZ_EPOCH_REWARD_PICKER__ = true;

  const PRESETS = Object.freeze({
    usdG: {
      key: 'usdg',
      name: 'USDG',
      address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
      icon: '💵',
      badge: 'RECOMMENDED',
      description: 'Stable USD-denominated reward on Robinhood Chain.'
    },
    weth: {
      key: 'weth',
      name: 'WETH',
      address: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
      icon: 'Ξ',
      badge: 'OFFICIAL',
      description: 'Wrapped ETH reward on Robinhood Chain.'
    }
  });

  const STOCKS_ENDPOINT = '/api/forge-stock-tokens';
  const $ = id => document.getElementById(id);
  const isAddress = value => /^0x[a-fA-F0-9]{40}$/.test(String(value || ''));
  const lower = value => String(value || '').toLowerCase();
  let stockAssets = null;
  let stockLoading = false;

  function installStyles() {
    if ($('forge-reward-picker-style')) return;
    const style = document.createElement('style');
    style.id = 'forge-reward-picker-style';
    style.textContent = `
      .reward-token-step > .reward-token-guide{display:none!important}
      .reward-quick-picks{grid-column:1/-1;margin:0 0 10px}
      .reward-quick-picks-head{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;margin-bottom:8px}
      .reward-quick-picks-head b{font-family:'Baloo 2',cursive;font-size:.9rem}
      .reward-quick-picks-head span{color:var(--soft);font-size:.58rem;font-weight:900}
      .reward-quick-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
      .reward-quick-card{appearance:none;border:2px solid rgba(43,33,64,.08);background:var(--cream);border-radius:16px;padding:11px;text-align:left;color:var(--ink);cursor:pointer;min-width:0;transition:.15s}
      .reward-quick-card:hover{transform:translateY(-1px);border-color:var(--sky2)}
      .reward-quick-card.active{background:#fff;border-color:var(--ink);box-shadow:0 4px 0 rgba(43,33,64,.08)}
      .reward-quick-top{display:flex;justify-content:space-between;align-items:center;gap:6px}
      .reward-quick-icon{font-size:1.05rem;font-weight:900}
      .reward-quick-badge{border-radius:999px;padding:3px 6px;background:var(--lime);font-size:.46rem;font-weight:900;white-space:nowrap}
      .reward-quick-card[data-kind="other"] .reward-quick-badge{background:var(--sky)}
      .reward-quick-card[data-kind="stock"] .reward-quick-badge{background:#F4E8FF}
      .reward-quick-card strong{display:block;font-family:'Baloo 2',cursive;font-size:.83rem;margin-top:5px}
      .reward-quick-card small{display:block;color:var(--soft);font-size:.55rem;font-weight:800;line-height:1.35;margin-top:2px}
      .reward-stock-picker{grid-column:1/-1;margin-top:8px;border:1px solid rgba(43,33,64,.1);background:#fff;border-radius:16px;padding:11px}
      .reward-stock-picker[hidden]{display:none!important}
      .reward-stock-title{display:flex;justify-content:space-between;gap:8px;align-items:center}
      .reward-stock-title b{font-family:'Baloo 2',cursive;font-size:.82rem}
      .reward-stock-title a{font-size:.54rem;font-weight:900;color:var(--soft);text-decoration:underline}
      .reward-stock-note{margin:4px 0 8px;color:var(--soft);font-size:.57rem;font-weight:800;line-height:1.4}
      .reward-stock-search{width:100%;border:2px solid var(--sky2);border-radius:13px;background:var(--cream);padding:9px 11px;color:var(--ink);font-weight:800;outline:0}
      .reward-stock-results{display:grid;gap:6px;margin-top:8px;max-height:240px;overflow:auto}
      .reward-stock-item{display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--cream);border-radius:12px;padding:8px 9px}
      .reward-stock-item b{display:block;font-size:.66rem}
      .reward-stock-item span{display:block;color:var(--soft);font-size:.52rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:360px}
      .reward-stock-use{border:0;border-radius:999px;background:var(--ink);color:#fff;padding:7px 9px;font-size:.54rem;font-weight:900;cursor:pointer;white-space:nowrap}
      .reward-stock-warning{margin-top:8px;background:#FFF0C9;border-radius:11px;padding:8px 9px;color:#765616;font-size:.54rem;font-weight:900;line-height:1.4}
      @media(max-width:820px){.reward-quick-grid{grid-template-columns:1fr 1fr}}
      @media(max-width:520px){.reward-quick-grid{grid-template-columns:1fr}.reward-quick-picks-head{align-items:flex-start;flex-direction:column}.reward-stock-item{align-items:flex-start}.reward-stock-item span{max-width:210px}}
    `;
    document.head.appendChild(style);
  }

  function setActive(kind) {
    document.querySelectorAll('.reward-quick-card').forEach(card => {
      card.classList.toggle('active', card.dataset.kind === kind);
    });
  }

  function syncActiveFromInput() {
    const value = lower($('rewardTokenInput')?.value);
    if (value === lower(PRESETS.usdG.address)) return setActive('usdg');
    if (value === lower(PRESETS.weth.address)) return setActive('weth');
    if (isAddress(value)) return setActive('other');
    setActive('');
  }

  function applyAddress(address, kind) {
    const input = $('rewardTokenInput');
    if (!input || !isAddress(address)) return;
    input.value = address;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    setActive(kind);
    setTimeout(() => $('verifyRewardTokenBtn')?.click(), 80);
  }

  function chooseCustom() {
    setActive('other');
    const stock = $('rewardStockPicker');
    if (stock) stock.hidden = true;
    const input = $('rewardTokenInput');
    input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => input?.focus(), 250);
  }

  async function loadStocks() {
    if (stockAssets || stockLoading) return stockAssets;
    stockLoading = true;
    renderStockResults([], 'Loading official Robinhood Stock Tokens…');
    try {
      const response = await fetch(STOCKS_ENDPOINT, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Could not load Stock Tokens (${response.status}).`);
      stockAssets = Array.isArray(data.assets) ? data.assets : [];
      return stockAssets;
    } catch (error) {
      renderStockResults([], error?.message || 'Could not load official Stock Tokens.');
      return null;
    } finally {
      stockLoading = false;
    }
  }

  function renderStockResults(list, emptyMessage = 'Search by ticker or company name.') {
    const box = $('rewardStockResults');
    if (!box) return;
    if (!list.length) {
      box.innerHTML = `<div class="reward-stock-item"><div><b>${emptyMessage}</b><span>Only Robinhood Chain · chain ID 4663 assets are shown.</span></div></div>`;
      return;
    }
    box.innerHTML = list.slice(0, 40).map(asset => `
      <div class="reward-stock-item">
        <div><b>${String(asset.symbol || '').replace(/[<>]/g, '')}</b><span>${String(asset.name || 'Robinhood Stock Token').replace(/[<>]/g, '')}</span></div>
        <button class="reward-stock-use" type="button" data-stock-address="${asset.address}" data-stock-symbol="${String(asset.symbol || '').replace(/[^a-zA-Z0-9._-]/g, '')}">USE TOKEN</button>
      </div>`).join('');
    box.querySelectorAll('[data-stock-address]').forEach(button => {
      button.addEventListener('click', () => {
        applyAddress(button.dataset.stockAddress, 'stock');
        const picker = $('rewardStockPicker');
        if (picker) picker.hidden = true;
      });
    });
  }

  function filterStocks() {
    const q = lower($('rewardStockSearch')?.value).trim();
    const assets = stockAssets || [];
    if (!q) return renderStockResults(assets.slice(0, 20), assets.length ? '' : 'Search by ticker or company name.');
    const matches = assets.filter(asset => lower(`${asset.symbol} ${asset.name}`).includes(q));
    renderStockResults(matches, 'No official Robinhood Stock Token matched that search.');
  }

  async function chooseStock() {
    setActive('stock');
    const picker = $('rewardStockPicker');
    if (!picker) return;
    picker.hidden = false;
    picker.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const assets = await loadStocks();
    if (assets) filterStocks();
    setTimeout(() => $('rewardStockSearch')?.focus(), 180);
  }

  function install() {
    const input = $('rewardTokenInput');
    const tokenField = input?.closest('.reward-token-step');
    if (!input || !tokenField || $('rewardQuickPicks')) return false;

    installStyles();
    const picks = document.createElement('div');
    picks.id = 'rewardQuickPicks';
    picks.className = 'reward-quick-picks';
    picks.innerHTML = `
      <div class="reward-quick-picks-head"><b>Choose a reward token</b><span>FAST PICKS · ROBINHOOD CHAIN</span></div>
      <div class="reward-quick-grid">
        <button class="reward-quick-card" data-kind="usdg" type="button"><div class="reward-quick-top"><span class="reward-quick-icon">💵</span><span class="reward-quick-badge">RECOMMENDED</span></div><strong>USDG</strong><small>Stable USD-denominated reward. One click fills and verifies the official contract.</small></button>
        <button class="reward-quick-card" data-kind="weth" type="button"><div class="reward-quick-top"><span class="reward-quick-icon">Ξ</span><span class="reward-quick-badge">OFFICIAL</span></div><strong>WETH</strong><small>Wrapped ETH reward. One click fills and verifies the official contract.</small></button>
        <button class="reward-quick-card" data-kind="other" type="button"><div class="reward-quick-top"><span class="reward-quick-icon">＋</span><span class="reward-quick-badge">CUSTOM</span></div><strong>OTHER TOKEN</strong><small>Use your own project token or a partner ERC-20 on Robinhood Chain.</small></button>
        <button class="reward-quick-card" data-kind="stock" type="button"><div class="reward-quick-top"><span class="reward-quick-icon">📈</span><span class="reward-quick-badge">RWA</span></div><strong>STOCK TOKEN</strong><small>Search Robinhood's official Stock Token registry by ticker or company name.</small></button>
      </div>
      <div id="rewardStockPicker" class="reward-stock-picker" hidden>
        <div class="reward-stock-title"><b>📈 Official Robinhood Stock Tokens</b><a href="https://docs.robinhood.com/chain/contracts/" target="_blank" rel="noopener noreferrer">OFFICIAL REGISTRY ↗</a></div>
        <p class="reward-stock-note">Search the official Robinhood asset registry. FORGE only accepts the contract returned for Robinhood Chain (4663), then runs the same on-chain ERC-20 verification.</p>
        <input id="rewardStockSearch" class="reward-stock-search" placeholder="Search AAPL, TSLA, ETF, company name…" autocomplete="off">
        <div id="rewardStockResults" class="reward-stock-results"></div>
        <div class="reward-stock-warning">⚠️ Stock Tokens are tokenized debt securities and can be subject to jurisdiction and recipient eligibility restrictions. The sender is responsible for confirming that the intended distribution is permitted.</div>
      </div>`;

    tokenField.insertBefore(picks, tokenField.firstChild.nextSibling);
    picks.querySelector('[data-kind="usdg"]')?.addEventListener('click', () => applyAddress(PRESETS.usdG.address, 'usdg'));
    picks.querySelector('[data-kind="weth"]')?.addEventListener('click', () => applyAddress(PRESETS.weth.address, 'weth'));
    picks.querySelector('[data-kind="other"]')?.addEventListener('click', chooseCustom);
    picks.querySelector('[data-kind="stock"]')?.addEventListener('click', chooseStock);
    $('rewardStockSearch')?.addEventListener('input', filterStocks);
    input.addEventListener('input', syncActiveFromInput);
    syncActiveFromInput();
    return true;
  }

  function start() {
    if (install()) return;
    const root = document.documentElement || document.body;
    if (!root) return;
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(root, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 12000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

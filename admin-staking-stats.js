(() => {
  const STATS_API = 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/totz-admin-staking-stats';
  let latestStaking = null;

  const htmlEscape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const fmt = (value, digits = 3) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: digits });
  const short = (value) => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '';
  const fmtDateTime = (value) => {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  };

  async function fetchStats(auth, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(STATS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: auth.wallet, timestamp: auth.timestamp, signature: auth.signature }),
        signal: controller.signal,
        cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) throw new Error(data.error || `Request failed (${response.status})`);
      return data.staking;
    } finally {
      clearTimeout(timer);
    }
  }

  function ensurePanel() {
    const area = document.getElementById('adminArea');
    if (!area || document.getElementById('stakingAdminPanel')) return;
    const panel = document.createElement('section');
    panel.id = 'stakingAdminPanel';
    panel.className = 'card admin-staking-panel';
    panel.innerHTML = `
      <div class="staking-panel-head">
        <div>
          <span class="staking-kicker">☁️ LIVE STAKING</span>
          <h2>Staking Overview</h2>
          <p>Live holder activity, wallets and active token details.</p>
        </div>
        <button id="stakingStatsRefresh" class="btn sky" type="button">REFRESH</button>
      </div>
      <div id="stakingSummary" class="staking-summary">
        <div class="staking-stat"><small>ACTIVE STAKERS</small><strong>—</strong></div>
        <div class="staking-stat"><small>NFTs STAKED</small><strong>—</strong></div>
        <div class="staking-stat"><small>SUPPLY STAKED</small><strong>—</strong></div>
        <div class="staking-stat"><small>TOTAL $TOTZ EARNED</small><strong>—</strong></div>
      </div>
      <div class="staking-subline" id="stakingSubline">Waiting for admin data…</div>
      <div class="staking-wallet-head">
        <div><h3>Wallet Details</h3><span id="stakingWalletCount">0 active wallets</span></div>
        <input id="stakingWalletSearch" type="search" placeholder="Search wallet or Token ID">
      </div>
      <div id="stakingWalletList" class="staking-wallet-list"><div class="staking-empty">Loading staking data…</div></div>`;
    area.prepend(panel);

    const refresh = panel.querySelector('#stakingStatsRefresh');
    refresh?.addEventListener('click', () => {
      if (typeof refreshAdmin === 'function') refreshAdmin();
    });
    const search = panel.querySelector('#stakingWalletSearch');
    search?.addEventListener('input', () => renderWallets(latestStaking?.wallets || [], search.value));
  }

  function renderSummary(summary = {}) {
    const root = document.getElementById('stakingSummary');
    if (!root) return;
    const cards = root.querySelectorAll('.staking-stat strong');
    if (cards[0]) cards[0].textContent = fmt(summary.activeStakerWallets, 0);
    if (cards[1]) cards[1].textContent = fmt(summary.activeStakedNfts, 0);
    if (cards[2]) cards[2].textContent = `${fmt(summary.supplyStakedPct, 2)}%`;
    if (cards[3]) cards[3].textContent = fmt(summary.totalEarned, 3);
    const sub = document.getElementById('stakingSubline');
    if (sub) sub.innerHTML = `Current emission <b>${fmt(summary.currentDailyEmission, 3)} $TOTZ/day</b> · Available across wallets <b>${fmt(summary.totalAvailable, 3)} $TOTZ</b> · ${fmt(summary.totalWalletsEverStaked, 0)} wallets have staked since the live-test reset.`;
  }

  function walletMatches(row, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    if (String(row.wallet || '').toLowerCase().includes(q)) return true;
    return (row.tokenIds || []).some((id) => String(id).includes(q.replace(/^#/, '')));
  }

  function renderWallets(rows = [], query = '') {
    const list = document.getElementById('stakingWalletList');
    const count = document.getElementById('stakingWalletCount');
    if (!list) return;
    const filtered = rows.filter((row) => walletMatches(row, query));
    if (count) count.textContent = `${rows.length} active wallet${rows.length === 1 ? '' : 's'}`;
    if (!filtered.length) {
      list.innerHTML = `<div class="staking-empty">${rows.length ? 'No wallet or Token ID matches your search.' : 'No active staking wallets right now.'}</div>`;
      return;
    }
    list.innerHTML = '';
    filtered.forEach((row) => {
      const tokens = Array.isArray(row.tokenIds) ? row.tokenIds : [];
      const item = document.createElement('article');
      item.className = 'staking-wallet-row';
      const tokenChips = tokens.map((id, index) => `<span class="staking-token ${index >= 12 ? 'staking-token-extra' : ''}" ${index >= 12 ? 'hidden' : ''}>#${htmlEscape(id)}</span>`).join('');
      item.innerHTML = `
        <div class="staking-wallet-top">
          <div class="staking-wallet-address">
            <a href="https://robinhoodchain.blockscout.com/address/${htmlEscape(row.wallet)}" target="_blank" rel="noopener" title="Open in Blockscout">${htmlEscape(row.wallet)}</a>
            <button class="staking-copy" type="button" data-copy-wallet="${htmlEscape(row.wallet)}">COPY</button>
          </div>
          <span class="staking-active-badge">${fmt(row.activeNfts, 0)} STAKED</span>
        </div>
        <div class="staking-wallet-metrics">
          <span><small>DAILY RATE</small><b>${fmt(row.currentDailyRate, 3)} $TOTZ</b></span>
          <span><small>EARNED</small><b>${fmt(row.earned, 3)}</b></span>
          <span><small>AVAILABLE</small><b>${fmt(row.available, 3)}</b></span>
          <span><small>STREAK</small><b>${fmt(row.longestActiveStreakDays, 0)}d</b></span>
        </div>
        <div class="staking-wallet-meta">First active stake: <b>${fmtDateTime(row.firstActiveStakedAt)}</b> · Lifetime stake records: <b>${fmt(row.lifetimeStakeRecords, 0)}</b></div>
        <div class="staking-token-wrap">${tokenChips}${tokens.length > 12 ? `<button class="staking-more" type="button">+${tokens.length - 12} MORE</button>` : ''}</div>`;
      item.querySelector('[data-copy-wallet]')?.addEventListener('click', async (event) => {
        try {
          await navigator.clipboard.writeText(row.wallet);
          event.currentTarget.textContent = 'COPIED';
          setTimeout(() => { event.currentTarget.textContent = 'COPY'; }, 1200);
        } catch (_) {}
      });
      item.querySelector('.staking-more')?.addEventListener('click', (event) => {
        const extras = item.querySelectorAll('.staking-token-extra');
        const opening = [...extras].some((el) => el.hidden);
        extras.forEach((el) => { el.hidden = !opening; });
        event.currentTarget.textContent = opening ? 'SHOW LESS' : `+${Math.max(0, tokens.length - 12)} MORE`;
      });
      list.appendChild(item);
    });
  }

  function renderStaking(staking) {
    ensurePanel();
    latestStaking = staking || { summary: {}, wallets: [] };
    renderSummary(latestStaking.summary || {});
    renderWallets(latestStaking.wallets || [], document.getElementById('stakingWalletSearch')?.value || '');
  }

  function showStatsError(message) {
    ensurePanel();
    const list = document.getElementById('stakingWalletList');
    if (list) list.innerHTML = `<div class="staking-empty error">${htmlEscape(message || 'Could not load staking analytics.')}</div>`;
  }

  ensurePanel();

  if (typeof api === 'function') {
    const rewardsApi = api;
    api = async function(body, timeoutMs = 15000) {
      const result = await rewardsApi(body, timeoutMs);
      if (body?.action === 'admin_list' && body.wallet && body.timestamp && body.signature) {
        fetchStats(body).then(renderStaking).catch((error) => showStatsError(error.message));
      }
      return result;
    };
  }

  const style = document.createElement('style');
  style.textContent = `
    .admin-staking-panel{grid-column:1/-1;margin-top:0!important}
    .staking-panel-head{display:flex;align-items:center;justify-content:space-between;gap:18px}
    .staking-panel-head h2{font-size:1.7rem;margin:4px 0 0}.staking-panel-head p{margin:2px 0 0;color:var(--soft);font-weight:700}
    .staking-kicker{display:inline-flex;background:var(--lime);border-radius:999px;padding:5px 9px;font-size:.68rem;font-weight:900;letter-spacing:.05em}
    .staking-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:18px}
    .staking-stat{background:var(--cream);border:1px solid rgba(142,210,226,.8);border-radius:17px;padding:13px 14px}.staking-stat small{display:block;color:var(--soft);font-size:.66rem;font-weight:900;letter-spacing:.05em}.staking-stat strong{display:block;font-family:'Baloo 2';font-size:1.55rem;margin-top:3px}
    .staking-subline{margin:11px 0 18px;color:var(--soft);font-size:.8rem;font-weight:700}
    .staking-wallet-head{display:flex;justify-content:space-between;align-items:end;gap:14px;border-top:1px dashed var(--sky2);padding-top:15px}.staking-wallet-head h3{margin:0;font-size:1.2rem}.staking-wallet-head span{color:var(--soft);font-size:.75rem;font-weight:800}.staking-wallet-head input{width:min(330px,45%);border:2px solid var(--sky2);border-radius:999px;padding:9px 13px;font:700 .82rem 'Nunito';outline:none;background:#fff}
    .staking-wallet-list{display:grid;gap:9px;margin-top:11px;max-height:620px;overflow:auto;padding-right:3px}.staking-wallet-row{border:1.5px solid var(--sky2);border-radius:17px;padding:12px;background:#fff}.staking-wallet-top{display:flex;justify-content:space-between;align-items:center;gap:10px}.staking-wallet-address{display:flex;align-items:center;gap:7px;min-width:0}.staking-wallet-address a{font:700 .78rem monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.staking-copy,.staking-more{border:0;background:var(--cream);border-radius:999px;padding:5px 8px;color:var(--ink);font-size:.62rem;font-weight:900;cursor:pointer}.staking-active-badge{flex:none;background:#eef6c9;border-radius:999px;padding:5px 8px;font-size:.67rem;font-weight:900}
    .staking-wallet-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:10px 0}.staking-wallet-metrics span{background:var(--cream);border-radius:11px;padding:7px 8px}.staking-wallet-metrics small{display:block;color:var(--soft);font-size:.56rem;font-weight:900}.staking-wallet-metrics b{display:block;margin-top:2px;font-size:.78rem}.staking-wallet-meta{color:var(--soft);font-size:.7rem;font-weight:700;line-height:1.45}.staking-token-wrap{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px}.staking-token{background:var(--sky);border-radius:999px;padding:4px 7px;font-size:.65rem;font-weight:900}.staking-empty{padding:22px;text-align:center;border:2px dashed var(--sky2);border-radius:16px;color:var(--soft);font-weight:800}.staking-empty.error{background:#ffe0dc;color:#8b2b1f;border-color:#ffb2a8}
    @media(max-width:850px){.staking-summary{grid-template-columns:1fr 1fr}.staking-wallet-metrics{grid-template-columns:1fr 1fr}}
    @media(max-width:600px){.staking-panel-head,.staking-wallet-head,.staking-wallet-top{align-items:stretch;flex-direction:column}.staking-wallet-head input{width:100%}.staking-summary{grid-template-columns:1fr 1fr}.staking-wallet-list{max-height:none}.staking-wallet-address a{font-size:.69rem}}
  `;
  document.head.appendChild(style);
})();

(() => {
  const ECONOMY_API = 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/totz-staking-economy';

  const defaults = {
    symbol: '$TOTZ',
    baseRatePerDay: 1,
    loyalty: [
      { days: 0, multiplier: 1.00, label: 'Base' },
      { days: 7, multiplier: 1.05, label: '7D' },
      { days: 30, multiplier: 1.10, label: '30D' },
      { days: 90, multiplier: 1.15, label: '90D+' }
    ],
    specialTiers: {
      legendary: { multiplier: 1.50, label: 'Legendary · 1/1', supply: 36 }
    }
  };

  let economy = defaults;
  let boosts = new Map();

  const style = document.createElement('style');
  style.textContent = `
    .economy-panel{background:#fff;border:2px solid var(--sky2);border-radius:26px;padding:22px;margin:26px 0 12px;box-shadow:var(--shadow)}
    .economy-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:16px}.economy-head h2{margin:0;font-size:1.55rem}.economy-head p{margin:4px 0 0;color:var(--soft);font-weight:700;line-height:1.5;max-width:700px}.economy-live{background:var(--lime);border-radius:999px;padding:6px 10px;font-weight:900;font-size:.72rem;white-space:nowrap}
    .economy-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.economy-item{background:var(--cream);border-radius:17px;padding:13px}.economy-item b{display:block;font-family:'Baloo 2';font-size:1.05rem}.economy-item span{display:block;color:var(--soft);font-size:.78rem;font-weight:800;line-height:1.4;margin-top:2px}
    .economy-note{margin:14px 0 0;color:var(--soft);font-size:.8rem;font-weight:800;line-height:1.5}
    .economy-card-line{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:-5px 0 12px}.economy-chip{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;background:var(--cream);font-size:.7rem;font-weight:900;color:var(--soft)}.economy-chip.special{background:#fff2af;color:var(--ink)}
    .nft.legendary-stake{border-color:#dfc74f}.nft.legendary-stake .rate{background:#fff2af}
    @media(max-width:850px){.economy-grid{grid-template-columns:1fr}}
    @media(max-width:560px){.economy-head{flex-direction:column}.economy-panel{padding:17px}}
  `;
  document.head.appendChild(style);

  function formatRate(value) {
    const n = Number(value || 0);
    return n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }

  function getStake(tokenId) {
    try {
      const rows = (typeof portfolio !== 'undefined' && portfolio?.stakes) ? portfolio.stakes : [];
      return rows.find((row) => row.active && String(row.token_id) === String(tokenId)) || null;
    } catch (_) {
      return null;
    }
  }

  function streakInfo(stakedAt) {
    if (!stakedAt) return { days: 0, multiplier: 1, bonus: 0, label: 'Streak starts when staked' };
    const start = Date.parse(stakedAt);
    if (!Number.isFinite(start)) return { days: 0, multiplier: 1, bonus: 0, label: 'Streak active' };
    const days = Math.max(0, (Date.now() - start) / 86400000);
    let selected = economy.loyalty?.[0] || defaults.loyalty[0];
    for (const tier of economy.loyalty || defaults.loyalty) {
      if (days >= Number(tier.days || 0)) selected = tier;
    }
    const multiplier = Number(selected.multiplier || 1);
    return {
      days,
      multiplier,
      bonus: Math.max(0, Math.round((multiplier - 1) * 100)),
      label: `${Math.floor(days)}D streak`
    };
  }

  function boostFor(tokenId) {
    return boosts.get(String(tokenId)) || null;
  }

  function ensurePanel() {
    const dashboard = document.getElementById('dashboard');
    if (!dashboard || document.getElementById('economyPanel')) return;
    const sectionHead = dashboard.querySelector('.section-head');
    if (!sectionHead) return;

    const panel = document.createElement('section');
    panel.id = 'economyPanel';
    panel.className = 'economy-panel';
    panel.innerHTML = `
      <div class="economy-head">
        <div>
          <h2>How $TOTZ earning works</h2>
          <p>Every staked TOTZ starts at 1 $TOTZ / day. Each NFT builds its own loyalty streak automatically. The collection's 36 Legendary TOTZ are unique 1/1s and earn a special boost.</p>
        </div>
        <span class="economy-live">LIVE RATE</span>
      </div>
      <div class="economy-grid">
        <div class="economy-item"><b>1 $TOTZ / day</b><span>Base rate for every regular staked TOTZ.</span></div>
        <div class="economy-item"><b>+5% → +15%</b><span>7D +5% · 30D +10% · 90D+ +15% loyalty.</span></div>
        <div class="economy-item"><b>1.5× Legendary · 1/1</b><span>36 unique Legendary TOTZ receive the special multiplier.</span></div>
      </div>
      <p class="economy-note">Unstaking keeps the $TOTZ already earned, but that NFT's loyalty streak resets when it is staked again.</p>`;
    dashboard.insertBefore(panel, sectionHead);
  }

  function decorateCard(card) {
    if (!(card instanceof Element) || !card.matches('.nft')) return;
    const tokenId = String(card.dataset.tokenId || '');
    if (!tokenId) return;

    const stake = getStake(tokenId);
    const streak = streakInfo(stake?.staked_at);
    const boost = boostFor(tokenId);
    const tokenMultiplier = Number(boost?.multiplier || 1);
    const currentRate = Number(economy.baseRatePerDay || 1) * tokenMultiplier * (stake ? streak.multiplier : 1);

    const rate = card.querySelector('.rate');
    const rateText = `${formatRate(currentRate)} $TOTZ/DAY`;
    if (rate && rate.textContent !== rateText) rate.textContent = rateText;

    if (boost?.tier === 'legendary' || boost?.tier === 'one_of_one') card.classList.add('legendary-stake');
    else card.classList.remove('legendary-stake');

    let line = card.querySelector('.economy-card-line');
    if (!line) {
      line = document.createElement('div');
      line.className = 'economy-card-line';
      const meta = card.querySelector('.nft-meta');
      if (meta) meta.insertAdjacentElement('afterend', line);
    }

    const chips = [];
    if (boost) chips.push(`<span class="economy-chip special">Legendary · 1/1 · ${formatRate(tokenMultiplier)}×</span>`);
    if (stake) {
      chips.push(`<span class="economy-chip">${streak.label}</span>`);
      if (streak.bonus > 0) chips.push(`<span class="economy-chip">+${streak.bonus}% loyalty</span>`);
    } else {
      chips.push('<span class="economy-chip">1 $TOTZ/day when staked</span>');
    }
    const nextHtml = chips.join('');
    if (line.innerHTML !== nextHtml) line.innerHTML = nextHtml;
  }

  function refreshUI() {
    ensurePanel();
    const baseBadge = document.querySelector('#dashboard .section-head .badge');
    const badgeText = '1 $TOTZ / DAY BASE';
    if (baseBadge && baseBadge.textContent !== badgeText) baseBadge.textContent = badgeText;
    document.querySelectorAll('.nft').forEach(decorateCard);
  }

  async function loadEconomy() {
    try {
      const res = await fetch(ECONOMY_API, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Could not load staking economy');
      economy = data.economy || defaults;
      boosts = new Map((data.boosts || []).map((row) => [String(row.token_id), row]));
    } catch (_) {
      economy = defaults;
      boosts = new Map();
    }
    refreshUI();
  }

  let refreshQueued = false;
  const queueRefresh = () => {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      refreshUI();
    });
  };

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((m) => m.addedNodes?.length)) queueRefresh();
  });
  const dashboard = document.getElementById('dashboard');
  if (dashboard) observer.observe(dashboard, { childList: true, subtree: true });

  setInterval(() => {
    if (document.visibilityState === 'visible') refreshUI();
  }, 30000);

  loadEconomy();
})();
(() => {
  const BASE_RATE = 1;
  const LOYALTY = [
    { days: 0, multiplier: 1.00 },
    { days: 7, multiplier: 1.05 },
    { days: 30, multiplier: 1.10 },
    { days: 90, multiplier: 1.15 }
  ];
  const LEGENDARY = new Set([
    '115','148','224','357','480','720','1068','1141','1304','1474','1675','1724',
    '1889','1909','2182','2196','2266','2327','2382','2390','2425','2446','2536','2593',
    '2763','2870','2923','3134','3204','3209','3231','3272','3360','3444','3461','3754'
  ]);

  const style = document.createElement('style');
  style.textContent = `
    .economy-panel{background:#fff;border:2px solid var(--sky2);border-radius:26px;padding:22px;margin:26px 0 12px;box-shadow:var(--shadow)}
    .economy-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:16px}.economy-head h2{margin:0;font-size:1.55rem}.economy-head p{margin:4px 0 0;color:var(--soft);font-weight:700;line-height:1.5;max-width:700px}.economy-live{background:var(--lime);border-radius:999px;padding:6px 10px;font-weight:900;font-size:.72rem;white-space:nowrap}
    .economy-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.economy-item{background:var(--cream);border-radius:17px;padding:13px}.economy-item b{display:block;font-family:'Baloo 2';font-size:1.05rem}.economy-item span{display:block;color:var(--soft);font-size:.78rem;font-weight:800;line-height:1.4;margin-top:2px}
    .economy-note{margin:14px 0 0;color:var(--soft);font-size:.8rem;font-weight:800;line-height:1.5}
    .economy-card-line{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:-5px 0 12px}.economy-chip{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;background:var(--cream);font-size:.7rem;font-weight:900;color:var(--soft)}.economy-chip.special{background:#fff2af;color:var(--ink)}
    .nft.legendary-stake{border-color:#dfc74f}.nft.legendary-stake .rate{background:#fff2af}
    @media(max-width:850px){.economy-grid{grid-template-columns:1fr}}@media(max-width:560px){.economy-head{flex-direction:column}.economy-panel{padding:17px}}
  `;
  document.head.appendChild(style);

  function fmt(value) {
    const n = Number(value || 0);
    return n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }
  function getStake(tokenId) {
    try {
      const rows = (typeof portfolio !== 'undefined' && portfolio?.stakes) ? portfolio.stakes : [];
      return rows.find((row) => row.active && String(row.token_id) === String(tokenId)) || null;
    } catch (_) { return null; }
  }
  function loyaltyInfo(stakedAt) {
    if (!stakedAt) return { days: 0, multiplier: 1, bonus: 0 };
    const start = Date.parse(stakedAt);
    if (!Number.isFinite(start)) return { days: 0, multiplier: 1, bonus: 0 };
    const days = Math.max(0, (Date.now() - start) / 86400000);
    let tier = LOYALTY[0];
    for (const candidate of LOYALTY) if (days >= candidate.days) tier = candidate;
    return { days, multiplier: tier.multiplier, bonus: Math.max(0, Math.round((tier.multiplier - 1) * 100)) };
  }
  function ensurePanel() {
    const dashboard = document.getElementById('dashboard');
    if (!dashboard || document.getElementById('economyPanel')) return;
    const head = dashboard.querySelector('.section-head');
    if (!head) return;
    const panel = document.createElement('section');
    panel.id = 'economyPanel';
    panel.className = 'economy-panel';
    panel.innerHTML = `
      <div class="economy-head"><div><h2>How $TOTZ earning works</h2><p>Every staked TOTZ starts at 1 $TOTZ / day. Each NFT builds its own loyalty streak automatically. The 36 Legendary TOTZ receive a special boost.</p></div><span class="economy-live">LIVE RATE</span></div>
      <div class="economy-grid">
        <div class="economy-item"><b>1 $TOTZ / day</b><span>Base rate for every regular staked TOTZ.</span></div>
        <div class="economy-item"><b>+5% → +15%</b><span>7D +5% · 30D +10% · 90D+ +15% loyalty.</span></div>
        <div class="economy-item"><b>1.5× Legendary · 1/1</b><span>36 unique Legendary TOTZ receive the special multiplier.</span></div>
      </div>
      <p class="economy-note">Unstaking keeps the $TOTZ already earned, but that NFT's loyalty streak resets when it is staked again.</p>`;
    dashboard.insertBefore(panel, head);
  }
  function decorate(card) {
    if (!(card instanceof Element) || !card.matches('.nft')) return;
    const tokenId = String(card.dataset.tokenId || '');
    if (!tokenId) return;
    const stake = getStake(tokenId);
    const loyalty = loyaltyInfo(stake?.staked_at);
    const legendary = LEGENDARY.has(tokenId);
    const tokenMultiplier = legendary ? 1.5 : 1;
    const rate = BASE_RATE * tokenMultiplier * (stake ? loyalty.multiplier : 1);
    const rateEl = card.querySelector('.rate');
    if (rateEl) rateEl.textContent = `${fmt(rate)} $TOTZ/DAY`;
    card.classList.toggle('legendary-stake', legendary);

    let line = card.querySelector('.economy-card-line');
    if (!line) {
      line = document.createElement('div');
      line.className = 'economy-card-line';
      card.querySelector('.nft-meta')?.insertAdjacentElement('afterend', line);
    }
    const chips = [];
    if (legendary) chips.push('<span class="economy-chip special">Legendary · 1/1 · 1.5×</span>');
    if (stake) {
      chips.push(`<span class="economy-chip">${Math.floor(loyalty.days)}D streak</span>`);
      if (loyalty.bonus > 0) chips.push(`<span class="economy-chip">+${loyalty.bonus}% loyalty</span>`);
    } else chips.push('<span class="economy-chip">1 $TOTZ/day when staked</span>');
    line.innerHTML = chips.join('');
  }
  function refreshUI() {
    ensurePanel();
    const badge = document.querySelector('#dashboard .section-head .badge');
    if (badge) badge.textContent = '1 $TOTZ / DAY BASE';
    document.querySelectorAll('.nft').forEach(decorate);
  }

  const dashboard = document.getElementById('dashboard');
  if (dashboard) {
    new MutationObserver((mutations) => {
      if (mutations.some((m) => m.addedNodes?.length)) requestAnimationFrame(refreshUI);
    }).observe(dashboard, { childList: true, subtree: true });
  }

  refreshUI();
  // Local UI-only timer. No network request and no Supabase invocation.
  setInterval(() => { if (document.visibilityState === 'visible') refreshUI(); }, 30000);
})();

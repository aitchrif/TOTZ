// Large-wallet paging UX hotfix.
// Keep already-rendered indexes stable when Blockscout returns the next NFT page.
appendTokens = function(tokens) {
  const seen = new Set(loadedTokens.map((token) => String(token.tokenId)));
  for (const token of tokens || []) {
    const id = String(token.tokenId);
    if (seen.has(id)) continue;
    seen.add(id);
    loadedTokens.push(token);
  }
};

showMore = async function(count = MORE_RENDER, scrollToNew = false) {
  if (pageLoading) return;

  // DOM position is the reliable anchor. Array indexes can change when an indexer page arrives.
  const cardsBefore = grid.querySelectorAll('.nft').length;

  try {
    while ((loadedTokens.length - renderedCount) < count && nextCursor) {
      const before = loadedTokens.length;
      await fetchNextPage();
      if (loadedTokens.length === before) break;
    }

    const added = renderFromBuffer(count);
    updateBulkUI();

    if (scrollToNew && added > 0) {
      requestAnimationFrame(() => {
        const cards = grid.querySelectorAll('.nft');
        const firstNewCard = cards[cardsBefore];
        if (!firstNewCard) return;

        // Put the first newly-added NFT at the top of the viewport, not the bulk controls.
        const top = firstNewCard.getBoundingClientRect().top + window.scrollY - 14;
        window.scrollTo({ top, behavior: 'smooth' });
      });
    }
  } catch (error) {
    showStatus(error.message || 'Could not load more NFTs.', 'error');
  }
};

// Rewards Hub integration: staking rewards are a persistent wallet balance.
(() => {
  const REWARDS_API = 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/totz-rewards';

  const nav = document.querySelector('.nav-actions');
  if (nav && !nav.querySelector('[data-rewards-link]')) {
    const link = document.createElement('a');
    link.className = 'pill';
    link.href = 'rewards.html';
    link.textContent = 'Rewards';
    link.dataset.rewardsLink = '1';
    nav.insertBefore(link, nav.lastElementChild);
  }

  const pointsEl = document.getElementById('pointsStat');
  const pointsLabel = pointsEl?.parentElement?.querySelector('small');
  if (pointsLabel) pointsLabel.textContent = '$TOTZ Balance';

  async function syncSpendablePoints() {
    const address = window.ethereum?.selectedAddress;
    if (!address || !pointsEl) return;
    try {
      const res = await fetch(REWARDS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'summary', wallet: address.toLowerCase() }),
        cache: 'no-store'
      });
      const data = await res.json();
      if (!res.ok || data.error) return;
      pointsEl.textContent = Number(data.points?.available || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
    } catch (_) {}
  }

  const originalLoadPortfolio = loadPortfolio;
  loadPortfolio = async function(...args) {
    const result = await originalLoadPortfolio(...args);
    await syncSpendablePoints();
    return result;
  };

  setInterval(() => {
    if (document.visibilityState === 'visible') syncSpendablePoints();
  }, 15000);
})();

(() => {
  if (document.querySelector('script[data-totz-ui-brand]')) return;
  const script = document.createElement('script');
  script.src = 'totz-ui-brand.js';
  script.dataset.totzUiBrand = '1';
  document.head.appendChild(script);
})();

(() => {
  if (document.querySelector('script[data-staking-economy]')) return;
  const script = document.createElement('script');
  script.src = 'staking-economy.js';
  script.dataset.stakingEconomy = '1';
  document.head.appendChild(script);
})();

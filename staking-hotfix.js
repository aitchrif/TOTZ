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

        const top = firstNewCard.getBoundingClientRect().top + window.scrollY - 14;
        window.scrollTo({ top, behavior: 'smooth' });
      });
    }
  } catch (error) {
    showStatus(error.message || 'Could not load more NFTs.', 'error');
  }
};

// Rewards Hub integration: no polling. Refresh only on real user/page events.
(() => {
  const USAGE_API = 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/totz-wallet-usage';
  let usageLoading = false;

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
  const pointsCard = pointsEl?.closest('.stat');
  const pointsLabel = pointsCard?.querySelector('small');
  if (pointsLabel) pointsLabel.textContent = '$TOTZ Balance';

  let lockedNote = document.getElementById('stakingDiscordLockedNote');
  if (!lockedNote && pointsCard) {
    lockedNote = document.createElement('span');
    lockedNote.id = 'stakingDiscordLockedNote';
    lockedNote.style.display = 'block';
    lockedNote.style.marginTop = '2px';
    lockedNote.style.fontSize = '.72rem';
    lockedNote.style.fontWeight = '800';
    lockedNote.style.color = 'var(--soft, #5B5270)';
    pointsCard.appendChild(lockedNote);
  }

  function activeWallet() {
    const address = window.ethereum?.selectedAddress || (typeof wallet === 'string' ? wallet : '');
    return /^0x[0-9a-fA-F]{40}$/.test(address || '') ? address.toLowerCase() : null;
  }

  async function syncSpendablePoints() {
    const address = activeWallet();
    if (!address || !pointsEl || usageLoading) return;
    usageLoading = true;
    try {
      const res = await fetch(USAGE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: address }),
        cache: 'no-store'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) return;
      pointsEl.textContent = Number(data.available || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
      if (lockedNote) lockedNote.textContent = `Discord locked: ${Number(data.locked || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} $TOTZ`;
    } catch (_) {
    } finally {
      usageLoading = false;
    }
  }

  const originalLoadPortfolio = loadPortfolio;
  loadPortfolio = async function(...args) {
    const result = await originalLoadPortfolio(...args);
    await syncSpendablePoints();
    return result;
  };

  window.addEventListener('focus', () => {
    if (document.visibilityState === 'visible') syncSpendablePoints();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncSpendablePoints();
  });
  window.ethereum?.on?.('accountsChanged', () => setTimeout(syncSpendablePoints, 100));
})();

(() => {
  if (document.querySelector('script[data-staking-disconnect]')) return;
  const script = document.createElement('script');
  script.src = 'staking-disconnect.js';
  script.dataset.stakingDisconnect = '1';
  document.head.appendChild(script);
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

(() => {
  if (document.querySelector('script[data-staking-selection]')) return;
  const script = document.createElement('script');
  script.src = 'staking-selection.js';
  script.dataset.stakingSelection = '1';
  document.head.appendChild(script);
})();

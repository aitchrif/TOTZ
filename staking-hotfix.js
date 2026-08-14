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

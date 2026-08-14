(() => {
  const SELECTED_API = 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/totz-staking-selected';
  const selected = new Set();
  let selectionBusy = false;

  const style = document.createElement('style');
  style.textContent = `
    .selection-toolbar{width:100%;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-top:10px;margin-top:4px;border-top:1px dashed rgba(43,33,64,.16)}
    .selection-toolbar .selection-copy{margin-right:auto;color:var(--soft);font-size:.76rem;font-weight:800;line-height:1.3}
    .selection-toolbar .btn{padding:8px 12px!important;font-size:.73rem!important}
    .selection-toolbar .stake-selected{background:var(--coral);color:#fff;box-shadow:0 4px 0 var(--coral2)}
    .selection-toolbar .stake-selected:disabled{box-shadow:none}
    .nft-select-toggle{position:absolute;z-index:4;top:9px;left:9px;border:2px solid rgba(255,255,255,.92);background:rgba(43,33,64,.88);color:#fff;border-radius:999px;padding:7px 10px;font:900 .68rem 'Nunito',sans-serif;cursor:pointer;box-shadow:0 5px 14px rgba(43,33,64,.2);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);transition:transform .14s ease,background .14s ease}
    .nft-select-toggle:hover{transform:translateY(-1px)}
    .nft-select-toggle[aria-pressed="true"]{background:var(--lime);color:var(--ink);border-color:#fff}
    .nft.selecting{border-color:var(--coral)!important;box-shadow:0 0 0 3px rgba(255,122,102,.22),var(--shadow)!important}
    .nft.selecting .nft-media::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(203,219,42,.05),rgba(255,122,102,.10))}
    @media(max-width:620px){.selection-toolbar .selection-copy{width:100%;margin:0 0 2px}.selection-toolbar .btn{flex:1}.nft-select-toggle{top:8px;left:8px}}
  `;
  document.head.appendChild(style);

  function setButtonText(button, text) {
    if (button && button.textContent !== text) button.textContent = text;
  }

  function canonicalIds() {
    return [...selected].map(Number).sort((a, b) => a - b).map(String);
  }

  function isStakedCard(card) {
    return card.classList.contains('staked') || Boolean(card.querySelector('[data-action="unstake"]'));
  }

  function syncToolbar() {
    const count = selected.size;
    const stakeBtn = document.getElementById('stakeSelectedBtn');
    const clearBtn = document.getElementById('clearSelectionBtn');
    if (stakeBtn) {
      const disabled = selectionBusy || count === 0;
      if (stakeBtn.disabled !== disabled) stakeBtn.disabled = disabled;
      setButtonText(stakeBtn, selectionBusy ? 'WORKING…' : `STAKE SELECTED (${count})`);
    }
    if (clearBtn) {
      const disabled = selectionBusy || count === 0;
      if (clearBtn.disabled !== disabled) clearBtn.disabled = disabled;
    }
  }

  function syncCard(card) {
    const id = String(card.dataset.tokenId || '');
    const button = card.querySelector('.nft-select-toggle');
    if (!id || !button) return;
    const staked = isStakedCard(card);
    if (staked) selected.delete(id);
    const on = selected.has(id) && !staked;
    card.classList.toggle('selecting', on);
    const pressed = on ? 'true' : 'false';
    if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
    setButtonText(button, on ? '✓ SELECTED' : '○ SELECT');
  }

  function toggleCard(card) {
    if (!card || isStakedCard(card) || selectionBusy) return;
    const id = String(card.dataset.tokenId || '');
    if (!/^\d+$/.test(id)) return;
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    syncCard(card);
    syncToolbar();
  }

  function decorateCard(card) {
    if (!(card instanceof HTMLElement) || !card.classList.contains('nft')) return;
    if (isStakedCard(card)) return;
    const media = card.querySelector('.nft-media');
    if (!media || media.querySelector('.nft-select-toggle')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nft-select-toggle';
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `Select TOTZ #${card.dataset.tokenId || ''} for staking`);
    button.textContent = '○ SELECT';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleCard(card);
    });
    media.appendChild(button);
    syncCard(card);
  }

  function decorateAll() {
    document.querySelectorAll('#nftGrid .nft').forEach(decorateCard);
    syncToolbar();
  }

  function installToolbar() {
    const bulk = document.getElementById('bulkActions');
    if (!bulk || document.getElementById('selectionToolbar')) return false;

    const toolbar = document.createElement('div');
    toolbar.id = 'selectionToolbar';
    toolbar.className = 'selection-toolbar';
    toolbar.innerHTML = `
      <div class="selection-copy">Pick any unstaked NFTs, then stake the selected group with one wallet signature.</div>
      <button id="selectShownBtn" class="btn ghost" type="button">SELECT SHOWN</button>
      <button id="clearSelectionBtn" class="btn ghost" type="button" disabled>CLEAR</button>
      <button id="stakeSelectedBtn" class="btn stake-selected" type="button" disabled>STAKE SELECTED (0)</button>`;
    bulk.appendChild(toolbar);

    document.getElementById('selectShownBtn').addEventListener('click', () => {
      if (selectionBusy) return;
      document.querySelectorAll('#nftGrid .nft').forEach((card) => {
        if (!isStakedCard(card) && card.dataset.tokenId) selected.add(String(card.dataset.tokenId));
        syncCard(card);
      });
      syncToolbar();
    });

    document.getElementById('clearSelectionBtn').addEventListener('click', () => {
      if (selectionBusy) return;
      selected.clear();
      document.querySelectorAll('#nftGrid .nft').forEach(syncCard);
      syncToolbar();
    });

    document.getElementById('stakeSelectedBtn').addEventListener('click', stakeSelected);
    syncToolbar();
    return true;
  }

  function selectedMessage(ids, timestamp) {
    return [
      'TOTZ Soft Staking',
      'Action: stake_selected',
      `Wallet: ${wallet}`,
      `Token IDs: ${ids.join(',')}`,
      `Chain ID: ${CHAIN_ID}`,
      `Contract: ${CONTRACT}`,
      `Timestamp: ${timestamp}`
    ].join('\n');
  }

  async function stakeSelected() {
    if (selectionBusy) return;
    if (!wallet) return connectWallet();
    const ids = canonicalIds();
    if (!ids.length) return;

    selectionBusy = true;
    bulkBusy = true;
    syncToolbar();
    updateBulkUI();

    try {
      await ensureRobinhoodChain();
      const timestamp = Date.now();
      const message = selectedMessage(ids, timestamp);
      showStatus(`Sign one wallet message to soft stake ${ids.length} selected TOTZ. No NFT approval or transfer.`);
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [utf8ToHex(message), wallet]
      });

      showStatus(`Verifying ownership and soft staking ${ids.length} selected TOTZ…`);
      const res = await fetch(SELECTED_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stake_selected', wallet, tokenIds: ids, timestamp, signature }),
        cache: 'no-store'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status})`);

      selected.clear();
      showStatus(`${data.stakedNow || 0} selected TOTZ soft staked successfully.`, 'ok');
      await loadPortfolio(true);
    } catch (error) {
      showStatus(error?.message || 'Could not stake selected TOTZ.', 'error');
    } finally {
      selectionBusy = false;
      bulkBusy = false;
      syncToolbar();
      updateBulkUI();
    }
  }

  installToolbar();
  decorateAll();

  const grid = document.getElementById('nftGrid');
  if (grid) {
    const observer = new MutationObserver((mutations) => {
      let addedNft = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.classList.contains('nft')) {
            decorateCard(node);
            addedNft = true;
          }
        }
      }
      if (addedNft) syncToolbar();
    });
    observer.observe(grid, { childList: true, subtree: false });
  }
})();

(() => {
  'use strict';

  const DISCONNECT_KEY = 'totz_staking_disconnect';
  const connectBtn = document.getElementById('connectBtn');
  const connectTop = document.querySelector('.connect-top');
  if (!connectBtn || !connectTop || document.getElementById('disconnectBtn')) return;

  const style = document.createElement('style');
  style.textContent = `
    .wallet-actions{display:flex;align-items:center;gap:9px;flex:0 0 auto}
    .wallet-actions #connectBtn{white-space:nowrap}
    .btn.disconnect{display:none;background:#fff;color:var(--coral2);border:2px solid var(--coral);box-shadow:none;padding:9px 14px!important;font-size:.76rem!important;letter-spacing:.03em;transition:transform .14s ease,background .14s ease,color .14s ease}
    .btn.disconnect:hover{background:#fff0ed;transform:translateY(-1px)}
    .btn.disconnect:active{transform:translateY(1px)}
    .btn.disconnect.show{display:inline-flex;align-items:center;justify-content:center}
    @media(max-width:850px){.wallet-actions{width:100%}.wallet-actions #connectBtn{flex:1}.btn.disconnect.show{flex:0 0 auto}}
    @media(max-width:480px){.wallet-actions{flex-direction:column;align-items:stretch}.btn.disconnect.show{width:100%}}
  `;
  document.head.appendChild(style);

  const actions = document.createElement('div');
  actions.className = 'wallet-actions';
  connectBtn.parentNode.insertBefore(actions, connectBtn);
  actions.appendChild(connectBtn);

  const disconnectBtn = document.createElement('button');
  disconnectBtn.id = 'disconnectBtn';
  disconnectBtn.className = 'btn disconnect';
  disconnectBtn.type = 'button';
  disconnectBtn.textContent = 'DISCONNECT';
  disconnectBtn.setAttribute('aria-label', 'Disconnect wallet from TOTZ staking');
  actions.appendChild(disconnectBtn);

  function isConnected() {
    try { return typeof wallet !== 'undefined' && Boolean(wallet); } catch (_) { return false; }
  }

  function syncDisconnectButton() {
    disconnectBtn.classList.toggle('show', isConnected());
  }

  function resetStakingUi() {
    try { wallet = null; } catch (_) {}
    try { portfolio = null; } catch (_) {}
    try { portfolioLoad = null; } catch (_) {}
    try { loadedTokens = []; } catch (_) {}
    try { renderedCount = 0; } catch (_) {}
    try { nextCursor = null; } catch (_) {}
    try { pageLoading = false; } catch (_) {}
    try { bulkBusy = false; } catch (_) {}

    connectBtn.disabled = false;
    connectBtn.textContent = 'CONNECT WALLET';

    const title = document.getElementById('connectTitle');
    if (title) title.textContent = 'Connect your wallet';

    const sub = document.getElementById('connectSub');
    if (sub) sub.innerHTML = 'We check your TOTZ directly on Robinhood Chain.<br><span style="font-size:.78rem;opacity:.72">Contract: 0x107c…9d5a</span>';

    const dashboard = document.getElementById('dashboard');
    if (dashboard) dashboard.hidden = true;

    const manual = document.getElementById('manual');
    if (manual) manual.classList.remove('show');

    const bulk = document.getElementById('bulkActions');
    if (bulk) bulk.hidden = true;
    const more = document.getElementById('loadMoreWrap');
    if (more) more.hidden = true;

    const grid = document.getElementById('nftGrid');
    if (grid) grid.innerHTML = '<div class="empty">Connect your wallet to load your TOTZ.</div>';

    syncDisconnectButton();
  }

  async function disconnectWallet() {
    if (!isConnected()) return;
    disconnectBtn.disabled = true;
    disconnectBtn.textContent = 'DISCONNECTING…';

    // This flag prevents the page's silent eth_accounts reconnect until the user
    // explicitly presses CONNECT WALLET again. It is also a fallback for wallets
    // that do not implement wallet_revokePermissions.
    localStorage.setItem(DISCONNECT_KEY, '1');

    try {
      if (window.ethereum?.request) {
        await window.ethereum.request({
          method: 'wallet_revokePermissions',
          params: [{ eth_accounts: {} }]
        });
      }
    } catch (_) {
      // Some EVM wallets do not support permission revocation. Local disconnect
      // still works and remains in effect until the user explicitly reconnects.
    }

    resetStakingUi();
    if (typeof showStatus === 'function') {
      showStatus('Wallet disconnected. Your soft-staked TOTZ stay staked and keep earning; reconnect anytime to manage them.', 'ok');
    }

    disconnectBtn.disabled = false;
    disconnectBtn.textContent = 'DISCONNECT';
  }

  // Explicit CONNECT always opts the user back in, even if their wallet provider
  // does not support wallet_revokePermissions.
  connectBtn.addEventListener('click', () => {
    if (!isConnected()) localStorage.removeItem(DISCONNECT_KEY);
  }, true);

  disconnectBtn.addEventListener('click', disconnectWallet);

  // Keep the control in sync with normal connect/account-change flows without
  // changing any staking logic.
  const observer = new MutationObserver(syncDisconnectButton);
  observer.observe(connectBtn, { childList: true, characterData: true, subtree: true });
  window.addEventListener('pageshow', syncDisconnectButton);
  setTimeout(syncDisconnectButton, 0);
})();

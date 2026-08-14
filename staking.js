const API = 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/totz-staking';
const IMAGE_CID = 'QmSuozQEVRcxNSwn7huCb8sZMhqhedENfMNRsYwEVBZm1K';
const CHAIN_ID = 4663;
const CHAIN_HEX = '0x1237';
const CONTRACT = '0x107c4e7cf931b18e022d40184d03d00b4ec99d5a';
const MAX_SUPPLY = 4000;
const FIRST_RENDER = 18;
const MORE_RENDER = 24;

let wallet = null;
let portfolio = null;
let portfolioLoad = null;
let connecting = false;
let loadedTokens = [];
let renderedCount = 0;
let nextCursor = null;
let pageLoading = false;

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const connectBtn = $('connectBtn');
const dashboard = $('dashboard');
const grid = $('nftGrid');
const manual = $('manual');

function showStatus(message, type = '') {
  statusEl.textContent = message;
  statusEl.className = `status show ${type}`;
}
function shortWallet(value) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function thumbUrl(tokenId) {
  const id = Number(tokenId);
  if (!Number.isInteger(id) || id < 1 || id > MAX_SUPPLY) return null;
  return `https://ipfs.io/ipfs/${IMAGE_CID}/${id}`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
async function api(body, retries = 1, timeoutMs = 9000) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store'
      }, timeoutMs);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status})`);
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(350);
    }
  }
  throw lastError;
}

async function ensureRobinhoodChain() {
  const chainId = await window.ethereum.request({ method: 'eth_chainId' });
  if (chainId.toLowerCase() === CHAIN_HEX) return;
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] });
  } catch (error) {
    if (error.code !== 4902) throw error;
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: CHAIN_HEX,
        chainName: 'Robinhood Chain',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'],
        blockExplorerUrls: ['https://robinhoodchain.blockscout.com']
      }]
    });
  }
}

function installLargeWalletUI() {
  if ($('bulkActions')) return;
  const style = document.createElement('style');
  style.textContent = `
    .bulk-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff;border:2px solid var(--sky2);border-radius:22px;padding:14px 16px;margin:0 0 18px;box-shadow:var(--shadow);flex-wrap:wrap}
    .bulk-copy{display:flex;flex-direction:column;gap:2px}.bulk-copy strong{font-family:'Baloo 2';font-size:1.05rem}.bulk-copy span{color:var(--soft);font-size:.82rem;font-weight:800}
    .bulk-buttons{display:flex;gap:9px;flex-wrap:wrap}.bulk-buttons .btn{padding:10px 16px;font-size:.86rem}.btn.bulk{background:var(--ink);color:#fff}.btn.more{background:var(--sky);color:var(--ink)}
    .nft-media{position:relative}.nft-media img[data-lazy-nft]{position:absolute;inset:0;opacity:0}.nft-media img[data-lazy-nft][data-loaded="1"]{opacity:1}.nft-media .nft-placeholder{position:absolute;inset:0;display:grid;place-items:center}
    @media(max-width:620px){.bulk-actions,.bulk-buttons{align-items:stretch}.bulk-buttons{width:100%}.bulk-buttons .btn{flex:1}}
  `;
  document.head.appendChild(style);

  const bar = document.createElement('div');
  bar.id = 'bulkActions';
  bar.className = 'bulk-actions';
  bar.hidden = true;
  bar.innerHTML = `
    <div class="bulk-copy"><strong id="bulkTitle">Your TOTZ</strong><span id="bulkSub">—</span></div>
    <div class="bulk-buttons">
      <button id="showMoreBtn" class="btn more" type="button">SHOW MORE</button>
      <button id="stakeAllBtn" class="btn bulk" type="button">STAKE ALL</button>
      <button id="unstakeAllBtn" class="btn ghost" type="button">UNSTAKE ALL</button>
    </div>`;
  grid.parentNode.insertBefore(bar, grid);
  $('showMoreBtn').addEventListener('click', () => showMore(MORE_RENDER));
  $('stakeAllBtn').addEventListener('click', () => bulkSignedAction('stake_all'));
  $('unstakeAllBtn').addEventListener('click', () => bulkSignedAction('unstake_all'));
}
installLargeWalletUI();

const imageObserver = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    imageObserver.unobserve(entry.target);
    startNftImage(entry.target);
  }
}, { rootMargin: '700px 0px' }) : null;

function startNftImage(img) {
  if (!img || img.dataset.started === '1') return;
  img.dataset.started = '1';
  const tokenId = img.dataset.tokenId;
  const url = thumbUrl(tokenId);
  if (!url) return;
  img.addEventListener('load', () => {
    img.dataset.loaded = '1';
    const placeholder = img.parentElement?.querySelector('.nft-placeholder');
    if (placeholder) placeholder.style.display = 'none';
  }, { once: true });
  img.src = url;
}
function observeNftImage(img) {
  if (!img) return;
  if (imageObserver) imageObserver.observe(img);
  else startNftImage(img);
}

async function connectWallet() {
  if (!window.ethereum) {
    showStatus('No EVM wallet detected. Open this page in MetaMask, Robinhood Wallet, or another EVM wallet browser.', 'error');
    return;
  }
  if (connecting) return;
  connecting = true;
  connectBtn.disabled = true;
  showStatus('Connecting wallet…');
  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts?.length) throw new Error('No wallet account selected.');
    wallet = accounts[0].toLowerCase();
    await ensureRobinhoodChain();
    connectBtn.textContent = shortWallet(wallet);
    $('connectTitle').textContent = 'Wallet connected';
    $('connectSub').innerHTML = `Your TOTZ stay in <span class="wallet-chip">${shortWallet(wallet)}</span>. Nothing is transferred.`;
    dashboard.hidden = false;
    showStatus('Connected. Loading your TOTZ…', 'ok');
    await loadPortfolio(true);
  } catch (error) {
    showStatus(error.name === 'AbortError' ? 'The collection indexer took too long. Please try again.' : (error.message || 'Could not connect wallet.'), 'error');
  } finally {
    connecting = false;
    connectBtn.disabled = false;
  }
}

function appendTokens(tokens) {
  const map = new Map(loadedTokens.map(t => [String(t.tokenId), t]));
  for (const token of tokens || []) map.set(String(token.tokenId), token);
  loadedTokens = [...map.values()].sort((a, b) => Number(a.tokenId) - Number(b.tokenId));
}
function activeCount() {
  return portfolio?.activeTokenIds?.length || 0;
}
function updateBulkUI() {
  const bar = $('bulkActions');
  if (!bar || !portfolio) return;
  const total = Number(portfolio.balance || loadedTokens.length || 0);
  const staked = activeCount();
  bar.hidden = total === 0;
  $('bulkTitle').textContent = `${total} TOTZ in this wallet`;
  $('bulkSub').textContent = `Showing ${renderedCount} of ${total} · ${staked} soft staked`;
  const moreAvailable = renderedCount < loadedTokens.length || Boolean(nextCursor);
  $('showMoreBtn').hidden = !moreAvailable;
  $('showMoreBtn').disabled = pageLoading;
  $('stakeAllBtn').disabled = total === 0 || staked >= total;
  $('stakeAllBtn').textContent = staked > 0 && staked < total ? `STAKE REMAINING` : `STAKE ALL`;
  $('unstakeAllBtn').disabled = staked === 0;
}

async function loadPortfolio(force = false) {
  if (!wallet) return;
  if (portfolioLoad && !force) return portfolioLoad;
  const walletAtStart = wallet;
  portfolioLoad = (async () => {
    grid.innerHTML = '<div class="empty">Finding your TOTZ…</div>';
    try {
      const nextPortfolio = await api({ action: 'portfolio', wallet: walletAtStart }, 1, 9500);
      if (wallet !== walletAtStart) return;
      portfolio = nextPortfolio;
      loadedTokens = [];
      renderedCount = 0;
      nextCursor = portfolio.nextCursor || null;
      appendTokens(portfolio.tokens || []);

      $('walletStat').textContent = shortWallet(wallet);
      $('ownedStat').textContent = portfolio.balanceDisplay || portfolio.balance || 0;
      $('stakedStat').textContent = activeCount();
      $('pointsStat').textContent = Number(portfolio.totalPoints || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });

      if (!portfolio.enumerable) {
        manual.classList.add('show');
        grid.innerHTML = '<div class="empty">Automatic NFT discovery is temporarily unavailable. Enter a Token ID above and we will verify ownership directly on-chain.</div>';
      } else if (!loadedTokens.length) {
        manual.classList.remove('show');
        grid.innerHTML = '<div class="empty">No TOTZ found in this wallet on Robinhood Chain.</div>';
      } else {
        manual.classList.remove('show');
        grid.innerHTML = '';
        renderFromBuffer(FIRST_RENDER);
      }

      updateBulkUI();
      showStatus(`Found ${portfolio.balanceDisplay || portfolio.balance} TOTZ. ${activeCount()} currently soft staked.`, 'ok');
    } catch (error) {
      showStatus(error.name === 'AbortError' ? 'The collection indexer took too long to respond. Please try again.' : (error.message || 'Could not load your TOTZ.'), 'error');
      grid.innerHTML = '<div class="empty">Could not load collection data. Try again in a moment.</div>';
    } finally {
      portfolioLoad = null;
    }
  })();
  return portfolioLoad;
}

function renderFromBuffer(maxCount) {
  let added = 0;
  while (renderedCount < loadedTokens.length && added < maxCount) {
    renderToken(loadedTokens[renderedCount]);
    renderedCount++;
    added++;
  }
  updateBulkUI();
  return added;
}
async function fetchNextPage() {
  if (!wallet || !nextCursor || pageLoading) return 0;
  pageLoading = true;
  updateBulkUI();
  try {
    const page = await api({ action: 'tokens_page', wallet, cursor: nextCursor }, 1, 8000);
    const before = loadedTokens.length;
    appendTokens(page.tokens || []);
    nextCursor = page.nextCursor || null;
    return loadedTokens.length - before;
  } finally {
    pageLoading = false;
    updateBulkUI();
  }
}
async function showMore(count = MORE_RENDER) {
  if (pageLoading) return;
  try {
    let remaining = count;
    while (remaining > 0) {
      const added = renderFromBuffer(remaining);
      remaining -= added;
      if (remaining <= 0 || !nextCursor) break;
      const fetched = await fetchNextPage();
      if (!fetched) break;
    }
    updateBulkUI();
  } catch (error) {
    showStatus(error.message || 'Could not load more NFTs.', 'error');
  }
}

function renderToken(token) {
  const tokenId = String(token.tokenId);
  const staked = new Set((portfolio?.activeTokenIds || []).map(String)).has(tokenId);
  const card = document.createElement('article');
  card.className = `nft${staked ? ' staked' : ''}`;
  card.dataset.tokenId = tokenId;
  card.innerHTML = `
    <div class="nft-media">
      <img data-lazy-nft data-token-id="${tokenId}" alt="TOTZ #${tokenId}" decoding="async">
      <div class="nft-placeholder">#${tokenId}</div>
    </div>
    <div class="nft-body">
      <div class="nft-title"><h3>TOTZ #${tokenId}</h3><span class="rate">100 PTS/DAY</span></div>
      <div class="nft-meta">${staked ? '✅ Soft staked · NFT remains in wallet' : 'Ready to soft stake'}</div>
      <div class="nft-actions">
        <button class="btn ${staked ? 'ghost' : 'primary'}" data-action="${staked ? 'unstake' : 'stake'}">${staked ? 'UNSTAKE' : 'STAKE'}</button>
      </div>
    </div>`;
  card.querySelector('button').addEventListener('click', () => signedAction(staked ? 'unstake' : 'stake', tokenId));
  grid.appendChild(card);
  observeNftImage(card.querySelector('img[data-lazy-nft]'));
}

function stakingMessage(action, tokenId, timestamp) {
  return [
    'TOTZ Soft Staking',
    `Action: ${action}`,
    `Wallet: ${wallet}`,
    `Token ID: ${tokenId}`,
    `Chain ID: ${CHAIN_ID}`,
    `Contract: ${CONTRACT}`,
    `Timestamp: ${timestamp}`
  ].join('\n');
}
function bulkStakingMessage(action, timestamp) {
  return [
    'TOTZ Soft Staking',
    `Action: ${action}`,
    `Wallet: ${wallet}`,
    'Scope: all-current-totz',
    `Chain ID: ${CHAIN_ID}`,
    `Contract: ${CONTRACT}`,
    `Timestamp: ${timestamp}`
  ].join('\n');
}
function utf8ToHex(text) {
  return '0x' + Array.from(new TextEncoder().encode(text)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function signedAction(action, tokenId) {
  if (!wallet) return connectWallet();
  try {
    await ensureRobinhoodChain();
    const timestamp = Date.now();
    const message = stakingMessage(action, tokenId, timestamp);
    showStatus(`Sign the wallet message to ${action} TOTZ #${tokenId}. No transaction or NFT approval will be requested.`);
    const signature = await window.ethereum.request({ method: 'personal_sign', params: [utf8ToHex(message), wallet] });
    showStatus(`${action === 'stake' ? 'Staking' : 'Unstaking'} TOTZ #${tokenId}…`);
    await api({ action, wallet, tokenId, timestamp, signature }, 1, 10000);
    await loadPortfolio(true);
    showStatus(`TOTZ #${tokenId} ${action === 'stake' ? 'is now soft staked' : 'has been unstaked'}.`, 'ok');
  } catch (error) {
    showStatus(error.message || `${action} failed.`, 'error');
  }
}

async function bulkSignedAction(action) {
  if (!wallet) return connectWallet();
  const isStake = action === 'stake_all';
  const button = isStake ? $('stakeAllBtn') : $('unstakeAllBtn');
  try {
    await ensureRobinhoodChain();
    const timestamp = Date.now();
    const message = bulkStakingMessage(action, timestamp);
    showStatus(`Sign once to ${isStake ? 'soft stake all TOTZ currently in this wallet' : 'unstake all your soft-staked TOTZ'}. No NFT approval or transfer.`);
    button.disabled = true;
    const signature = await window.ethereum.request({ method: 'personal_sign', params: [utf8ToHex(message), wallet] });
    showStatus(isStake ? 'Verifying ownership and staking all your TOTZ…' : 'Unstaking all your TOTZ…');
    const result = await api({ action, wallet, timestamp, signature }, 0, 60000);
    await loadPortfolio(true);
    if (isStake) showStatus(`${result.totalOwned || portfolio.balance} TOTZ verified. ${result.stakedNow || 0} newly soft staked.`, 'ok');
    else showStatus(`${result.unstaked || 0} TOTZ unstaked.`, 'ok');
  } catch (error) {
    showStatus(error.name === 'AbortError' ? 'Bulk staking verification took too long. Please try again.' : (error.message || 'Bulk action failed.'), 'error');
  } finally {
    updateBulkUI();
  }
}

async function verifyManualToken() {
  if (!wallet) return connectWallet();
  const tokenId = $('tokenIdInput').value.trim();
  if (!/^\d+$/.test(tokenId)) {
    showStatus('Enter a valid numeric Token ID.', 'error');
    return;
  }
  try {
    showStatus(`Verifying TOTZ #${tokenId} on Robinhood Chain…`);
    const token = await api({ action: 'verify_token', wallet, tokenId }, 1, 10000);
    grid.innerHTML = '';
    renderedCount = 0;
    loadedTokens = [token];
    renderFromBuffer(1);
    showStatus(`Ownership verified for TOTZ #${tokenId}.`, 'ok');
  } catch (error) {
    showStatus(error.message || 'Could not verify that NFT.', 'error');
  }
}

connectBtn.addEventListener('click', connectWallet);
$('loadTokenBtn').addEventListener('click', verifyManualToken);
$('tokenIdInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') verifyManualToken();
});

if (window.ethereum) {
  window.ethereum.on?.('accountsChanged', (accounts) => {
    if (!accounts?.length) return location.reload();
    const nextWallet = accounts[0].toLowerCase();
    const changed = nextWallet !== wallet;
    wallet = nextWallet;
    if (changed && !connecting) loadPortfolio(true);
  });
  window.ethereum.on?.('chainChanged', () => {
    if (wallet && !connecting) loadPortfolio(true);
  });
}

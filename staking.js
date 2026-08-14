const API = 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/totz-staking';
const THUMB_BASE = 'https://yymwpnztjlyfxongwmsw.supabase.co/storage/v1/object/public/totz-thumbs';
const CHAIN_ID = 4663;
const CHAIN_HEX = '0x1237';
const CONTRACT = '0x107c4e7cf931b18e022d40184d03d00b4ec99d5a';
const MAX_SUPPLY = 4000;

let wallet = null;
let portfolio = null;
let portfolioLoad = null;
let connecting = false;

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
  return `${THUMB_BASE}/${id}.webp`;
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
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CHAIN_HEX }]
    });
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

async function loadPortfolio(force = false) {
  if (!wallet) return;
  if (portfolioLoad && !force) return portfolioLoad;

  const walletAtStart = wallet;
  portfolioLoad = (async () => {
    grid.innerHTML = '<div class="empty">Finding your TOTZ…</div>';

    try {
      const nextPortfolio = await api({ action: 'portfolio', wallet: walletAtStart }, 1, 7500);
      if (wallet !== walletAtStart) return;
      portfolio = nextPortfolio;

      $('walletStat').textContent = shortWallet(wallet);
      $('ownedStat').textContent = portfolio.balanceDisplay || portfolio.balance || 0;
      $('stakedStat').textContent = portfolio.activeTokenIds?.length ?? 0;
      $('pointsStat').textContent = Number(portfolio.totalPoints || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });

      const tokens = portfolio.tokens || [];
      if (!portfolio.enumerable) {
        manual.classList.add('show');
        grid.innerHTML = '<div class="empty">Automatic NFT discovery is temporarily unavailable. Enter a Token ID above and we will verify ownership directly on-chain.</div>';
      } else {
        manual.classList.remove('show');
        if (!tokens.length) {
          grid.innerHTML = '<div class="empty">No TOTZ found in this wallet on Robinhood Chain.</div>';
        } else {
          grid.innerHTML = '';
          tokens
            .slice()
            .sort((a, b) => Number(a.tokenId) - Number(b.tokenId))
            .forEach(renderToken);
        }
      }

      const capNote = portfolio.capped ? ` Showing the first ${portfolio.maxEnumerated} NFTs.` : '';
      showStatus(`Found ${portfolio.balance} TOTZ. ${portfolio.activeTokenIds?.length || 0} currently soft staked.${capNote}`, 'ok');
    } catch (error) {
      showStatus(error.name === 'AbortError' ? 'The collection indexer took too long to respond. Please try again.' : (error.message || 'Could not load your TOTZ.'), 'error');
      grid.innerHTML = '<div class="empty">Could not load collection data. Try again in a moment.</div>';
    } finally {
      portfolioLoad = null;
    }
  })();

  return portfolioLoad;
}

function renderToken(token) {
  const tokenId = String(token.tokenId);
  const staked = new Set((portfolio?.activeTokenIds || []).map(String)).has(tokenId);
  const image = thumbUrl(tokenId);

  const card = document.createElement('article');
  card.className = `nft${staked ? ' staked' : ''}`;
  card.dataset.tokenId = tokenId;
  card.innerHTML = `
    <div class="nft-media">
      ${image ? `<img src="${image}" alt="TOTZ #${tokenId}" loading="eager" decoding="async"><div class="nft-placeholder" style="display:none">#${tokenId}</div>` : `<div class="nft-placeholder">#${tokenId}</div>`}
    </div>
    <div class="nft-body">
      <div class="nft-title"><h3>TOTZ #${tokenId}</h3><span class="rate">100 PTS/DAY</span></div>
      <div class="nft-meta">${staked ? '✅ Soft staked · NFT remains in wallet' : 'Ready to soft stake'}</div>
      <div class="nft-actions">
        <button class="btn ${staked ? 'ghost' : 'primary'}" data-action="${staked ? 'unstake' : 'stake'}">${staked ? 'UNSTAKE' : 'STAKE'}</button>
      </div>
    </div>`;

  const img = card.querySelector('.nft-media img');
  img?.addEventListener('load', () => {
    const placeholder = card.querySelector('.nft-placeholder');
    if (placeholder) placeholder.style.display = 'none';
  }, { once: true });
  img?.addEventListener('error', () => {
    img.style.display = 'none';
    const placeholder = card.querySelector('.nft-placeholder');
    if (placeholder) placeholder.style.display = 'grid';
  }, { once: true });

  card.querySelector('button').addEventListener('click', () => signedAction(staked ? 'unstake' : 'stake', tokenId));
  grid.appendChild(card);
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
    const signature = await window.ethereum.request({
      method: 'personal_sign',
      params: [utf8ToHex(message), wallet]
    });

    showStatus(`${action === 'stake' ? 'Staking' : 'Unstaking'} TOTZ #${tokenId}…`);
    await api({ action, wallet, tokenId, timestamp, signature }, 1, 10000);
    await loadPortfolio(true);
    showStatus(`TOTZ #${tokenId} ${action === 'stake' ? 'is now soft staked' : 'has been unstaked'}.`, 'ok');
  } catch (error) {
    showStatus(error.message || `${action} failed.`, 'error');
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
    renderToken(token);
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

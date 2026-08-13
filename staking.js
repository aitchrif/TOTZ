const API = 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/totz-staking';
const CHAIN_ID = 4663;
const CHAIN_HEX = '0x1237';
const CONTRACT = '0x107c4e7cf931b18e022d40184d03d00b4ec99d5a';

let wallet = null;
let portfolio = null;

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

function toGateway(uri) {
  if (!uri) return null;
  if (uri.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  return uri;
}

async function api(body) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
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
    await loadPortfolio();
  } catch (error) {
    showStatus(error.message || 'Could not connect wallet.', 'error');
  } finally {
    connectBtn.disabled = false;
  }
}

async function loadPortfolio() {
  if (!wallet) return;
  grid.innerHTML = '<div class="empty">Checking Robinhood Chain…</div>';
  try {
    portfolio = await api({ action: 'portfolio', wallet });
    $('walletStat').textContent = shortWallet(wallet);
    $('ownedStat').textContent = portfolio.balance ?? 0;
    $('stakedStat').textContent = portfolio.activeTokenIds?.length ?? 0;
    $('pointsStat').textContent = Number(portfolio.totalPoints || 0).toLocaleString();

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
        for (const token of tokens) await renderToken(token);
      }
    }

    const capNote = portfolio.capped ? ` Showing the first ${portfolio.maxEnumerated} NFTs.` : '';
    showStatus(`Found ${portfolio.balance} TOTZ. ${portfolio.activeTokenIds?.length || 0} currently soft staked.${capNote}`, 'ok');
  } catch (error) {
    showStatus(error.message || 'Could not load your TOTZ.', 'error');
    grid.innerHTML = '<div class="empty">Could not load collection data. Try again in a moment.</div>';
  }
}

async function metadataFor(token) {
  // After reveal, the contract's current tokenURI is the source of truth.
  // Indexer metadata can stay cached on the old hidden artwork for a while.
  if (token?.tokenURI) {
    try {
      if (token.tokenURI.startsWith('data:application/json;base64,')) {
        return JSON.parse(atob(token.tokenURI.split(',')[1]));
      }
      if (token.tokenURI.startsWith('data:application/json,')) {
        return JSON.parse(decodeURIComponent(token.tokenURI.split(',').slice(1).join(',')));
      }
      const res = await fetch(toGateway(token.tokenURI), { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch (_) {}
  }

  // Fall back to Blockscout only if live tokenURI metadata cannot be loaded.
  if (token?.metadata && typeof token.metadata === 'object') return token.metadata;
  return {};
}

async function renderToken(token) {
  const tokenId = String(token.tokenId);
  const staked = new Set((portfolio?.activeTokenIds || []).map(String)).has(tokenId);
  const meta = await metadataFor(token);
  const image = toGateway(
    meta.image ||
    meta.image_url ||
    token.imageUrl ||
    ''
  );
  const card = document.createElement('article');
  card.className = `nft${staked ? ' staked' : ''}`;
  card.dataset.tokenId = tokenId;
  card.innerHTML = `
    <div class="nft-media">${image ? `<img src="${image}" alt="TOTZ #${tokenId}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><div class="nft-placeholder" style="display:none">#${tokenId}</div>` : `<div class="nft-placeholder">#${tokenId}</div>`}</div>
    <div class="nft-body">
      <div class="nft-title"><h3>${meta.name || `TOTZ #${tokenId}`}</h3><span class="rate">100 PTS/DAY</span></div>
      <div class="nft-meta">${staked ? '✅ Soft staked · NFT remains in wallet' : 'Ready to soft stake'}</div>
      <div class="nft-actions">
        <button class="btn ${staked ? 'ghost' : 'primary'}" data-action="${staked ? 'unstake' : 'stake'}">${staked ? 'UNSTAKE' : 'STAKE'}</button>
      </div>
    </div>`;
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
    await api({ action, wallet, tokenId, timestamp, signature });
    await loadPortfolio();
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
    const token = await api({ action: 'verify_token', wallet, tokenId });
    grid.innerHTML = '';
    await renderToken(token);
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
    if (!accounts?.length) location.reload();
    wallet = accounts[0].toLowerCase();
    loadPortfolio();
  });
  window.ethereum.on?.('chainChanged', () => {
    if (wallet) loadPortfolio();
  });
}

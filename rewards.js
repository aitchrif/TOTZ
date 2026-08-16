const REWARDS_API = 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/totz-rewards';
const CHAIN_ID = 4663;
const CHAIN_HEX = '0x1237';
const CONTRACT = '0x107c4e7cf931b18e022d40184d03d00b4ec99d5a';

let wallet = null;
let rewardsState = null;
let busy = false;

const $ = (id) => document.getElementById(id);
const connectBtn = $('connectBtn');
const statusEl = $('status');
const raffleGrid = $('raffleGrid');

function shortWallet(value) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
function formatPts(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
}
function utf8ToHex(text) {
  return '0x' + Array.from(new TextEncoder().encode(text)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function showStatus(message, type = '') {
  statusEl.textContent = message;
  statusEl.className = `status show ${type}`;
}
function setBusy(value) {
  busy = value;
  document.querySelectorAll('[data-enter-raffle]').forEach((btn) => btn.disabled = value || btn.dataset.disabled === '1');
  connectBtn.disabled = value;
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

async function api(body, timeoutMs = 12000) {
  const res = await fetchWithTimeout(REWARDS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store'
  }, timeoutMs);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
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

async function connectWallet(silent = false) {
  if (!window.ethereum) {
    showStatus('No EVM wallet detected. Open this page in MetaMask, Robinhood Wallet, or another EVM wallet browser.', 'error');
    return;
  }
  if (busy) return;
  setBusy(true);
  if (!silent) showStatus('Connecting wallet…');
  try {
    const method = silent ? 'eth_accounts' : 'eth_requestAccounts';
    const accounts = await window.ethereum.request({ method });
    if (!accounts?.length) {
      if (!silent) throw new Error('No wallet account selected.');
      return;
    }
    wallet = accounts[0].toLowerCase();
    await ensureRobinhoodChain();
    connectBtn.textContent = shortWallet(wallet);
    $('connectTitle').textContent = 'Wallet connected';
    $('connectSub').innerHTML = `Spend the PTS earned by <span class="wallet-chip">${shortWallet(wallet)}</span>.`;
    $('dashboard').hidden = false;
    await loadRewards();
  } catch (error) {
    showStatus(error.message || 'Could not connect wallet.', 'error');
  } finally {
    setBusy(false);
  }
}

async function loadRewards() {
  if (!wallet) return;
  try {
    const data = await api({ action: 'summary', wallet });
    rewardsState = data;
    $('availableStat').textContent = formatPts(data.points?.available);
    $('earnedStat').textContent = formatPts(data.points?.earned);
    $('spentStat').textContent = formatPts(data.points?.spent);
    $('entriesStat').textContent = Number(data.totalEntries || 0).toLocaleString();
    renderRaffles(data.raffles || []);
    showStatus(`You have ${formatPts(data.points?.available)} PTS available to spend.`, 'ok');
  } catch (error) {
    showStatus(error.message || 'Could not load rewards.', 'error');
    raffleGrid.innerHTML = '<div class="empty">Could not load raffles. Try again in a moment.</div>';
  }
}

function raffleEndsLabel(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderRaffles(raffles) {
  if (!raffles.length) {
    raffleGrid.innerHTML = '<div class="empty">No active raffles right now. Keep earning PTS — new rewards will appear here.</div>';
    return;
  }
  raffleGrid.innerHTML = '';
  const available = Number(rewardsState?.points?.available || 0);

  raffles.forEach((raffle) => {
    const cost = Number(raffle.entry_cost || 0);
    const currentEntries = Number(raffle.walletEntries || 0);
    const maxEntries = raffle.max_entries_per_wallet == null ? null : Number(raffle.max_entries_per_wallet);
    const remaining = maxEntries == null ? 1000 : Math.max(0, maxEntries - currentEntries);
    const beta = String(raffle.title || '').toUpperCase().includes('BETA');

    const card = document.createElement('article');
    card.className = 'raffle-card';
    card.dataset.raffleId = raffle.id;
    card.innerHTML = `
      <div class="prize-media">
        ${raffle.prize_image_url ? `<img src="${raffle.prize_image_url}" alt="${raffle.prize_name || raffle.title}">` : '<div class="prize-placeholder">🎟️</div>'}
        ${beta ? '<span class="beta-badge">BETA TEST</span>' : ''}
      </div>
      <div class="raffle-body">
        <div class="raffle-top">
          <div>
            <span class="type-badge">RAFFLE</span>
            <h3>${raffle.title}</h3>
          </div>
          <span class="cost-badge">${formatPts(cost)} PTS / ENTRY</span>
        </div>
        <p class="prize-name">🏆 ${raffle.prize_name}</p>
        <p class="raffle-desc">${raffle.description || ''}</p>
        <div class="raffle-info">
          <span><b>Your entries</b><strong>${currentEntries}${maxEntries ? ` / ${maxEntries}` : ''}</strong></span>
          <span><b>Ends</b><strong>${raffleEndsLabel(raffle.ends_at)}</strong></span>
        </div>
        <div class="entry-box">
          <div class="qty-control">
            <button type="button" data-minus>−</button>
            <input data-qty type="number" min="1" max="${Math.max(1, remaining)}" value="1" inputmode="numeric">
            <button type="button" data-plus>+</button>
          </div>
          <div class="entry-total"><small>TOTAL</small><strong data-total>${formatPts(cost)} PTS</strong></div>
        </div>
        <button class="btn primary enter-btn" data-enter-raffle type="button">ENTER RAFFLE</button>
        <p class="fine-note">Wallet signature only · no gas · no NFT approval.</p>
      </div>`;

    const qtyInput = card.querySelector('[data-qty]');
    const totalEl = card.querySelector('[data-total]');
    const enterBtn = card.querySelector('[data-enter-raffle]');

    const sync = () => {
      let qty = Math.max(1, Math.floor(Number(qtyInput.value || 1)));
      if (remaining > 0) qty = Math.min(qty, remaining);
      qtyInput.value = String(qty);
      const totalCost = cost * qty;
      totalEl.textContent = `${formatPts(totalCost)} PTS`;
      const disabled = remaining <= 0 || totalCost > available + 0.0005;
      enterBtn.disabled = disabled || busy;
      enterBtn.dataset.disabled = disabled ? '1' : '0';
      if (remaining <= 0) enterBtn.textContent = 'ENTRY LIMIT REACHED';
      else if (totalCost > available + 0.0005) enterBtn.textContent = 'NOT ENOUGH PTS';
      else enterBtn.textContent = 'ENTER RAFFLE';
    };

    card.querySelector('[data-minus]').addEventListener('click', () => {
      qtyInput.value = String(Math.max(1, Number(qtyInput.value || 1) - 1));
      sync();
    });
    card.querySelector('[data-plus]').addEventListener('click', () => {
      qtyInput.value = String(Math.min(Math.max(1, remaining), Number(qtyInput.value || 1) + 1));
      sync();
    });
    qtyInput.addEventListener('input', sync);
    enterBtn.addEventListener('click', () => enterRaffle(raffle, Number(qtyInput.value || 1)));
    sync();
    raffleGrid.appendChild(card);
  });
}

function raffleMessage(raffle, entries, timestamp) {
  const entryCost = Number(raffle.entry_cost).toString();
  return [
    'TOTZ Rewards',
    'Action: enter_raffle',
    `Wallet: ${wallet}`,
    `Raffle ID: ${raffle.id}`,
    `Entries: ${entries}`,
    `Entry Cost: ${entryCost}`,
    `Chain ID: ${CHAIN_ID}`,
    `Contract: ${CONTRACT}`,
    `Timestamp: ${timestamp}`
  ].join('\n');
}

async function enterRaffle(raffle, entries) {
  if (!wallet) return connectWallet();
  if (busy) return;
  try {
    setBusy(true);
    await ensureRobinhoodChain();
    const timestamp = Date.now();
    const message = raffleMessage(raffle, entries, timestamp);
    const totalCost = Number(raffle.entry_cost) * entries;
    showStatus(`Sign to spend ${formatPts(totalCost)} PTS for ${entries} raffle entr${entries === 1 ? 'y' : 'ies'}. No transaction will be sent.`);
    const signature = await window.ethereum.request({
      method: 'personal_sign',
      params: [utf8ToHex(message), wallet]
    });
    showStatus('Adding your raffle entries…');
    const result = await api({
      action: 'enter_raffle',
      wallet,
      raffleId: raffle.id,
      entries,
      timestamp,
      signature
    }, 15000);
    await loadRewards();
    showStatus(`Entry confirmed: +${result.entriesAdded} entr${result.entriesAdded === 1 ? 'y' : 'ies'} · ${formatPts(result.pointsSpent)} PTS spent.`, 'ok');
  } catch (error) {
    showStatus(error.message || 'Could not enter raffle.', 'error');
  } finally {
    setBusy(false);
  }
}

connectBtn.addEventListener('click', () => connectWallet(false));

if (window.ethereum) {
  window.ethereum.on?.('accountsChanged', (accounts) => {
    if (!accounts?.length) return location.reload();
    wallet = accounts[0].toLowerCase();
    connectBtn.textContent = shortWallet(wallet);
    loadRewards();
  });
  window.ethereum.on?.('chainChanged', () => {
    if (wallet) loadRewards();
  });
  connectWallet(true);
}

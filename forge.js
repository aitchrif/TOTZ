(() => {
  const GENESIS = '0x107c4e7cf931b18e022d40184d03d00b4ec99d5a';
  const CHAINS = {
    robinhood: { key: 'robinhood', name: 'Robinhood Chain', short: 'ROBINHOOD', chainId: 4663, explorer: 'https://robinhoodchain.blockscout.com' },
    ink: { key: 'ink', name: 'Ink', short: 'INK', chainId: 57073, explorer: 'https://explorer.inkonchain.com' },
    ethereum: { key: 'ethereum', name: 'Ethereum', short: 'ETHEREUM', chainId: 1, explorer: 'https://etherscan.io' }
  };

  // Stable public brand assets. Robinhood uses the Chain icon published on Robinhood's CDN.
  const NETWORK_LOGOS = {
    robinhood: 'https://cdn.robinhood.com/assets/generated_assets/hoodchain_docsite/rh_favicon_120.png',
    ink: 'https://docs.inkonchain.com/images/brand-kit/docs-logo-symbol.png',
    ethereum: 'https://ethereum.org/images/assets/svgs/eth-diamond-glyph.svg'
  };
  const NETWORK_FALLBACKS = { robinhood: 'RH', ink: 'INK', ethereum: 'Ξ' };

  const $ = (id) => document.getElementById(id);
  let selectedChain = 'robinhood';
  let current = null;
  let connectedWallet = null;

  const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
  const fmt = (n, max = 0) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: max });
  const pct = (n) => `${Number(n || 0).toFixed(Number(n || 0) >= 10 ? 1 : 2)}%`;
  const shortAddress = (address) => address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '—';
  const isAddress = (value) => /^0x[a-fA-F0-9]{40}$/.test(String(value || ''));

  function toast(message) {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  function showStatus(message, type = '') {
    const el = $('scanStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `scan-status show ${type}`;
  }

  function clearStatus() {
    const el = $('scanStatus');
    if (!el) return;
    el.textContent = '';
    el.className = 'scan-status';
  }

  function invalidateCurrentResult({ clearMessage = false } = {}) {
    current = null;
    if ($('dashboard')) $('dashboard').hidden = true;
    if (clearMessage) clearStatus();
  }

  function setBusy(busy) {
    $('scanBtn').disabled = busy;
    $('genesisBtn').disabled = busy;
    document.querySelectorAll('.network-btn').forEach((btn) => { btn.disabled = busy; });
    $('scanBtn').textContent = busy ? 'SCANNING…' : 'SCAN COLLECTION';
  }

  function installNetworkLogos() {
    if (!document.getElementById('forge-network-logo-style')) {
      const style = document.createElement('style');
      style.id = 'forge-network-logo-style';
      style.textContent = `
        .network-icon{
          width:38px!important;height:38px!important;flex:0 0 38px!important;
          border-radius:12px!important;background:#fff!important;color:var(--ink)!important;
          border:1px solid rgba(43,33,64,.09)!important;display:grid!important;place-items:center!important;
          padding:0!important;overflow:hidden!important;box-shadow:0 2px 7px rgba(43,33,64,.05);
        }
        .network-btn.active .network-icon{background:#fff!important;color:var(--ink)!important}
        .network-icon img{display:block;object-fit:contain;object-position:center;margin:auto}
        .network-btn[data-chain="robinhood"] .network-icon img{width:30px;height:30px;border-radius:8px}
        .network-btn[data-chain="ink"] .network-icon img{width:28px;height:28px;border-radius:7px}
        .network-btn[data-chain="ethereum"] .network-icon img{width:22px;height:28px}
        .network-icon.logo-fallback{font-family:'Baloo 2',cursive;font-size:.72rem;font-weight:900}
      `;
      document.head.appendChild(style);
    }

    document.querySelectorAll('.network-btn').forEach((btn) => {
      const chain = btn.dataset.chain;
      const icon = btn.querySelector('.network-icon');
      const src = NETWORK_LOGOS[chain];
      if (!icon || !src) return;

      icon.classList.remove('logo-fallback');
      icon.textContent = '';
      const img = document.createElement('img');
      img.src = src;
      img.alt = `${CHAINS[chain]?.name || chain} network logo`;
      img.loading = 'eager';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => {
        icon.textContent = NETWORK_FALLBACKS[chain] || '';
        icon.classList.add('logo-fallback');
      };
      icon.appendChild(img);
    });
  }

  async function fetchJson(url, options = {}, timeoutMs = 45000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  function setNetwork(chainKey, { updateUrl = true } = {}) {
    if (!CHAINS[chainKey]) return;
    const changed = selectedChain !== chainKey;
    selectedChain = chainKey;
    document.querySelectorAll('.network-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.chain === chainKey));

    if (changed) invalidateCurrentResult({ clearMessage: true });

    if (updateUrl) {
      const url = new URL(location.href);
      url.searchParams.set('chain', chainKey);
      if (changed) url.searchParams.delete('contract');
      history.replaceState({}, '', url);
    }
    if (chainKey !== 'robinhood' && $('contractInput').value.trim().toLowerCase() === GENESIS) $('contractInput').value = '';
  }

  function fetchForgeData(contract) {
    return fetchJson(`/api/forge-holders?chain=${encodeURIComponent(selectedChain)}&contract=${encodeURIComponent(contract)}`, {}, 55000);
  }

  function scoreMetrics(holders, supply) {
    const total = Math.max(1, Number(supply || holders.reduce((sum, h) => sum + Number(h.balance || 0), 0)));
    const top10 = holders.slice(0, 10).reduce((sum, h) => sum + Number(h.balance || 0), 0) / total * 100;
    const largest = Number(holders[0]?.balance || 0) / total * 100;
    const ratio = holders.length / total * 100;
    const distribution = clamp(100 - top10 * 1.35);
    const whale = clamp(100 - largest * 4.5);
    const spread = clamp(ratio * 2.15);
    const score = Math.round(distribution * .45 + whale * .25 + spread * .30);
    return { top10, largest, ratio, distribution: Math.round(distribution), whale: Math.round(whale), spread: Math.round(spread), score };
  }

  function concentrationRows(holders, supply) {
    const total = Math.max(1, Number(supply || 0));
    return [1, 5, 10, 25, 50].map((count) => ({
      count,
      share: holders.slice(0, count).reduce((sum, h) => sum + Number(h.balance || 0), 0) / total * 100
    }));
  }

  function snapshotKey(chain, contract) { return `totz_forge_snapshot_v2_${chain}_${contract.toLowerCase()}`; }

  function compareSnapshot(chain, contract, holders) {
    let previous = null;
    try { previous = JSON.parse(localStorage.getItem(snapshotKey(chain, contract)) || 'null'); } catch (_) {}
    const balances = Object.fromEntries(holders.map((h) => [h.address.toLowerCase(), Number(h.balance || 0)]));
    const result = { first: !previous?.balances, previousAt: previous?.timestamp || null, newHolders: 0, accumulating: 0, reducing: 0, exits: 0 };

    if (previous?.balances) {
      for (const [address, balance] of Object.entries(balances)) {
        const before = Number(previous.balances[address] || 0);
        if (before === 0) result.newHolders++;
        else if (balance > before) result.accumulating++;
        else if (balance < before) result.reducing++;
      }
      for (const [address, balance] of Object.entries(previous.balances)) {
        if (Number(balance) > 0 && !balances[address]) result.exits++;
      }
    }

    try { localStorage.setItem(snapshotKey(chain, contract), JSON.stringify({ timestamp: Date.now(), balances })); } catch (_) {}
    return result;
  }

  function renderMovements(movement) {
    if (movement.first) {
      $('newMove').textContent = '—'; $('upMove').textContent = '—'; $('downMove').textContent = '—'; $('exitMove').textContent = '—';
      $('baselineNote').textContent = 'Baseline created in this browser. Scan this collection again later to compare holder movement.';
      return;
    }
    $('newMove').textContent = `+${fmt(movement.newHolders)}`;
    $('upMove').textContent = `+${fmt(movement.accumulating)}`;
    $('downMove').textContent = movement.reducing ? `-${fmt(movement.reducing)}` : '0';
    $('exitMove').textContent = movement.exits ? `-${fmt(movement.exits)}` : '0';
    $('baselineNote').textContent = `Compared with your previous local scan from ${new Date(movement.previousAt).toLocaleString()}. Baseline updated.`;
  }

  function renderConcentration(holders, supply) {
    const rows = concentrationRows(holders, supply);
    $('concentrationList').innerHTML = rows.map(({ count, share }) => `<div class="conc-row"><span>TOP ${count}</span><div class="conc-bar"><i style="width:${Math.min(100, share).toFixed(2)}%"></i></div><b>${pct(share)}</b></div>`).join('');
    $('concLabel').textContent = `${fmt(holders.length)} HOLDERS`;
  }

  function getMinHolding() {
    const selected = $('minHoldings').value;
    if (selected !== 'custom') return Math.max(1, Number(selected || 1));
    return Math.max(1, Math.floor(Number($('customMin').value || 1)));
  }

  function filteredHolders() {
    if (!current) return [];
    const query = $('holderSearch').value.trim().toLowerCase();
    const min = getMinHolding();
    return current.holders.filter((h) => Number(h.balance || 0) >= min && (!query || h.address.includes(query)));
  }

  function renderTable() {
    if (!current) return;
    const rows = filteredHolders();
    const min = getMinHolding();
    const query = $('holderSearch').value.trim();
    $('resultCountTag').textContent = `${fmt(rows.length)} WALLET${rows.length === 1 ? '' : 'S'}`;
    const parts = [];
    if (min > 1) parts.push(`${min}+ NFTs`);
    if (query) parts.push(`wallet search "${query}"`);
    $('filterSummary').textContent = parts.length ? `Filtered by ${parts.join(' · ')}` : 'Showing all holders';

    if (!rows.length) {
      $('holderRows').innerHTML = '<tr><td class="empty-row" colspan="5">No wallets match this filter.</td></tr>';
      return;
    }

    const limit = Math.min(rows.length, 500);
    $('holderRows').innerHTML = rows.slice(0, limit).map((h) => {
      const rank = current.rankByAddress[h.address] || current.holders.indexOf(h) + 1;
      const share = current.supply ? Number(h.balance || 0) / current.supply * 100 : 0;
      return `<tr><td><span class="rank-badge">${rank}</span></td><td class="wallet">${h.address}</td><td><span class="balance-badge">${fmt(h.balance)}</span></td><td>${pct(share)}</td><td><a href="${current.chain.explorer}/address/${h.address}" target="_blank" rel="noopener">OPEN ↗</a></td></tr>`;
    }).join('') + (rows.length > limit ? `<tr><td class="empty-row" colspan="5">Showing first ${fmt(limit)} of ${fmt(rows.length)} matching wallets. Copy or export includes the full filtered set.</td></tr>` : '');
  }

  function lookupWallet(value = $('lookupInput').value) {
    if (!current) return;
    const address = String(value || '').trim().toLowerCase();
    if (!isAddress(address)) {
      $('lookupBalance').textContent = '—'; $('lookupRank').textContent = '—'; $('lookupPercentile').textContent = '—';
      $('lookupMessage').textContent = 'Enter a valid 0x wallet address.';
      return;
    }
    const holder = current.holderByAddress[address];
    if (!holder) {
      $('lookupBalance').textContent = '0'; $('lookupRank').textContent = '—'; $('lookupPercentile').textContent = '—';
      $('lookupMessage').textContent = `${shortAddress(address)} does not hold this collection at snapshot block #${fmt(current.snapshotBlock)}.`;
      return;
    }
    const rank = current.rankByAddress[address];
    const percentile = rank / Math.max(1, current.holders.length) * 100;
    $('lookupBalance').textContent = fmt(holder.balance);
    $('lookupRank').textContent = `#${fmt(rank)}`;
    $('lookupPercentile').textContent = `${Math.max(.1, percentile).toFixed(percentile < 10 ? 1 : 0)}%`;
    $('lookupMessage').textContent = `${shortAddress(address)} holds ${fmt(holder.balance)} NFT${Number(holder.balance) === 1 ? '' : 's'} · ${pct(Number(holder.balance) / current.supply * 100)} of supply.`;
  }

  function renderDashboard(contract, data) {
    const info = data.info || {};
    const holders = (data.holders || [])
      .map((h) => ({ address: String(h.address || '').toLowerCase(), balance: Number(h.balance || 0) }))
      .filter((h) => isAddress(h.address) && h.balance > 0)
      .sort((a, b) => b.balance - a.balance || a.address.localeCompare(b.address));
    const supply = Number(info.totalSupply || holders.reduce((sum, h) => sum + h.balance, 0));
    const metrics = scoreMetrics(holders, supply);
    const chain = CHAINS[selectedChain];
    const movement = compareSnapshot(selectedChain, contract, holders);
    const rankByAddress = {};
    const holderByAddress = {};
    holders.forEach((h, index) => { rankByAddress[h.address] = index + 1; holderByAddress[h.address] = h; });

    current = { contract, info, holders, supply, metrics, chain, rankByAddress, holderByAddress, snapshotBlock: Number(data.snapshotBlock || 0), fetchedAt: data.fetchedAt || new Date().toISOString(), source: data.source || '' };

    $('collectionName').textContent = `${info.name || 'NFT Collection'}${info.symbol ? ` · ${info.symbol}` : ''}`;
    $('collectionContract').textContent = contract;
    $('chainBadge').textContent = `${chain.name.toUpperCase()} · ${chain.chainId}`;
    $('scanTime').textContent = new Date(current.fetchedAt).toLocaleString();
    $('scanBlock').textContent = current.snapshotBlock ? `Block #${fmt(current.snapshotBlock)}` : 'Block pinned';
    $('supplyStat').textContent = fmt(supply);
    $('holdersStat').textContent = fmt(holders.length);
    $('holderRatioStat').textContent = pct(metrics.ratio);
    $('top10Stat').textContent = pct(metrics.top10);
    $('largestStat').textContent = pct(metrics.largest);
    $('whalesStat').textContent = fmt(holders.filter((h) => h.balance >= 10).length);

    $('scoreRing').style.setProperty('--score', metrics.score);
    $('scoreStat').textContent = metrics.score;
    $('distributionScore').textContent = metrics.distribution;
    $('whaleScore').textContent = metrics.whale;
    $('spreadScore').textContent = metrics.spread;
    $('distributionMeter').style.width = `${metrics.distribution}%`;
    $('whaleMeter').style.width = `${metrics.whale}%`;
    $('spreadMeter').style.width = `${metrics.spread}%`;

    renderMovements(movement);
    renderConcentration(holders, supply);
    $('holderSearch').value = '';
    $('minHoldings').value = '1';
    $('customMin').value = '';
    $('customMin').classList.remove('show');
    $('lookupInput').value = '';
    $('lookupBalance').textContent = '—'; $('lookupRank').textContent = '—'; $('lookupPercentile').textContent = '—';
    $('lookupMessage').textContent = 'Paste a wallet to inspect its current position.';
    renderTable();
    $('dashboard').hidden = false;
    requestAnimationFrame(() => $('dashboard').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  async function scan(contractValue) {
    const contract = String(contractValue || $('contractInput').value || '').trim().toLowerCase();
    if (!isAddress(contract)) {
      invalidateCurrentResult();
      showStatus('Enter a valid ERC-721 contract address.', 'error');
      return;
    }

    $('contractInput').value = contract;
    invalidateCurrentResult();
    setBusy(true);
    showStatus(`Reading ${CHAINS[selectedChain].name} at one pinned block…`);
    try {
      const data = await fetchForgeData(contract);
      if (!Array.isArray(data.holders) || !data.holders.length) throw new Error('No current holders found for this contract.');
      renderDashboard(contract, data);
      const blockText = data.snapshotBlock ? ` at block #${fmt(data.snapshotBlock)}` : '';
      showStatus(`Snapshot complete · ${fmt(data.holders.length)} holders${blockText} · ${CHAINS[selectedChain].name}.`, 'ok');
      const url = new URL(location.href);
      url.searchParams.set('chain', selectedChain);
      url.searchParams.set('contract', contract);
      history.replaceState({}, '', url);
    } catch (error) {
      invalidateCurrentResult();
      let message = error?.message || 'Could not scan this collection.';
      if (error?.name === 'AbortError') message = 'The scan took too long. Please retry.';
      if (/failed to fetch/i.test(message)) message = 'FORGE backend could not be reached. Refresh and retry.';
      showStatus(message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

  function exportCsv() {
    if (!current) return;
    const filtered = filteredHolders();
    const min = getMinHolding();
    const query = $('holderSearch').value.trim();
    const rows = [
      ['TOTZ FORGE HOLDER SNAPSHOT', ''],
      ['Collection', current.info.name || 'NFT Collection'], ['Symbol', current.info.symbol || ''],
      ['Network', current.chain.name], ['Chain ID', current.chain.chainId], ['Contract', current.contract],
      ['Snapshot Block', current.snapshotBlock || ''], ['Snapshot UTC', new Date(current.fetchedAt).toISOString()],
      ['On-chain Supply', current.supply], ['On-chain Holders', current.holders.length],
      ['Exported Wallets', filtered.length], ['Minimum Holdings', min], ['Wallet Search', query || 'None'],
      [], ['Rank', 'Wallet', 'NFTs Held', 'Supply %']
    ];
    filtered.forEach((h) => rows.push([current.rankByAddress[h.address], h.address, Number(h.balance || 0), current.supply ? (Number(h.balance || 0) / current.supply * 100).toFixed(4) : '0.0000']));
    const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const collectionSlug = (current.info.symbol || current.info.name || 'collection').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const filterSlug = min > 1 ? `-${min}plus` : '';
    link.download = `forge-${current.chain.key}-${collectionSlug || 'collection'}${filterSlug}-holders.csv`;
    document.body.appendChild(link);
    link.click();
    const href = link.href;
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    toast(`Exported ${fmt(filtered.length)} wallets`);
  }

  async function copyWallets() {
    if (!current) return;
    const rows = filteredHolders();
    const text = rows.map((h) => h.address).join('\n');
    if (!text) return toast('No wallets match this filter');
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const area = document.createElement('textarea');
      area.value = text; area.style.position = 'fixed'; area.style.opacity = '0';
      document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove();
    }
    toast(`Copied ${fmt(rows.length)} wallets`);
  }

  function checkGenesisBalance(wallet) {
    return fetchJson(`/api/forge-holders?chain=robinhood&mode=balance&contract=${GENESIS}&wallet=${encodeURIComponent(wallet)}`, {}, 18000);
  }

  async function connectWallet() {
    if (!window.ethereum) {
      $('accessTitle').textContent = 'NO WALLET'; $('accessSub').textContent = 'EVM wallet not detected';
      alert('No EVM browser wallet detected.');
      return;
    }
    const btn = $('connectBtn');
    btn.disabled = true; btn.textContent = 'CONNECTING…';
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts?.length) throw new Error('No wallet selected.');
      connectedWallet = accounts[0].toLowerCase();
      btn.textContent = shortAddress(connectedWallet);
      const data = await checkGenesisBalance(connectedWallet);
      const balance = Number(data.balance || 0);
      if (balance > 0) {
        $('accessCard').classList.add('unlocked'); $('accessTitle').textContent = 'UNLOCKED ✓'; $('accessSub').textContent = `${fmt(balance)} TOTZ Genesis detected`;
      } else {
        $('accessCard').classList.remove('unlocked'); $('accessTitle').textContent = 'GENESIS NOT FOUND'; $('accessSub').textContent = `${shortAddress(connectedWallet)} · 0 TOTZ`;
      }
    } catch (error) {
      btn.textContent = 'CONNECT WALLET'; $('accessTitle').textContent = 'CHECK FAILED'; $('accessSub').textContent = error?.message || 'Try again';
    } finally {
      btn.disabled = false;
    }
  }

  installNetworkLogos();
  document.querySelectorAll('.network-btn').forEach((btn) => btn.addEventListener('click', () => setNetwork(btn.dataset.chain)));
  $('scanBtn').addEventListener('click', () => scan());
  $('genesisBtn').addEventListener('click', () => { setNetwork('robinhood'); $('contractInput').value = GENESIS; scan(GENESIS); });
  $('contractInput').addEventListener('input', () => {
    if (!current) return;
    const nextContract = $('contractInput').value.trim().toLowerCase();
    if (nextContract !== current.contract) invalidateCurrentResult({ clearMessage: true });
  });
  $('contractInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') scan(); });
  $('holderSearch').addEventListener('input', renderTable);
  $('minHoldings').addEventListener('change', () => { $('customMin').classList.toggle('show', $('minHoldings').value === 'custom'); renderTable(); });
  $('customMin').addEventListener('input', renderTable);
  $('copyBtn').addEventListener('click', copyWallets);
  $('exportBtn').addEventListener('click', exportCsv);
  $('lookupBtn').addEventListener('click', () => lookupWallet());
  $('lookupInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') lookupWallet(); });
  $('connectBtn').addEventListener('click', connectWallet);

  const params = new URLSearchParams(location.search);
  const chainParam = params.get('chain');
  const contractParam = params.get('contract');
  if (CHAINS[chainParam]) setNetwork(chainParam, { updateUrl: false });
  if (isAddress(contractParam)) {
    $('contractInput').value = contractParam.toLowerCase();
    setTimeout(() => scan(contractParam), 120);
  }
})();
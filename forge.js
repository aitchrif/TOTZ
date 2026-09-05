(() => {
  const GENESIS = '0x107c4e7cf931b18e022d40184d03d00b4ec99d5a';
  const BLOCKSCOUT = 'https://robinhoodchain.blockscout.com';
  const RPC = 'https://rpc.mainnet.chain.robinhood.com';
  const $ = (id) => document.getElementById(id);
  let current = null;
  let whaleOnly = false;
  let connectedWallet = null;

  function clamp(n, min = 0, max = 100) { return Math.max(min, Math.min(max, n)); }
  function shortAddress(address) { return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '—'; }
  function fmt(n, max = 0) { return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: max }); }
  function pct(n) { return `${Number(n || 0).toFixed(n >= 10 ? 1 : 2)}%`; }
  function isAddress(value) { return /^0x[a-fA-F0-9]{40}$/.test(value || ''); }
  function showStatus(message, type = '') { const el = $('scanStatus'); el.textContent = message; el.className = `scan-status show ${type}`; }
  function setBusy(busy) { $('scanBtn').disabled = busy; $('genesisBtn').disabled = busy; $('scanBtn').textContent = busy ? 'SCANNING…' : 'SCAN COLLECTION'; }

  async function fetchJson(url, options = {}, timeoutMs = 30000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchForgeData(contract) {
    const data = await fetchJson(`/api/forge-holders?contract=${encodeURIComponent(contract)}`, {}, 35000);
    if (!Array.isArray(data.holders) || !data.holders.length) throw new Error('No current holders found for this contract.');
    return data;
  }

  function tierFor(balance) {
    if (balance >= 35) return '35+';
    if (balance >= 10) return '10–34';
    if (balance >= 5) return '5–9';
    if (balance >= 2) return '2–4';
    return '1';
  }
  function tierForCsv(balance) {
    if (balance >= 35) return '35+';
    if (balance >= 10) return '10-34';
    if (balance >= 5) return '5-9';
    if (balance >= 2) return '2-4';
    return '1';
  }
  function tierCounts(holders) {
    const tiers = { '1': 0, '2–4': 0, '5–9': 0, '10–34': 0, '35+': 0 };
    holders.forEach((h) => { tiers[tierFor(h.balance)]++; });
    return tiers;
  }

  function scoreMetrics(holders, supply) {
    const total = Math.max(1, supply || holders.reduce((sum, h) => sum + h.balance, 0));
    const top10 = holders.slice(0, 10).reduce((sum, h) => sum + h.balance, 0) / total * 100;
    const largest = (holders[0]?.balance || 0) / total * 100;
    const ratio = holders.length / total * 100;
    const distribution = clamp(100 - top10 * 1.35);
    const whale = clamp(100 - largest * 4.5);
    const spread = clamp(ratio * 2.15);
    const score = Math.round(distribution * .45 + whale * .25 + spread * .30);
    return { top10, largest, ratio, distribution: Math.round(distribution), whale: Math.round(whale), spread: Math.round(spread), score };
  }

  function snapshotKey(contract) { return `totz_forge_snapshot_v1_${contract.toLowerCase()}`; }
  function compareSnapshot(contract, holders) {
    let previous = null;
    try { previous = JSON.parse(localStorage.getItem(snapshotKey(contract)) || 'null'); } catch (_) {}
    const currentMap = Object.fromEntries(holders.map((h) => [h.address, h.balance]));
    const now = Date.now();
    const result = { first: !previous?.balances, previousAt: previous?.timestamp || null, newHolders: 0, accumulating: 0, reducing: 0, exits: 0 };
    if (previous?.balances) {
      for (const [address, balance] of Object.entries(currentMap)) {
        const before = Number(previous.balances[address] || 0);
        if (before === 0) result.newHolders++;
        else if (balance > before) result.accumulating++;
        else if (balance < before) result.reducing++;
      }
      for (const [address, balance] of Object.entries(previous.balances)) {
        if (Number(balance) > 0 && !currentMap[address]) result.exits++;
      }
    }
    try { localStorage.setItem(snapshotKey(contract), JSON.stringify({ timestamp: now, balances: currentMap })); } catch (_) {}
    return result;
  }

  function renderTiers(holders) {
    const tiers = tierCounts(holders);
    const max = Math.max(1, ...Object.values(tiers));
    $('tierTotal').textContent = `${fmt(holders.length)} wallets`;
    $('tierList').innerHTML = Object.entries(tiers).map(([name, count]) => `<div class="tier-row"><span>${name} NFT${name === '1' ? '' : 's'}</span><div class="tier-bar"><i style="width:${(count / max * 100).toFixed(2)}%"></i></div><b>${fmt(count)}</b></div>`).join('');
  }

  function filteredHolders() {
    if (!current) return [];
    const query = $('holderSearch').value.trim().toLowerCase();
    return current.holders.filter((h) => (!whaleOnly || h.balance >= 10) && (!query || h.address.includes(query)));
  }

  function renderTable() {
    if (!current) return;
    const rows = filteredHolders();
    const body = $('holderRows');
    if (!rows.length) {
      body.innerHTML = '<tr><td class="empty-row" colspan="6">No wallets match this filter.</td></tr>';
      return;
    }
    const limit = Math.min(rows.length, 500);
    body.innerHTML = rows.slice(0, limit).map((h) => {
      const originalRank = current.holders.indexOf(h) + 1;
      const share = current.supply ? h.balance / current.supply * 100 : 0;
      return `<tr><td><span class="rank-badge">${originalRank}</span></td><td class="wallet">${h.address}</td><td><span class="balance-badge">${fmt(h.balance)}</span></td><td>${pct(share)}</td><td>${tierFor(h.balance)}</td><td><a href="${BLOCKSCOUT}/address/${h.address}" target="_blank" rel="noopener">OPEN ↗</a></td></tr>`;
    }).join('') + (rows.length > limit ? `<tr><td class="empty-row" colspan="6">Showing first ${fmt(limit)} of ${fmt(rows.length)} matching wallets. Export CSV for the full snapshot.</td></tr>` : '');
  }

  function renderMovements(movement) {
    if (movement.first) {
      $('newMove').textContent = '—';
      $('upMove').textContent = '—';
      $('downMove').textContent = '—';
      $('exitMove').textContent = '—';
      $('baselineNote').textContent = 'Baseline created now in this browser. Scan this collection again later to see wallet movement.';
    } else {
      $('newMove').textContent = `+${fmt(movement.newHolders)}`;
      $('upMove').textContent = `+${fmt(movement.accumulating)}`;
      $('downMove').textContent = `-${fmt(movement.reducing)}`;
      $('exitMove').textContent = `-${fmt(movement.exits)}`;
      $('baselineNote').textContent = `Compared with your previous local scan from ${new Date(movement.previousAt).toLocaleString()}. Baseline updated to this scan.`;
    }
  }

  function renderDashboard(contract, info, holders, fetchedAt) {
    const inferredSupply = holders.reduce((sum, h) => sum + Number(h.balance || 0), 0);
    const supply = Number(info.totalSupply || inferredSupply || 0);
    const metrics = scoreMetrics(holders, supply);
    const movement = compareSnapshot(contract, holders);
    current = { contract, info, holders, supply, metrics, fetchedAt: fetchedAt || new Date().toISOString() };

    $('collectionName').textContent = `${info.name || 'NFT Collection'}${info.symbol ? ` · ${info.symbol}` : ''}`;
    $('collectionContract').textContent = contract;
    $('scanTime').textContent = new Date(current.fetchedAt).toLocaleString();
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
    renderTiers(holders);
    whaleOnly = false;
    $('whaleFilterBtn').textContent = '10+ ONLY';
    $('holderSearch').value = '';
    renderTable();
    $('dashboard').hidden = false;
    requestAnimationFrame(() => $('dashboard').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  async function scan(contractValue) {
    const contract = String(contractValue || $('contractInput').value || '').trim().toLowerCase();
    if (!isAddress(contract)) {
      showStatus('Enter a valid 0x NFT contract address.', 'error');
      return;
    }
    $('contractInput').value = contract;
    setBusy(true);
    showStatus('FORGE is reading this collection from Robinhood Chain…');
    try {
      const data = await fetchForgeData(contract);
      renderDashboard(contract, data.info || {}, data.holders, data.fetchedAt);
      showStatus(`Scan complete. ${fmt(data.holders.length)} current holders loaded${data.source ? ` via ${data.source.toUpperCase()}` : ''}.`, 'ok');
      const url = new URL(location.href);
      url.searchParams.set('contract', contract);
      history.replaceState({}, '', url);
    } catch (error) {
      let message = error.message || 'Could not scan this collection.';
      if (error.name === 'AbortError') message = 'The scan took too long. Please retry.';
      if (/failed to fetch/i.test(message)) message = 'FORGE backend could not be reached. Refresh this preview and retry.';
      showStatus(message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function csvCell(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
  }

  function exportCsv() {
    if (!current) return;
    const safeName = (current.info.name || current.info.symbol || 'Collection').replace(/[\r\n]+/g, ' ').trim();
    const rows = [
      ['TOTZ FORGE HOLDER SNAPSHOT', ''],
      ['Collection', safeName],
      ['Symbol', current.info.symbol || ''],
      ['Contract', current.contract],
      ['Network', 'Robinhood Chain'],
      ['Snapshot UTC', new Date(current.fetchedAt || Date.now()).toISOString()],
      ['Total Supply', current.supply],
      ['Unique Holders', current.holders.length],
      [],
      ['Rank', 'Wallet', 'NFTs Held', 'Supply %', 'Tier']
    ];

    current.holders.forEach((h, index) => {
      rows.push([
        index + 1,
        h.address,
        Number(h.balance || 0),
        current.supply ? (Number(h.balance || 0) / current.supply * 100).toFixed(4) : '0.0000',
        tierForCsv(Number(h.balance || 0))
      ]);
    });

    const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const slug = (current.info.symbol || current.info.name || 'collection').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    link.download = `forge-${slug || 'collection'}-holder-snapshot.csv`;
    document.body.appendChild(link);
    link.click();
    const href = link.href;
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  async function rpcBalanceOf(contract, wallet) {
    const data = `0x70a08231${wallet.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`;
    const response = await fetchJson(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: contract, data }, 'latest'] })
    }, 12000);
    if (response.error) throw new Error(response.error.message || 'RPC call failed.');
    return Number(BigInt(response.result || '0x0'));
  }

  async function connectWallet() {
    if (!window.ethereum) {
      $('accessTitle').textContent = 'NO WALLET';
      $('accessSub').textContent = 'EVM wallet not detected';
      alert('No EVM wallet detected. Open this page in MetaMask, Robinhood Wallet, or another EVM wallet browser.');
      return;
    }
    const btn = $('connectBtn');
    btn.disabled = true;
    btn.textContent = 'CONNECTING…';
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts?.length) throw new Error('No wallet selected.');
      connectedWallet = accounts[0].toLowerCase();
      btn.textContent = shortAddress(connectedWallet);
      const balance = await rpcBalanceOf(GENESIS, connectedWallet);
      if (balance > 0) {
        $('accessCard').classList.add('unlocked');
        $('accessTitle').textContent = 'UNLOCKED ✓';
        $('accessSub').textContent = `${fmt(balance)} TOTZ Genesis detected`;
      } else {
        $('accessCard').classList.remove('unlocked');
        $('accessTitle').textContent = 'GENESIS NOT FOUND';
        $('accessSub').textContent = `${shortAddress(connectedWallet)} · 0 TOTZ`;
      }
    } catch (error) {
      btn.textContent = 'CONNECT WALLET';
      $('accessTitle').textContent = 'CHECK FAILED';
      $('accessSub').textContent = error.message || 'Try again';
    } finally {
      btn.disabled = false;
    }
  }

  $('scanBtn').addEventListener('click', () => scan());
  $('genesisBtn').addEventListener('click', () => { $('contractInput').value = GENESIS; scan(GENESIS); });
  $('contractInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') scan(); });
  $('holderSearch').addEventListener('input', renderTable);
  $('whaleFilterBtn').addEventListener('click', () => { whaleOnly = !whaleOnly; $('whaleFilterBtn').textContent = whaleOnly ? 'SHOW ALL' : '10+ ONLY'; renderTable(); });
  $('exportBtn').addEventListener('click', exportCsv);
  $('connectBtn').addEventListener('click', connectWallet);

  const initial = new URL(location.href).searchParams.get('contract');
  if (initial && isAddress(initial)) $('contractInput').value = initial.toLowerCase();
})();

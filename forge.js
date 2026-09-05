(() => {
  const GENESIS = '0x107c4e7cf931b18e022d40184d03d00b4ec99d5a';
  const BLOCKSCOUT = 'https://robinhoodchain.blockscout.com';
  const RPC = 'https://rpc.mainnet.chain.robinhood.com';
  const LEGACY_LIMIT = 10000;
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
  async function fetchJson(url, options = {}, timeoutMs = 16000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try { const res = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' }); if (!res.ok) throw new Error(`Request failed (${res.status})`); return await res.json(); }
    finally { clearTimeout(timer); }
  }
  function normalizeHolder(address, value) {
    const wallet = String(address || '').toLowerCase(); const amount = Number(value || 0);
    if (!isAddress(wallet) || !Number.isFinite(amount) || amount <= 0) return null;
    return { address: wallet, balance: amount };
  }
  function aggregate(rows) {
    const map = new Map();
    for (const row of rows) { const normalized = normalizeHolder(row.address, row.balance); if (!normalized) continue; map.set(normalized.address, (map.get(normalized.address) || 0) + normalized.balance); }
    return [...map.entries()].map(([address, balance]) => ({ address, balance })).sort((a, b) => b.balance - a.balance || a.address.localeCompare(b.address));
  }
  async function fetchTokenInfo(contract) {
    try {
      const data = await fetchJson(`${BLOCKSCOUT}/api/v2/tokens/${contract}`);
      return { name: data.name || data.symbol || 'NFT Collection', symbol: data.symbol || '', totalSupply: Number(data.total_supply || data.totalSupply || 0), holdersCount: Number(data.holders_count || data.holders || 0), type: data.type || '' };
    } catch (_) { return { name: contract === GENESIS ? 'TOTZ Genesis' : 'NFT Collection', symbol: contract === GENESIS ? 'TOTZ' : '', totalSupply: 0, holdersCount: 0, type: '' }; }
  }
  async function fetchHoldersLegacy(contract) {
    const url = `${BLOCKSCOUT}/api?module=token&action=getTokenHolders&contractaddress=${contract}&page=1&offset=${LEGACY_LIMIT}`;
    const data = await fetchJson(url, {}, 22000);
    if (!Array.isArray(data.result)) throw new Error(data.message || 'Legacy holder endpoint unavailable.');
    const holders = aggregate(data.result.map((item) => ({ address: item.address, balance: item.value })));
    if (!holders.length) throw new Error('No holder data returned.');
    return holders;
  }
  async function fetchHoldersV2(contract) {
    const rows = []; let url = `${BLOCKSCOUT}/api/v2/tokens/${contract}/holders`; const seen = new Set();
    for (let page = 0; page < 120 && url; page++) {
      if (seen.has(url)) break; seen.add(url);
      const data = await fetchJson(url, {}, 18000);
      for (const item of data.items || []) { const address = item.address_hash?.hash || item.address?.hash || item.address_hash || item.address; rows.push({ address, balance: item.value || 1 }); }
      const next = data.next_page_params; if (!next || !Object.keys(next).length) break;
      const qs = new URLSearchParams(); for (const [key, value] of Object.entries(next)) if (value !== null && value !== undefined) qs.set(key, String(value));
      url = `${BLOCKSCOUT}/api/v2/tokens/${contract}/holders?${qs.toString()}`;
    }
    const holders = aggregate(rows); if (!holders.length) throw new Error('No holder data returned.'); return holders;
  }
  async function fetchHolders(contract) { try { return await fetchHoldersLegacy(contract); } catch (_) { return await fetchHoldersV2(contract); } }
  function tierFor(balance) { if (balance >= 35) return '35+'; if (balance >= 10) return '10–34'; if (balance >= 5) return '5–9'; if (balance >= 2) return '2–4'; return '1'; }
  function tierCounts(holders) { const tiers = { '1': 0, '2–4': 0, '5–9': 0, '10–34': 0, '35+': 0 }; holders.forEach((h) => { tiers[tierFor(h.balance)]++; }); return tiers; }
  function scoreMetrics(holders, supply) {
    const total = Math.max(1, supply || holders.reduce((sum, h) => sum + h.balance, 0));
    const top10 = holders.slice(0, 10).reduce((sum, h) => sum + h.balance, 0) / total * 100;
    const largest = (holders[0]?.balance || 0) / total * 100;
    const ratio = holders.length / total * 100;
    const distribution = clamp(100 - top10 * 1.35); const whale = clamp(100 - largest * 4.5); const spread = clamp(ratio * 2.15);
    const score = Math.round(distribution * .45 + whale * .25 + spread * .30);
    return { top10, largest, ratio, distribution: Math.round(distribution), whale: Math.round(whale), spread: Math.round(spread), score };
  }
  function snapshotKey(contract) { return `totz_forge_snapshot_v1_${contract.toLowerCase()}`; }
  function compareSnapshot(contract, holders) {
    let previous = null; try { previous = JSON.parse(localStorage.getItem(snapshotKey(contract)) || 'null'); } catch (_) {}
    const currentMap = Object.fromEntries(holders.map((h) => [h.address, h.balance])); const now = Date.now();
    const result = { first: !previous?.balances, previousAt: previous?.timestamp || null, newHolders: 0, accumulating: 0, reducing: 0, exits: 0 };
    if (previous?.balances) {
      for (const [address, balance] of Object.entries(currentMap)) { const before = Number(previous.balances[address] || 0); if (before === 0) result.newHolders++; else if (balance > before) result.accumulating++; else if (balance < before) result.reducing++; }
      for (const [address, balance] of Object.entries(previous.balances)) if (Number(balance) > 0 && !currentMap[address]) result.exits++;
    }
    try { localStorage.setItem(snapshotKey(contract), JSON.stringify({ timestamp: now, balances: currentMap })); } catch (_) {}
    return result;
  }
  function renderTiers(holders) {
    const tiers = tierCounts(holders); const max = Math.max(1, ...Object.values(tiers)); $('tierTotal').textContent = `${fmt(holders.length)} wallets`;
    $('tierList').innerHTML = Object.entries(tiers).map(([name, count]) => `<div class="tier-row"><span>${name} NFT${name === '1' ? '' : 's'}</span><div class="tier-bar"><i style="width:${(count / max * 100).toFixed(2)}%"></i></div><b>${fmt(count)}</b></div>`).join('');
  }
  function filteredHolders() { if (!current) return []; const query = $('holderSearch').value.trim().toLowerCase(); return current.holders.filter((h) => (!whaleOnly || h.balance >= 10) && (!query || h.address.includes(query))); }
  function renderTable() {
    if (!current) return; const rows = filteredHolders(); const body = $('holderRows');
    if (!rows.length) { body.innerHTML = '<tr><td class="empty-row" colspan="6">No wallets match this filter.</td></tr>'; return; }
    const limit = Math.min(rows.length, 500);
    body.innerHTML = rows.slice(0, limit).map((h) => { const originalRank = current.holders.indexOf(h) + 1; const share = current.supply ? h.balance / current.supply * 100 : 0; return `<tr><td><span class="rank-badge">${originalRank}</span></td><td class="wallet">${h.address}</td><td><span class="balance-badge">${fmt(h.balance)}</span></td><td>${pct(share)}</td><td>${tierFor(h.balance)}</td><td><a href="${BLOCKSCOUT}/address/${h.address}" target="_blank" rel="noopener">OPEN ↗</a></td></tr>`; }).join('') + (rows.length > limit ? `<tr><td class="empty-row" colspan="6">Showing first ${fmt(limit)} of ${fmt(rows.length)} matching wallets. Export CSV for the full snapshot.</td></tr>` : '');
  }
  function renderMovements(movement) {
    if (movement.first) { $('newMove').textContent = '—'; $('upMove').textContent = '—'; $('downMove').textContent = '—'; $('exitMove').textContent = '—'; $('baselineNote').textContent = 'Baseline created now in this browser. Scan this collection again later to see wallet movement.'; }
    else { $('newMove').textContent = `+${fmt(movement.newHolders)}`; $('upMove').textContent = `+${fmt(movement.accumulating)}`; $('downMove').textContent = `-${fmt(movement.reducing)}`; $('exitMove').textContent = `-${fmt(movement.exits)}`; $('baselineNote').textContent = `Compared with your previous local scan from ${new Date(movement.previousAt).toLocaleString()}. Baseline updated to this scan.`; }
  }
  function renderDashboard(contract, info, holders) {
    const inferredSupply = holders.reduce((sum, h) => sum + h.balance, 0); const supply = Number(info.totalSupply || inferredSupply || 0); const metrics = scoreMetrics(holders, supply); const movement = compareSnapshot(contract, holders); current = { contract, info, holders, supply, metrics };
    $('collectionName').textContent = `${info.name || 'NFT Collection'}${info.symbol ? ` · ${info.symbol}` : ''}`; $('collectionContract').textContent = contract; $('scanTime').textContent = new Date().toLocaleString();
    $('supplyStat').textContent = fmt(supply); $('holdersStat').textContent = fmt(holders.length); $('holderRatioStat').textContent = pct(metrics.ratio); $('top10Stat').textContent = pct(metrics.top10); $('largestStat').textContent = pct(metrics.largest); $('whalesStat').textContent = fmt(holders.filter((h) => h.balance >= 10).length);
    $('scoreRing').style.setProperty('--score', metrics.score); $('scoreStat').textContent = metrics.score; $('distributionScore').textContent = metrics.distribution; $('whaleScore').textContent = metrics.whale; $('spreadScore').textContent = metrics.spread; $('distributionMeter').style.width = `${metrics.distribution}%`; $('whaleMeter').style.width = `${metrics.whale}%`; $('spreadMeter').style.width = `${metrics.spread}%`;
    renderMovements(movement); renderTiers(holders); whaleOnly = false; $('whaleFilterBtn').textContent = '10+ ONLY'; $('holderSearch').value = ''; renderTable(); $('dashboard').hidden = false; requestAnimationFrame(() => $('dashboard').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  async function scan(contractValue) {
    const contract = String(contractValue || $('contractInput').value || '').trim().toLowerCase(); if (!isAddress(contract)) { showStatus('Enter a valid 0x NFT contract address.', 'error'); return; }
    $('contractInput').value = contract; setBusy(true); showStatus('Reading collection and holder data from Robinhood Chain…');
    try { const [info, holders] = await Promise.all([fetchTokenInfo(contract), fetchHolders(contract)]); if (!holders.length) throw new Error('No current holders found for this contract.'); renderDashboard(contract, info, holders); showStatus(`Scan complete. ${fmt(holders.length)} current holders loaded.`, 'ok'); const url = new URL(location.href); url.searchParams.set('contract', contract); history.replaceState({}, '', url); }
    catch (error) { showStatus(error.name === 'AbortError' ? 'The chain data request timed out. Try again.' : (error.message || 'Could not scan this collection.'), 'error'); }
    finally { setBusy(false); }
  }
  function exportCsv() {
    if (!current) return; const lines = [['rank','wallet','balance','supply_pct','tier']]; current.holders.forEach((h, index) => lines.push([index + 1, h.address, h.balance, current.supply ? (h.balance / current.supply * 100).toFixed(6) : '0', tierFor(h.balance)])); const csv = lines.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n'); const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `forge-${(current.info.symbol || current.info.name || 'collection').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-holders.csv`; document.body.appendChild(link); link.click(); const href = link.href; link.remove(); URL.revokeObjectURL(href);
  }
  async function rpcBalanceOf(contract, wallet) {
    const data = `0x70a08231${wallet.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`;
    const response = await fetchJson(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: contract, data }, 'latest'] }) }); if (response.error) throw new Error(response.error.message || 'RPC call failed.'); return Number(BigInt(response.result || '0x0'));
  }
  async function connectWallet() {
    if (!window.ethereum) { $('accessTitle').textContent = 'NO WALLET'; $('accessSub').textContent = 'EVM wallet not detected'; alert('No EVM wallet detected. Open this page in MetaMask, Robinhood Wallet, or another EVM wallet browser.'); return; }
    const btn = $('connectBtn'); btn.disabled = true; btn.textContent = 'CONNECTING…';
    try { const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }); if (!accounts?.length) throw new Error('No wallet selected.'); connectedWallet = accounts[0].toLowerCase(); btn.textContent = shortAddress(connectedWallet); const balance = await rpcBalanceOf(GENESIS, connectedWallet); if (balance > 0) { $('accessCard').classList.add('unlocked'); $('accessTitle').textContent = 'UNLOCKED ✓'; $('accessSub').textContent = `${fmt(balance)} TOTZ Genesis detected`; } else { $('accessCard').classList.remove('unlocked'); $('accessTitle').textContent = 'GENESIS NOT FOUND'; $('accessSub').textContent = `${shortAddress(connectedWallet)} · 0 TOTZ`; } }
    catch (error) { btn.textContent = 'CONNECT WALLET'; $('accessTitle').textContent = 'CHECK FAILED'; $('accessSub').textContent = error.message || 'Try again'; }
    finally { btn.disabled = false; }
  }
  $('scanBtn').addEventListener('click', () => scan()); $('genesisBtn').addEventListener('click', () => { $('contractInput').value = GENESIS; scan(GENESIS); }); $('contractInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') scan(); }); $('holderSearch').addEventListener('input', renderTable); $('whaleFilterBtn').addEventListener('click', () => { whaleOnly = !whaleOnly; $('whaleFilterBtn').textContent = whaleOnly ? 'SHOW ALL' : '10+ ONLY'; renderTable(); }); $('exportBtn').addEventListener('click', exportCsv); $('connectBtn').addEventListener('click', connectWallet);
  const initial = new URL(location.href).searchParams.get('contract'); if (initial && isAddress(initial)) $('contractInput').value = initial.toLowerCase();
})();

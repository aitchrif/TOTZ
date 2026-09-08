(() => {
  const DB_NAME = 'totz-forge-history';
  const DB_VERSION = 1;
  const STORE = 'snapshots';
  const MAX_SNAPSHOTS_PER_COLLECTION = 24;
  const RETENTION_MS = 45 * 24 * 60 * 60 * 1000;
  const PERIODS = {
    '24h': { label: '24H', ms: 24 * 60 * 60 * 1000 },
    '7d': { label: '7D', ms: 7 * 24 * 60 * 60 * 1000 },
    '30d': { label: '30D', ms: 30 * 24 * 60 * 60 * 1000 }
  };

  let activePeriod = '24h';
  let latestSnapshot = null;
  let dbPromise = null;

  const $ = (id) => document.getElementById(id);
  const fmt = (n, max = 0) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: max });
  const pctPoint = (n) => `${n > 0 ? '+' : ''}${Number(n || 0).toFixed(Math.abs(Number(n || 0)) >= 10 ? 1 : 2)} pp`;
  const signed = (n) => `${n > 0 ? '+' : ''}${fmt(n)}`;
  const isAddress = (value) => /^0x[a-fA-F0-9]{40}$/.test(String(value || ''));

  function openDb() {
    if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB unavailable'));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('collectionKey', 'collectionKey', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open history database'));
    });
    return dbPromise;
  }

  async function putSnapshot(snapshot) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(snapshot);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Could not store snapshot'));
    });
    await cleanup(snapshot.collectionKey);
  }

  async function snapshotsFor(collectionKey) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const index = tx.objectStore(STORE).index('collectionKey');
      const request = index.getAll(IDBKeyRange.only(collectionKey));
      request.onsuccess = () => resolve((request.result || []).sort((a, b) => b.timestamp - a.timestamp));
      request.onerror = () => reject(request.error || new Error('Could not read history'));
    });
  }

  async function cleanup(collectionKey) {
    const rows = await snapshotsFor(collectionKey);
    const now = Date.now();
    const remove = rows.filter((row, index) => index >= MAX_SNAPSHOTS_PER_COLLECTION || now - row.timestamp > RETENTION_MS);
    if (!remove.length) return;
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      remove.forEach((row) => store.delete(row.id));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Could not trim history'));
    });
  }

  function computeMetrics(holders, supply) {
    const sorted = [...holders].sort((a, b) => Number(b[1]) - Number(a[1]));
    const total = Math.max(1, Number(supply || sorted.reduce((sum, [, balance]) => sum + Number(balance || 0), 0)));
    const top10 = sorted.slice(0, 10).reduce((sum, [, balance]) => sum + Number(balance || 0), 0) / total * 100;
    const largest = Number(sorted[0]?.[1] || 0) / total * 100;
    const whales10 = sorted.filter(([, balance]) => Number(balance || 0) >= 10).length;
    return { top10, largest, whales10, holdersCount: sorted.length };
  }

  function toSnapshot(data) {
    const chain = String(data.chain || '').toLowerCase();
    const contract = String(data.contract || '').toLowerCase();
    if (!chain || !isAddress(contract) || !Array.isArray(data.holders)) return null;
    const holders = data.holders
      .map((h) => [String(h.address || '').toLowerCase(), Number(h.balance || 0)])
      .filter(([address, balance]) => isAddress(address) && balance > 0);
    const supply = Number(data.info?.totalSupply || holders.reduce((sum, [, balance]) => sum + balance, 0));
    const timestamp = Date.parse(data.fetchedAt || '') || Date.now();
    const snapshotBlock = Number(data.snapshotBlock || 0);
    const metrics = computeMetrics(holders, supply);
    const collectionKey = `${chain}:${contract}`;
    return {
      id: `${collectionKey}:${snapshotBlock || timestamp}`,
      collectionKey,
      chain,
      contract,
      snapshotBlock,
      timestamp,
      supply,
      holders,
      ...metrics
    };
  }

  function legacySnapshotFor(snapshot) {
    try {
      const raw = localStorage.getItem(`totz_forge_snapshot_v2_${snapshot.chain}_${snapshot.contract}`);
      const legacy = raw ? JSON.parse(raw) : null;
      if (!legacy?.balances || !legacy?.timestamp || legacy.timestamp >= snapshot.timestamp - 1000) return null;
      const holders = Object.entries(legacy.balances)
        .map(([address, balance]) => [String(address).toLowerCase(), Number(balance || 0)])
        .filter(([address, balance]) => isAddress(address) && balance > 0);
      const supply = holders.reduce((sum, [, balance]) => sum + balance, 0);
      const metrics = computeMetrics(holders, supply);
      return {
        id: `${snapshot.collectionKey}:legacy:${legacy.timestamp}`,
        collectionKey: snapshot.collectionKey,
        chain: snapshot.chain,
        contract: snapshot.contract,
        snapshotBlock: 0,
        timestamp: Number(legacy.timestamp),
        supply,
        holders,
        ...metrics
      };
    } catch (_) {
      return null;
    }
  }

  function chooseBaseline(rows, current, periodKey) {
    const config = PERIODS[periodKey] || PERIODS['24h'];
    const previous = rows.filter((row) => row.id !== current.id && row.timestamp < current.timestamp - 1000);
    if (!previous.length) return { baseline: null, config, coverage: 0 };
    const target = current.timestamp - config.ms;
    let baseline = previous[0];
    let bestDistance = Math.abs(baseline.timestamp - target);
    for (const row of previous) {
      const distance = Math.abs(row.timestamp - target);
      if (distance < bestDistance) { baseline = row; bestDistance = distance; }
    }
    const age = current.timestamp - baseline.timestamp;
    return { baseline, config, coverage: age / config.ms, age };
  }

  function movementBetween(current, baseline) {
    const before = new Map(baseline.holders || []);
    const now = new Map(current.holders || []);
    let newHolders = 0, accumulating = 0, reducing = 0, exits = 0;
    for (const [address, balance] of now) {
      const old = Number(before.get(address) || 0);
      if (!old) newHolders++;
      else if (balance > old) accumulating++;
      else if (balance < old) reducing++;
    }
    for (const [address, balance] of before) {
      if (Number(balance) > 0 && !now.has(address)) exits++;
    }
    return { newHolders, accumulating, reducing, exits };
  }

  function humanAge(ms) {
    const hours = ms / (60 * 60 * 1000);
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
    if (hours < 48) return `${Math.round(hours)}h`;
    return `${Math.round(hours / 24)}d`;
  }

  function installUi() {
    const heading = [...document.querySelectorAll('.panel h2')].find((node) => node.textContent.trim().toUpperCase() === 'MOVEMENTS');
    const panel = heading?.closest('.panel');
    if (!panel || panel.dataset.historyUpgraded === '1') return panel;
    panel.dataset.historyUpgraded = '1';

    const tag = panel.querySelector('.panel-head .tag');
    if (tag) tag.textContent = 'DEVICE HISTORY';
    const description = panel.querySelector('.panel-head p');
    if (description) description.textContent = 'Compare holder movement across saved on-device snapshots without extra backend usage.';

    const controls = document.createElement('div');
    controls.className = 'forge-history-controls';
    controls.innerHTML = `
      <div class="forge-history-periods" role="tablist" aria-label="History period">
        ${Object.entries(PERIODS).map(([key, item]) => `<button type="button" class="forge-history-period${key === activePeriod ? ' active' : ''}" data-period="${key}">${item.label}</button>`).join('')}
      </div>
      <span id="forgeHistoryCoverage" class="forge-history-coverage">COLLECTING HISTORY</span>`;
    const grid = panel.querySelector('.movement-grid');
    if (grid) panel.insertBefore(controls, grid);

    const trend = document.createElement('div');
    trend.className = 'forge-history-trends';
    trend.innerHTML = `
      <div><small>HOLDERS Δ</small><b id="historyHoldersDelta">—</b></div>
      <div><small>TOP 10 Δ</small><b id="historyTop10Delta">—</b></div>
      <div><small>LARGEST Δ</small><b id="historyLargestDelta">—</b></div>
      <div><small>10+ HOLDERS Δ</small><b id="historyWhalesDelta">—</b></div>`;
    const note = panel.querySelector('#baselineNote');
    if (note) note.insertAdjacentElement('beforebegin', trend);

    controls.addEventListener('click', (event) => {
      const button = event.target.closest('[data-period]');
      if (!button) return;
      activePeriod = button.dataset.period;
      controls.querySelectorAll('[data-period]').forEach((item) => item.classList.toggle('active', item === button));
      if (latestSnapshot) renderHistory(latestSnapshot).catch(() => {});
    });

    installStyle();
    return panel;
  }

  function installStyle() {
    if (document.getElementById('forge-history-style')) return;
    const style = document.createElement('style');
    style.id = 'forge-history-style';
    style.textContent = `
      .forge-history-controls{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:-2px 0 12px;flex-wrap:wrap}
      .forge-history-periods{display:inline-flex;gap:5px;padding:4px;background:var(--cream,#FFF3DC);border-radius:999px}
      .forge-history-period{border:0;background:transparent;color:var(--soft,#5B5270);border-radius:999px;padding:6px 10px;font-size:.64rem;font-weight:900;cursor:pointer;transition:.14s ease}
      .forge-history-period:hover{color:var(--ink,#2B2140)}
      .forge-history-period.active{background:var(--ink,#2B2140);color:#fff;box-shadow:0 4px 10px rgba(43,33,64,.14)}
      .forge-history-coverage{font-size:.58rem;font-weight:900;letter-spacing:.04em;color:var(--soft,#5B5270);background:var(--sky,#BFE6EE);padding:6px 8px;border-radius:999px}
      .forge-history-trends{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:11px 0 2px}
      .forge-history-trends>div{background:#fff;border:1px solid rgba(43,33,64,.08);border-radius:14px;padding:9px 10px;min-width:0}
      .forge-history-trends small{display:block;color:var(--soft,#5B5270);font-size:.53rem;font-weight:900;letter-spacing:.035em}
      .forge-history-trends b{display:block;margin-top:3px;font-family:'Baloo 2',cursive;font-size:.95rem;white-space:nowrap}
      .forge-history-trends b.positive{color:#437b2a}.forge-history-trends b.negative{color:#b44335}
      @media(max-width:760px){.forge-history-trends{grid-template-columns:1fr 1fr}.forge-history-controls{align-items:flex-start}.forge-history-coverage{margin-left:auto}}
    `;
    document.head.appendChild(style);
  }

  function setTrend(id, value, formatter = signed, inverse = false) {
    const el = $(id);
    if (!el) return;
    el.textContent = formatter(value);
    el.classList.remove('positive', 'negative');
    const good = inverse ? value < 0 : value > 0;
    const bad = inverse ? value > 0 : value < 0;
    if (good) el.classList.add('positive');
    if (bad) el.classList.add('negative');
  }

  function clearMovementUi(message) {
    ['newMove', 'upMove', 'downMove', 'exitMove'].forEach((id) => { if ($(id)) $(id).textContent = '—'; });
    ['historyHoldersDelta', 'historyTop10Delta', 'historyLargestDelta', 'historyWhalesDelta'].forEach((id) => {
      if ($(id)) { $(id).textContent = '—'; $(id).classList.remove('positive', 'negative'); }
    });
    if ($('baselineNote')) $('baselineNote').textContent = message;
  }

  async function renderHistory(current) {
    installUi();
    let rows;
    try { rows = await snapshotsFor(current.collectionKey); }
    catch (_) {
      clearMovementUi('History storage is unavailable in this browser. Live X-RAY scanning still works normally.');
      if ($('forgeHistoryCoverage')) $('forgeHistoryCoverage').textContent = 'HISTORY UNAVAILABLE';
      return;
    }

    const { baseline, config, coverage, age } = chooseBaseline(rows, current, activePeriod);
    if (!baseline) {
      clearMovementUi(`History started on this device. Rescan later to unlock ${config.label}, 7D and 30D movement comparisons.`);
      if ($('forgeHistoryCoverage')) $('forgeHistoryCoverage').textContent = 'HISTORY STARTED';
      return;
    }

    const movement = movementBetween(current, baseline);
    if ($('newMove')) $('newMove').textContent = movement.newHolders ? `+${fmt(movement.newHolders)}` : '0';
    if ($('upMove')) $('upMove').textContent = movement.accumulating ? `+${fmt(movement.accumulating)}` : '0';
    if ($('downMove')) $('downMove').textContent = movement.reducing ? `-${fmt(movement.reducing)}` : '0';
    if ($('exitMove')) $('exitMove').textContent = movement.exits ? `-${fmt(movement.exits)}` : '0';

    setTrend('historyHoldersDelta', current.holdersCount - baseline.holdersCount);
    setTrend('historyTop10Delta', current.top10 - baseline.top10, pctPoint, true);
    setTrend('historyLargestDelta', current.largest - baseline.largest, pctPoint, true);
    setTrend('historyWhalesDelta', current.whales10 - baseline.whales10);

    const exactish = coverage >= .5;
    if ($('forgeHistoryCoverage')) $('forgeHistoryCoverage').textContent = exactish ? `${config.label} COMPARE` : `SINCE ${humanAge(age)}`;
    if ($('baselineNote')) {
      $('baselineNote').textContent = exactish
        ? `${config.label} view uses the saved snapshot closest to ${config.label.toLowerCase()} ago (${new Date(baseline.timestamp).toLocaleString()}). History is stored only on this device.`
        : `${config.label} history is still building. Showing changes since your oldest useful snapshot ${humanAge(age)} ago. History is stored only on this device.`;
    }
  }

  async function persistScan(data) {
    const snapshot = toSnapshot(data);
    if (!snapshot) return;
    latestSnapshot = snapshot;

    const legacy = legacySnapshotFor(snapshot);
    try {
      if (legacy) await putSnapshot(legacy);
      await putSnapshot(snapshot);
    } catch (_) {
      // Storage can be blocked in private modes; scanning must never fail because history storage did.
    }

    setTimeout(() => renderHistory(snapshot).catch(() => {}), 120);
  }

  function interceptForgeFetch() {
    if (window.__totzForgeHistoryFetchPatched) return;
    window.__totzForgeHistoryFetchPatched = true;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await nativeFetch(...args);
      try {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        if (response.ok && /\/api\/forge-holders\?/i.test(url) && !/[?&]mode=balance(?:&|$)/i.test(url)) {
          response.clone().json().then((data) => persistScan(data)).catch(() => {});
        }
      } catch (_) {}
      return response;
    };
  }

  installUi();
  interceptForgeFetch();
})();
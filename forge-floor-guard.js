(() => {
  const $ = (id) => document.getElementById(id);
  const state = { rows: [], collection: null, currency: 'ETH' };

  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));

  function slugFromInput(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    let slug = raw;
    try {
      const url = new URL(raw);
      const parts = url.pathname.split('/').filter(Boolean);
      const index = parts.findIndex((part) => part.toLowerCase() === 'collection');
      if ((url.hostname === 'opensea.io' || url.hostname.endsWith('.opensea.io')) && index >= 0 && parts[index + 1]) {
        slug = parts[index + 1];
      }
    } catch (_) {}
    slug = String(slug).replace(/^collection\//i, '').split(/[?#/]/)[0].trim();
    return /^[a-zA-Z0-9_-]{1,120}$/.test(slug) ? slug : '';
  }

  function shortWallet(wallet) {
    const value = String(wallet || '');
    return value.length > 14 ? `${value.slice(0, 7)}…${value.slice(-5)}` : value;
  }

  function formatPrice(value, symbol) {
    if (!Number.isFinite(Number(value))) return '—';
    const number = Number(value);
    const digits = number < 0.01 ? 5 : number < 1 ? 4 : 3;
    return `${number.toLocaleString(undefined, { maximumFractionDigits: digits })} ${symbol || 'ETH'}`;
  }

  function setStatus(message, type = '') {
    const node = $('status');
    node.textContent = message || '';
    node.className = `status${message ? ' show' : ''}${type ? ` ${type}` : ''}`;
  }

  function setBusy(busy) {
    const button = $('scanBtn');
    button.disabled = busy;
    button.textContent = busy ? 'SCANNING…' : 'SCAN FLOOR';
  }

  function scoreClass(row) {
    if (row.score >= 65) return 'high';
    if (row.score >= 40) return 'watch';
    return '';
  }

  function signalChip(row) {
    if (row.score >= 65) return '<span class="chip high">HIGH PRESSURE</span>';
    if (row.score >= 40) return '<span class="chip watch">WATCH</span>';
    return '<span class="chip low">LOW SIGNAL</span>';
  }

  function renderRows(rows) {
    const body = $('rows');
    const empty = $('empty');
    if (!rows.length) {
      body.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    body.innerHTML = rows.map((row) => {
      const reasons = Array.isArray(row.reasons) && row.reasons.length
        ? row.reasons.slice(0, 4).map((reason) => `<span class="reason">${esc(reason)}</span>`).join('')
        : '<span class="reason">weak signal</span>';
      const wallet = esc(row.wallet);
      return `<tr>
        <td><span class="score ${scoreClass(row)}">${Number(row.score || 0)}</span></td>
        <td><a class="wallet" href="https://opensea.io/${wallet}" target="_blank" rel="noopener noreferrer" title="${wallet}">${esc(shortWallet(row.wallet))} ↗</a></td>
        <td>${signalChip(row)}</td>
        <td>${Number(row.floorZoneListings || 0)}</td>
        <td>${Number(row.recentListings || 0)}</td>
        <td>${Number(row.recentSales || 0)}</td>
        <td>${Number(row.burstPairs || 0)}</td>
        <td>${Number(row.priceCuts || 0)}</td>
        <td><div class="reasons">${reasons}</div></td>
      </tr>`;
    }).join('');
  }

  function render(data) {
    state.rows = Array.isArray(data.rows) ? data.rows : [];
    state.collection = data.collection || null;
    state.currency = data.currency || 'ETH';

    $('results').hidden = false;
    $('collectionName').textContent = data.collection?.name || data.collection?.slug || 'OpenSea collection';
    $('collectionMeta').textContent = `${data.collection?.slug || ''} · ${Number(data.windowHours || 24)}h scan · generated ${new Date(data.generatedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    $('openSeaLink').href = data.collection?.url || 'https://opensea.io';
    $('floorStat').textContent = formatPrice(data.floor, data.currency);
    $('activeStat').textContent = Number(data.activeListingsScanned || 0).toLocaleString();
    $('listingStat').textContent = Number(data.listingEventsScanned || 0).toLocaleString();
    $('saleStat').textContent = Number(data.saleEventsScanned || 0).toLocaleString();
    $('watchStat').textContent = Number(data.watch || 0).toLocaleString();
    $('highStat').textContent = Number(data.highPressure || 0).toLocaleString();
    renderRows(state.rows);

    const watchlist = state.rows.filter((row) => Number(row.score) >= 40);
    $('copyWatchBtn').disabled = !watchlist.length;
    $('exportBtn').disabled = !state.rows.length;
    $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function fetchScan(slug, hours) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 32000);
    try {
      const params = new URLSearchParams({ collection: slug, hours: String(hours) });
      const response = await fetch(`/api/forge-floor-guard?${params.toString()}`, { cache: 'no-store', signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || data.detail || `Scan failed (${response.status}).`);
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function scan() {
    const slug = slugFromInput($('collectionInput').value);
    const hours = Number($('windowSelect').value || 24);
    if (!slug) {
      setStatus('Paste a valid OpenSea collection URL or collection slug.', 'error');
      return;
    }

    setBusy(true);
    setStatus('Reading OpenSea best listings + recent listing/sale activity. No wallet connection or transaction is needed.', 'warn');
    try {
      const data = await fetchScan(slug, hours);
      const url = new URL(location.href);
      url.searchParams.set('collection', slug);
      url.searchParams.set('hours', String(hours));
      history.replaceState({}, '', url);
      setStatus(data.highPressure
        ? `Scan complete · ${data.highPressure} high-pressure wallet${data.highPressure === 1 ? '' : 's'} surfaced for review.`
        : 'Scan complete · no high-pressure wallet crossed the V1 threshold in this window.');
      render(data);
    } catch (error) {
      const message = error?.name === 'AbortError' ? 'The marketplace scan timed out. Try a shorter window or retry.' : (error?.message || 'Could not scan this collection.');
      setStatus(message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function copyWatchlist() {
    const rows = state.rows.filter((row) => Number(row.score) >= 40);
    if (!rows.length) return;
    const text = rows.map((row) => `${row.wallet}\t${row.score}\t${row.signal}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`Copied ${rows.length} WATCH/HIGH wallet${rows.length === 1 ? '' : 's'} to clipboard.`);
    } catch (_) {
      setStatus('Clipboard access was blocked by the browser.', 'error');
    }
  }

  function exportCsv() {
    if (!state.rows.length) return;
    const header = ['wallet','score','signal','floor_zone_listings','recent_listings','recent_sales','burst_pairs','price_cuts','reasons'];
    const lines = state.rows.map((row) => [
      row.wallet,
      row.score,
      row.signal,
      row.floorZoneListings,
      row.recentListings,
      row.recentSales,
      row.burstPairs,
      row.priceCuts,
      `"${String((row.reasons || []).join('; ')).replace(/"/g, '""')}"`
    ].join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `forge-floor-guard-${state.collection?.slug || 'scan'}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  $('scanBtn').addEventListener('click', scan);
  $('collectionInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') scan();
  });
  $('copyWatchBtn').addEventListener('click', copyWatchlist);
  $('exportBtn').addEventListener('click', exportCsv);

  const params = new URLSearchParams(location.search);
  const collection = slugFromInput(params.get('collection'));
  const hours = Number(params.get('hours'));
  if (collection) $('collectionInput').value = collection;
  if ([1, 6, 24, 72, 168].includes(hours)) $('windowSelect').value = String(hours);
  if (collection) setTimeout(scan, 120);
})();

(() => {
  const $ = (id) => document.getElementById(id);
  const state = { collectionRows: [], collection: null, currency: 'ETH', dbRows: [] };
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
  const short = (wallet) => String(wallet || '').length > 15 ? `${wallet.slice(0, 7)}…${wallet.slice(-5)}` : String(wallet || '');
  const validWallet = (value) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());

  function slugFromInput(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    let slug = raw;
    try {
      const url = new URL(raw);
      const parts = url.pathname.split('/').filter(Boolean);
      const index = parts.findIndex((part) => part.toLowerCase() === 'collection');
      if ((url.hostname === 'opensea.io' || url.hostname.endsWith('.opensea.io')) && index >= 0 && parts[index + 1]) slug = parts[index + 1];
    } catch (_) {}
    slug = String(slug).replace(/^collection\//i, '').split(/[?#/]/)[0].trim();
    return /^[a-zA-Z0-9_-]{1,120}$/.test(slug) ? slug : '';
  }

  function statusClass(status) {
    return status === 'confirmed' ? 'confirmed' : status === 'highly_suspected' ? 'suspected' : status === 'watch' ? 'watch' : 'low';
  }
  function statusLabel(status) {
    return status === 'confirmed' ? 'CONFIRMED BOT' : status === 'highly_suspected' ? 'HIGHLY SUSPECTED' : status === 'watch' ? 'WATCH' : 'LOW SIGNAL';
  }
  function formatPrice(value, symbol) {
    if (!Number.isFinite(Number(value))) return '—';
    const number = Number(value);
    const digits = number < 0.01 ? 5 : number < 1 ? 4 : 3;
    return `${number.toLocaleString(undefined, { maximumFractionDigits: digits })} ${symbol || 'ETH'}`;
  }
  function setStatus(id, message, type = '') {
    const node = $(id);
    node.textContent = message || '';
    node.className = `status${message ? ' show' : ''}${type ? ` ${type}` : ''}`;
  }
  function setBusy(button, busy, busyText, idleText) {
    button.disabled = busy;
    button.textContent = busy ? busyText : idleText;
  }
  async function api(params, timeout = 32000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(`/api/forge-floor-guard?${new URLSearchParams(params)}`, { cache: 'no-store', signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || data.detail || `Request failed (${response.status}).`);
      return data;
    } finally { clearTimeout(timer); }
  }

  function switchTab(name) {
    document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === name));
    ['collection','wallet','database'].forEach((key) => { $(`${key}Panel`).hidden = key !== name; });
    if (name === 'database' && !state.dbRows.length) loadDatabase();
  }

  function renderCollectionRows(rows) {
    const body = $('collectionRows');
    const empty = $('collectionEmpty');
    if (!rows.length) { body.innerHTML = ''; empty.hidden = false; return; }
    empty.hidden = true;
    body.innerHTML = rows.map((row) => {
      const evidence = [...(row.registryEvidence || []), ...(row.reasons || [])].slice(0, 4);
      const status = row.botStatus || 'low_signal';
      return `<tr>
        <td><a class="wallet-link" href="https://opensea.io/${esc(row.wallet)}" target="_blank" rel="noopener noreferrer">${esc(short(row.wallet))} ↗</a></td>
        <td><span class="badge ${statusClass(status)}">${statusLabel(status)}</span></td>
        <td><span class="score">${Number(row.botConfidence || 0)}</span></td>
        <td><span class="score">${Number(row.score || 0)}</span></td>
        <td>${Number(row.activeLowListings || 0)}</td>
        <td>${Number(row.recentListings || 0) + Number(row.recentSales || 0)}</td>
        <td><div class="reasons">${evidence.length ? evidence.map((reason) => `<span class="reason">${esc(reason)}</span>`).join('') : '<span class="reason">no strong evidence</span>'}</div></td>
        <td><button class="btn ghost inspect-wallet" data-wallet="${esc(row.wallet)}" type="button">CHECK WALLET</button></td>
      </tr>`;
    }).join('');
    document.querySelectorAll('.inspect-wallet').forEach((button) => button.addEventListener('click', () => {
      $('walletInput').value = button.dataset.wallet || '';
      switchTab('wallet');
      checkWallet();
    }));
  }

  function renderCollection(data) {
    state.collectionRows = Array.isArray(data.rows) ? data.rows : [];
    state.collection = data.collection || null;
    state.currency = data.currency || 'ETH';
    $('collectionResults').hidden = false;
    $('collectionName').textContent = data.collection?.name || data.collection?.slug || 'Collection';
    $('collectionMeta').textContent = `${data.collection?.slug || ''} · ${data.windowHours || 24}h · V2 intelligence scan`;
    $('openSeaLink').href = data.collection?.url || 'https://opensea.io';
    $('confirmedStat').textContent = Number(data.botDatabase?.confirmedAvailable || 0).toLocaleString();
    $('confirmedHolderStat').textContent = Number(data.botDatabase?.confirmedHolders || 0).toLocaleString();
    $('confirmedListerStat').textContent = Number(data.botDatabase?.confirmedListers || 0).toLocaleString();
    $('floorStat').textContent = formatPrice(data.floor, data.currency);
    $('holdersStat').textContent = Number(data.holdersSampled || 0).toLocaleString();
    $('activeStat').textContent = Number(data.activeListingsScanned || 0).toLocaleString();
    const confirmed = data.botDatabase?.confirmedWallets || [];
    $('confirmedSummary').textContent = confirmed.length
      ? `${confirmed.length} confirmed registry wallet${confirmed.length === 1 ? '' : 's'} intersect this scan. ${data.botDatabase.confirmedHolders || 0} appear in the holder sample and ${data.botDatabase.confirmedListers || 0} are active listers.`
      : 'No trusted confirmed-bot registry match was found in this holder/listing sample.';
    const reviewCount = state.collectionRows.filter((r) => ['highly_suspected','watch'].includes(r.botStatus) || Number(r.score) >= 40).length;
    $('pressureSummary').textContent = reviewCount
      ? `${reviewCount} wallet${reviewCount === 1 ? '' : 's'} crossed the behavioral review threshold. These are signals, not confirmed identities.`
      : 'No strong automation/floor-pressure signal crossed the review threshold in this scan.';
    renderCollectionRows(state.collectionRows);
    $('copyWatchBtn').disabled = reviewCount === 0;
    $('exportBtn').disabled = state.collectionRows.length === 0;
    $('collectionResults').scrollIntoView({ behavior:'smooth', block:'start' });
  }

  async function scanCollection() {
    const slug = slugFromInput($('collectionInput').value);
    const hours = Number($('windowSelect').value || 24);
    if (!slug) return setStatus('collectionStatus', 'Paste a valid OpenSea collection URL or slug.', 'error');
    const button = $('scanBtn');
    setBusy(button, true, 'SCANNING…', 'SCAN COLLECTION');
    setStatus('collectionStatus', 'Checking holders, active listings, marketplace events and the persistent FORGE bot registry…', 'warn');
    try {
      const data = await api({ mode:'collection', collection:slug, hours:String(hours) });
      renderCollection(data);
      const url = new URL(location.href); url.searchParams.set('collection', slug); url.searchParams.set('hours', String(hours)); history.replaceState({},'',url);
      setStatus('collectionStatus', `Scan complete · ${data.botDatabase?.confirmedHolders || 0} confirmed holder match${Number(data.botDatabase?.confirmedHolders || 0) === 1 ? '' : 'es'} · ${data.walletsScored || 0} wallet signals reviewed.`);
    } catch (error) {
      setStatus('collectionStatus', error?.name === 'AbortError' ? 'Collection scan timed out. Retry.' : (error?.message || 'Collection scan failed.'), 'error');
    } finally { setBusy(button, false, '', 'SCAN COLLECTION'); }
  }

  function renderWallet(data) {
    $('walletResults').hidden = false;
    $('walletAddress').textContent = data.wallet || '—';
    $('walletOpenSea').href = `https://opensea.io/${data.wallet}`;
    const badge = $('walletBadge');
    badge.className = `badge ${statusClass(data.classification)}`;
    badge.textContent = statusLabel(data.classification);
    $('walletConfidence').textContent = Number(data.confidence || 0);
    const m = data.metrics || {};
    $('walletListings').textContent = Number(m.activeListings || 0).toLocaleString();
    $('walletOffers').textContent = Number(m.activeOffers || 0).toLocaleString();
    $('walletEvents').textContent = Number(m.events7d || 0).toLocaleString();
    $('walletCollections').textContent = Number(m.collectionsCount || 0).toLocaleString();
    $('walletSubMinute').textContent = Number(m.subMinutePairs || 0).toLocaleString();
    $('walletHours').textContent = Number(m.activeHours || 0).toLocaleString();
    const evidence = Array.isArray(data.evidence) ? data.evidence : [];
    $('walletEvidence').innerHTML = evidence.length ? evidence.map((item) => `<div class="evidence">${esc(item)}</div>`).join('') : '<div class="evidence">No strong automation evidence surfaced from the available public marketplace sample.</div>';
  }

  async function checkWallet() {
    const wallet = String($('walletInput').value || '').trim().toLowerCase();
    if (!validWallet(wallet)) return setStatus('walletStatus', 'Paste a valid 0x EVM wallet address.', 'error');
    const button = $('walletBtn');
    setBusy(button, true, 'ANALYZING…', 'CHECK WALLET');
    setStatus('walletStatus', 'Reading global active listings, offers, recent marketplace events and collection breadth…', 'warn');
    try {
      const data = await api({ mode:'wallet', wallet });
      renderWallet(data);
      setStatus('walletStatus', data.manualConfirmed ? 'Wallet matched a trusted CONFIRMED BOT record.' : `Behavioral analysis complete · ${statusLabel(data.classification)} · ${data.confidence}% confidence.`);
    } catch (error) {
      setStatus('walletStatus', error?.name === 'AbortError' ? 'Wallet analysis timed out. Retry.' : (error?.message || 'Wallet analysis failed.'), 'error');
    } finally { setBusy(button, false, '', 'CHECK WALLET'); }
  }

  function renderDatabase(data) {
    state.dbRows = Array.isArray(data.rows) ? data.rows : [];
    $('dbConfirmed').textContent = Number(data.counts?.confirmed || 0).toLocaleString();
    $('dbSuspected').textContent = Number(data.counts?.highlySuspected || 0).toLocaleString();
    $('dbWatch').textContent = Number(data.counts?.watch || 0).toLocaleString();
    $('dbTotal').textContent = Number(data.counts?.total || 0).toLocaleString();
    $('databaseRows').innerHTML = state.dbRows.length ? state.dbRows.map((row) => `<div class="db-row">
      <code>${esc(short(row.wallet))}</code>
      <span class="badge ${statusClass(row.status)}">${statusLabel(row.status)}</span>
      <b>${Number(row.confidence || 0)}%</b>
      <div class="reasons">${(row.evidence || []).slice(0,3).map((item) => `<span class="reason">${esc(item)}</span>`).join('') || '<span class="reason">observation stored</span>'}</div>
    </div>`).join('') : '<div class="empty">No wallet observations stored yet.</div>';
  }

  async function loadDatabase() {
    const button = $('refreshDbBtn');
    setBusy(button, true, 'LOADING…', 'REFRESH');
    setStatus('databaseStatus', 'Loading the persistent FORGE intelligence registry…', 'warn');
    try {
      const data = await api({ mode:'database' });
      renderDatabase(data);
      setStatus('databaseStatus', `Registry loaded · ${data.counts?.confirmed || 0} confirmed · ${data.counts?.highlySuspected || 0} highly suspected · ${data.counts?.watch || 0} watch.`);
    } catch (error) {
      setStatus('databaseStatus', error?.message || 'Could not load bot intelligence database.', 'error');
    } finally { setBusy(button, false, '', 'REFRESH'); }
  }

  async function copyReviewList() {
    const rows = state.collectionRows.filter((row) => row.botStatus === 'confirmed' || row.botStatus === 'highly_suspected' || row.botStatus === 'watch' || Number(row.score) >= 40);
    if (!rows.length) return;
    const text = rows.map((row) => `${row.wallet}\t${statusLabel(row.botStatus)}\tconfidence=${row.botConfidence || 0}\tfloor_score=${row.score || 0}`).join('\n');
    try { await navigator.clipboard.writeText(text); setStatus('collectionStatus', `Copied ${rows.length} wallet${rows.length === 1 ? '' : 's'} for review.`); }
    catch (_) { setStatus('collectionStatus', 'Clipboard access was blocked by the browser.', 'error'); }
  }
  function exportCsv() {
    if (!state.collectionRows.length) return;
    const header = ['wallet','bot_status','bot_confidence','floor_score','active_low_listings','listing_events','sale_events','reasons'];
    const lines = state.collectionRows.map((row) => [row.wallet,row.botStatus,row.botConfidence,row.score,row.activeLowListings,row.recentListings,row.recentSales,`"${String([...(row.registryEvidence||[]),...(row.reasons||[])].join('; ')).replace(/"/g,'""')}"`].join(','));
    const blob = new Blob([[header.join(','),...lines].join('\n')], { type:'text/csv;charset=utf-8' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `forge-floor-guard-v2-${state.collection?.slug || 'scan'}.csv`; document.body.appendChild(link); link.click(); const href = link.href; link.remove(); setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
  $('scanBtn').addEventListener('click', scanCollection);
  $('collectionInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') scanCollection(); });
  $('walletBtn').addEventListener('click', checkWallet);
  $('walletInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') checkWallet(); });
  $('refreshDbBtn').addEventListener('click', loadDatabase);
  $('copyWatchBtn').addEventListener('click', copyReviewList);
  $('exportBtn').addEventListener('click', exportCsv);

  const params = new URLSearchParams(location.search);
  const collection = slugFromInput(params.get('collection'));
  const hours = Number(params.get('hours'));
  const wallet = params.get('wallet');
  if (collection) $('collectionInput').value = collection;
  if ([1,6,24,72,168].includes(hours)) $('windowSelect').value = String(hours);
  if (validWallet(wallet)) { $('walletInput').value = wallet; switchTab('wallet'); setTimeout(checkWallet, 120); }
  else if (collection) setTimeout(scanCollection, 120);
})();

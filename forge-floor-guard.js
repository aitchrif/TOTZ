(() => {
  const $ = (id) => document.getElementById(id);
  const DEFAULT_VISIBLE_BIDDERS = 5;
  const state = { scan: null, rows: [], session: '', workspace: null, bidderFilter: 'all', showAllBidders: false };
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const short = (wallet) => String(wallet || '').length > 15 ? `${wallet.slice(0, 7)}…${wallet.slice(-5)}` : String(wallet || '');
  const validAddress = (value) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());
  const statusClass = (status) => status === 'confirmed' ? 'confirmed' : status === 'highly_suspected' ? 'suspected' : status === 'watch' ? 'watch' : status === 'low_signal' ? 'low' : 'unreviewed';
  const statusLabel = (status) => status === 'confirmed' ? 'CONFIRMED BOT' : status === 'highly_suspected' ? 'HIGHLY SUSPECTED' : status === 'watch' ? 'WATCH' : status === 'low_signal' ? 'LOW SIGNAL' : 'UNREVIEWED';
  const sessionKey = () => state.scan ? `forgeSecurity:${state.scan.contract.chain}:${state.scan.contract.address}` : '';

  function installPolishStyles() {
    if (document.querySelector('style[data-floor-guard-polish]')) return;
    const style = document.createElement('style');
    style.dataset.floorGuardPolish = '1';
    style.textContent = `
      .owner-card.verified-compact{padding:14px 18px;background:linear-gradient(135deg,#2B2140,#403453)}
      .owner-card.verified-compact .owner-grid{grid-template-columns:1fr auto;gap:12px}
      .owner-card.verified-compact h2{font-size:1.05rem;margin:0}
      .owner-card.verified-compact .owner-grid>div>p,.owner-card.verified-compact .micro{display:none}
      .owner-card.verified-compact .owner-action small{display:none}
      .owner-card.verified-compact .owner-action .btn{padding:9px 13px;box-shadow:none}
      .owner-card.verified-compact .status{margin-top:8px;padding:8px 11px;font-size:.68rem}
      .scan-delta{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}
      .delta-chip{display:inline-flex;align-items:center;border-radius:999px;padding:4px 7px;font-size:.52rem;font-weight:900;background:#fff}
      .delta-chip.up{background:#FFE2B8;color:#7B4C08}.delta-chip.down{background:#E7F4EF;color:#355642}.delta-chip.new{background:#FFDED9;color:#8B2D22}.delta-chip.neutral{background:#F1ECF7;color:#6A607B}
      .scan-row{align-items:flex-start}.scan-row>span{white-space:nowrap;padding-top:2px}
      .score{position:relative}.score[title]{cursor:help}
      .bidder-filter-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:9px 0 11px;padding:9px 10px;border:1px solid rgba(43,33,64,.08);border-radius:16px;background:#fff}
      .bidder-filters{display:flex;gap:6px;flex-wrap:wrap}.bidder-filter{border:0;border-radius:999px;padding:7px 10px;background:var(--cream,#FFF3DC);font-size:.58rem;font-weight:900;cursor:pointer}.bidder-filter.active{background:var(--ink,#2B2140);color:#fff}.bidder-filter-count{opacity:.7}
      .bidder-compact-meta{display:flex;align-items:center;gap:9px;color:var(--soft,#6A607B);font-size:.59rem;font-weight:900}.bidder-toggle{border:2px solid var(--ink,#2B2140);border-radius:999px;padding:7px 10px;background:#fff;font-size:.58rem;font-weight:900;cursor:pointer}.bidder-toggle[hidden]{display:none!important}
      @media(max-width:650px){.owner-card.verified-compact .owner-grid{grid-template-columns:1fr}.owner-card.verified-compact .owner-action{text-align:left}.scan-row{align-items:flex-start;flex-direction:column}.bidder-filter-bar{align-items:flex-start}.bidder-compact-meta{width:100%;justify-content:space-between}}
    `;
    document.head.appendChild(style);
    const headers = Array.from(document.querySelectorAll('.table thead th'));
    const confidenceHeader = headers.find((node) => String(node.textContent || '').trim().toUpperCase() === 'CONFIDENCE');
    if (confidenceHeader) confidenceHeader.textContent = 'AUTOMATION SCORE';
    installBidderControls();
  }

  function setOwnerCardVerified(workspace) {
    const card = $('ownerCard');
    if (!card) return;
    card.classList.add('verified-compact');
    const title = card.querySelector('h2');
    if (title) title.textContent = '✓ Owner verified · security workspace active';
    $('connectOwnerBtn').textContent = 'WORKSPACE ACTIVE';
    $('connectOwnerBtn').disabled = true;
    $('ownerHint').textContent = `${workspace.collection_name || workspace.collection_slug || 'Collection'} · verified by ${workspace.verification_method}`;
  }

  function resetOwnerCard() {
    const card = $('ownerCard');
    if (!card) return;
    card.classList.remove('verified-compact');
    const title = card.querySelector('h2');
    if (title) title.textContent = 'Collection owner? Unlock the security workspace.';
    $('connectOwnerBtn').disabled = !state.scan;
    $('connectOwnerBtn').textContent = state.scan ? 'CONNECT OWNER WALLET' : 'SCAN A COLLECTION FIRST';
    $('ownerHint').textContent = state.scan ? `Verify owner/admin control of ${state.scan.collection?.name || 'this collection'}.` : 'Public scanning does not require a wallet.';
  }

  function setStatus(id, message, type = '') {
    const node = $(id); if (!node) return;
    node.textContent = message || '';
    node.className = `status${message ? ' show' : ''}${type ? ` ${type}` : ''}`;
  }
  function busy(button, isBusy, busyText, idleText) {
    if (!button) return; button.disabled = isBusy; button.textContent = isBusy ? busyText : idleText;
  }
  async function getApi(params, timeout = 52000) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(`/api/forge-floor-guard?${new URLSearchParams(params)}`, { cache: 'no-store', signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || data.detail || `Request failed (${response.status}).`);
      return data;
    } finally { clearTimeout(timer); }
  }
  async function ownerApi(body, session = state.session, timeout = 30000) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch('/api/forge-floor-guard-owner', {
        method: 'POST', cache: 'no-store', signal: controller.signal,
        headers: { 'content-type': 'application/json', ...(session ? { 'x-forge-session': session } : {}) },
        body: JSON.stringify(body)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { const error = new Error(data.error || data.detail || `Request failed (${response.status}).`); error.status = response.status; throw error; }
      return data;
    } finally { clearTimeout(timer); }
  }

  function verdict(summary) {
    if (Number(summary.confirmedBotBidders) > 0) return { cls:'alert', title:'CONFIRMED BOT ACTIVITY FOUND', text:`${summary.confirmedBotBidders} current bidder wallet${summary.confirmedBotBidders === 1 ? '' : 's'} matched the trusted FORGE bot registry.` };
    if (Number(summary.highlySuspectedBidders) > 0) return { cls:'warn', title:'AUTOMATION RISK DETECTED', text:`No confirmed registry bot matched, but ${summary.highlySuspectedBidders} bidder wallet${summary.highlySuspectedBidders === 1 ? '' : 's'} showed strong automation signals and should be reviewed.` };
    if (Number(summary.watchBidders) > 0) return { cls:'warn', title:'REVIEW RECOMMENDED', text:`${summary.watchBidders} bidder wallet${summary.watchBidders === 1 ? '' : 's'} crossed the watch threshold. Review evidence before taking action.` };
    return { cls:'', title:'NO STRONG BOT SIGNALS', text:'No confirmed bot or strong automation signal was found in the current bidder sample.' };
  }

  function rowMatchesFilter(row) {
    if (state.bidderFilter === 'confirmed') return row.status === 'confirmed';
    if (state.bidderFilter === 'suspected') return row.status === 'highly_suspected';
    if (state.bidderFilter === 'watch') return row.status === 'watch';
    return true;
  }

  function bidderCounts() {
    return {
      all: state.rows.length,
      confirmed: state.rows.filter((r) => r.status === 'confirmed').length,
      suspected: state.rows.filter((r) => r.status === 'highly_suspected').length,
      watch: state.rows.filter((r) => r.status === 'watch').length
    };
  }

  function installBidderControls() {
    if ($('bidderFilterBar')) return;
    const tableWrap = document.querySelector('.table-wrap');
    if (!tableWrap) return;
    const bar = document.createElement('div');
    bar.id = 'bidderFilterBar';
    bar.className = 'bidder-filter-bar';
    bar.innerHTML = `
      <div class="bidder-filters" aria-label="Bidder filters">
        <button type="button" class="bidder-filter active" data-filter="all">ALL <span class="bidder-filter-count" data-count="all">0</span></button>
        <button type="button" class="bidder-filter" data-filter="confirmed">CONFIRMED <span class="bidder-filter-count" data-count="confirmed">0</span></button>
        <button type="button" class="bidder-filter" data-filter="suspected">SUSPECTED <span class="bidder-filter-count" data-count="suspected">0</span></button>
        <button type="button" class="bidder-filter" data-filter="watch">WATCH <span class="bidder-filter-count" data-count="watch">0</span></button>
      </div>
      <div class="bidder-compact-meta"><span id="bidderVisibleMeta">Showing 0 of 0</span><button id="bidderToggleBtn" class="bidder-toggle" type="button" hidden>SHOW ALL</button></div>`;
    tableWrap.insertAdjacentElement('beforebegin', bar);
    bar.querySelectorAll('.bidder-filter').forEach((button) => button.addEventListener('click', () => {
      state.bidderFilter = button.dataset.filter || 'all';
      state.showAllBidders = false;
      updateBidderControls();
      renderRows();
    }));
    $('bidderToggleBtn')?.addEventListener('click', () => {
      state.showAllBidders = !state.showAllBidders;
      renderRows();
    });
    updateBidderControls();
  }

  function updateBidderControls(filteredCount = null, shownCount = null) {
    installBidderControls();
    const counts = bidderCounts();
    document.querySelectorAll('.bidder-filter-count').forEach((node) => { const key = node.dataset.count; node.textContent = counts[key] ?? 0; });
    document.querySelectorAll('.bidder-filter').forEach((button) => button.classList.toggle('active', button.dataset.filter === state.bidderFilter));
    const filtered = filteredCount ?? state.rows.filter(rowMatchesFilter).length;
    const shown = shownCount ?? Math.min(filtered, state.showAllBidders ? filtered : DEFAULT_VISIBLE_BIDDERS);
    if ($('bidderVisibleMeta')) $('bidderVisibleMeta').textContent = filtered ? `Showing ${shown} of ${filtered}` : 'No matching bidders';
    const toggle = $('bidderToggleBtn');
    if (toggle) {
      toggle.hidden = filtered <= DEFAULT_VISIBLE_BIDDERS;
      toggle.textContent = state.showAllBidders ? 'SHOW TOP 5' : `SHOW ALL ${filtered}`;
    }
  }

  function renderRows() {
    const body = $('bidderRows'); const empty = $('bidderEmpty');
    const filteredRows = state.rows.filter(rowMatchesFilter);
    const rows = state.showAllBidders ? filteredRows : filteredRows.slice(0, DEFAULT_VISIBLE_BIDDERS);
    if (!rows.length) { body.innerHTML = ''; empty.hidden = false; empty.textContent = state.rows.length ? 'No bidders match this filter.' : 'No bidder activity found.'; updateBidderControls(filteredRows.length, 0); return; }
    empty.hidden = true;
    body.innerHTML = rows.map((row) => {
      const evidence = (row.evidence || []).slice(0, 4);
      const ownerActions = state.workspace ? `<button class="btn sky small owner-watch" data-wallet="${esc(row.wallet)}" data-status="watch" type="button">WATCH</button> <button class="btn ghost small owner-watch" data-wallet="${esc(row.wallet)}" data-status="restricted" type="button">RESTRICT</button>` : `<button class="btn ghost small owner-gate" type="button">OWNER TOOLS</button>`;
      return `<tr>
        <td><a class="wallet" href="https://opensea.io/${esc(row.wallet)}" target="_blank" rel="noopener noreferrer">${esc(short(row.wallet))} ↗</a></td>
        <td><span class="badge ${statusClass(row.status)}">${statusLabel(row.status)}</span></td>
        <td><span class="score" title="Behavioral automation-risk score. It is not the probability that this wallet is a bot.">${Number(row.confidence || 0)}</span></td>
        <td><b>${Number(row.currentOffers || 0).toLocaleString()}</b></td>
        <td>${Number(row.activeOffersGlobal || 0).toLocaleString()}</td>
        <td><div class="reasons">${evidence.length ? evidence.map((x) => `<span class="reason">${esc(x)}</span>`).join('') : '<span class="reason">no strong evidence</span>'}</div></td>
        <td>${ownerActions}</td>
      </tr>`;
    }).join('');
    updateBidderControls(filteredRows.length, rows.length);
    document.querySelectorAll('.owner-gate').forEach((button) => button.addEventListener('click', () => $('ownerCard').scrollIntoView({ behavior:'smooth', block:'center' })));
    document.querySelectorAll('.owner-watch').forEach((button) => button.addEventListener('click', () => upsertWatch(button.dataset.wallet, button.dataset.status, button)));
  }

  function renderScan(data) {
    state.scan = data; state.rows = Array.isArray(data.rows) ? data.rows : []; state.bidderFilter = 'all'; state.showAllBidders = false;
    $('resultShell').hidden = false;
    $('collectionName').textContent = data.collection?.name || data.contract?.name || 'Collection';
    $('collectionMeta').textContent = `${data.contract?.chain || 'EVM'} · ${data.contract?.standard || 'NFT'} · ${short(data.contract?.address || '')}`;
    $('openSeaLink').href = data.collection?.url || 'https://opensea.io';
    const s = data.summary || {};
    $('offersStat').textContent = Number(s.activeOffers || 0).toLocaleString();
    $('biddersStat').textContent = Number(s.uniqueBidders || 0).toLocaleString();
    $('confirmedStat').textContent = Number(s.confirmedBotBidders || 0).toLocaleString();
    $('suspectedStat').textContent = Number(s.highlySuspectedBidders || 0).toLocaleString();
    $('holdersStat').textContent = Number(s.confirmedBotHolders || 0).toLocaleString();
    const v = verdict(s); const box = $('verdictBox'); box.className = `verdict-main${v.cls ? ` ${v.cls}` : ''}`; $('verdictTitle').textContent = v.title; $('verdictText').textContent = v.text;
    const flagged = state.rows.filter((r) => ['confirmed','highly_suspected','watch'].includes(r.status));
    $('copyFlaggedBtn').disabled = flagged.length === 0; $('exportBtn').disabled = state.rows.length === 0;
    if (!state.workspace) resetOwnerCard();
    renderRows();
    const url = new URL(location.href); url.searchParams.set('contract', data.contract.address); history.replaceState({}, '', url);
    restoreWorkspace();
  }

  async function scanCollection() {
    const contract = String($('contractInput').value || '').trim().toLowerCase();
    if (!validAddress(contract)) return setStatus('scanStatus', 'Paste a valid 0x EVM NFT collection contract address.', 'error');
    const button = $('scanBtn'); busy(button, true, 'SCANNING BIDDERS…', 'SCAN COLLECTION');
    setStatus('scanStatus', 'Detecting chain and collection, reading live OpenSea offers, checking bidder wallets and the FORGE bot registry…', 'warn');
    try {
      const data = await getApi({ mode:'security', contract }); renderScan(data);
      const s = data.summary || {};
      setStatus('scanStatus', `Scan complete · ${s.activeOffers || 0} current offers · ${s.uniqueBidders || 0} unique bidders · ${s.confirmedBotBidders || 0} confirmed bot matches · ${s.highlySuspectedBidders || 0} highly suspected.`, 'ok');
      $('resultShell').scrollIntoView({ behavior:'smooth', block:'start' });
    } catch (error) {
      setStatus('scanStatus', error?.name === 'AbortError' ? 'Collection security scan timed out. Retry.' : (error?.message || 'Collection scan failed.'), 'error');
    } finally { busy(button, false, '', 'SCAN COLLECTION'); }
  }

  async function copyFlagged() {
    const rows = state.rows.filter((r) => ['confirmed','highly_suspected','watch'].includes(r.status)); if (!rows.length) return;
    const text = rows.map((r) => `${r.wallet}\t${statusLabel(r.status)}\tautomation_score=${r.confidence || 0}\toffers_here=${r.currentOffers || 0}`).join('\n');
    try { await navigator.clipboard.writeText(text); setStatus('scanStatus', `Copied ${rows.length} flagged wallet${rows.length === 1 ? '' : 's'}.`, 'ok'); } catch (_) { setStatus('scanStatus', 'Clipboard access was blocked by the browser.', 'error'); }
  }
  function exportCsv() {
    if (!state.rows.length) return;
    const header = ['wallet','status','automation_score','offers_here','global_active_offers','evidence'];
    const lines = state.rows.map((r) => [r.wallet,r.status,r.confidence,r.currentOffers,r.activeOffersGlobal,`"${String((r.evidence||[]).join('; ')).replace(/"/g,'""')}"`].join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type:'text/csv;charset=utf-8' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `totz-forge-security-${state.scan?.collection?.slug || 'scan'}.csv`; document.body.appendChild(link); link.click(); const href = link.href; link.remove(); setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  function flaggedRows(scan) {
    return Array.isArray(scan?.flagged) ? scan.flagged.filter((row) => row && row.wallet) : [];
  }
  function highRiskWallets(scan) {
    return new Set(flaggedRows(scan).filter((row) => ['confirmed','highly_suspected'].includes(String(row.status || ''))).map((row) => String(row.wallet).toLowerCase()));
  }
  function scanDeltaChips(scan, previous) {
    if (!previous) return '<span class="delta-chip neutral">BASELINE</span>';
    const current = scan?.counts || {}; const older = previous?.counts || {};
    const chips = [];
    const metrics = [['activeOffers','offers'],['uniqueBidders','bidders'],['confirmedBotBidders','confirmed'],['highlySuspectedBidders','suspected']];
    for (const [key, label] of metrics) {
      const delta = Number(current[key] || 0) - Number(older[key] || 0);
      if (!delta) continue;
      chips.push(`<span class="delta-chip ${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '+' : ''}${delta} ${label}</span>`);
    }
    const nowRisk = highRiskWallets(scan); const oldRisk = highRiskWallets(previous);
    const newRisk = [...nowRisk].filter((wallet) => !oldRisk.has(wallet));
    if (newRisk.length) chips.unshift(`<span class="delta-chip new">NEW HIGH-RISK ${newRisk.length}</span>`);
    const currentRows = new Map(flaggedRows(scan).map((row) => [String(row.wallet).toLowerCase(), row]));
    const olderRows = new Map(flaggedRows(previous).map((row) => [String(row.wallet).toLowerCase(), row]));
    let biggest = null;
    for (const [wallet, row] of currentRows) {
      const old = olderRows.get(wallet); if (!old) continue;
      const diff = Number(row.currentOffers || 0) - Number(old.currentOffers || 0);
      if (!diff) continue;
      if (!biggest || Math.abs(diff) > Math.abs(biggest.diff)) biggest = { wallet, diff };
    }
    if (biggest) chips.push(`<span class="delta-chip ${biggest.diff > 0 ? 'up' : 'down'}">${esc(short(biggest.wallet))} ${biggest.diff > 0 ? '+' : ''}${biggest.diff} offers</span>`);
    return chips.length ? chips.join('') : '<span class="delta-chip neutral">NO MATERIAL CHANGE</span>';
  }

  function renderWorkspace(bundle) {
    const workspace = bundle?.workspace; if (!workspace) return;
    state.workspace = bundle; $('ownerWorkspace').hidden = false;
    setOwnerCardVerified(workspace);
    $('workspaceIdentity').textContent = `${workspace.collection_name || workspace.collection_slug || 'Collection'} · ${workspace.chain} · owner verified by ${workspace.verification_method}`;
    const enabled = workspace.monitoring_enabled === true;
    $('monitorLabel').textContent = enabled ? 'Monitoring enabled' : 'Monitoring off';
    $('monitorMeta').textContent = enabled ? 'Auto-scan active · about every 6 hours' : 'Manual scans only · scheduled scans paused';
    $('monitorBtn').textContent = enabled ? 'DISABLE' : 'ENABLE';
    const watch = Array.isArray(bundle.watchlist) ? bundle.watchlist : [];
    $('watchList').innerHTML = watch.length ? watch.map((row) => `<div class="watch-row"><div><code>${esc(short(row.wallet))}</code><div class="watch-meta">${esc(String(row.status || 'watch').toUpperCase())}${row.note ? ` · ${esc(row.note)}` : ''}</div></div><button class="btn ghost small watch-remove" data-wallet="${esc(row.wallet)}" type="button">REMOVE</button></div>`).join('') : '<div class="empty">No wallets on the watchlist.</div>';
    document.querySelectorAll('.watch-remove').forEach((button) => button.addEventListener('click', () => removeWatch(button.dataset.wallet, button)));
    const scans = Array.isArray(bundle.recentScans) ? bundle.recentScans : [];
    $('scanHistory').innerHTML = scans.length ? scans.map((scan, index) => {
      const c = scan.counts || {}; const when = scan.scanned_at ? new Date(scan.scanned_at).toLocaleString() : '—'; const previous = scans[index + 1] || null;
      return `<div class="scan-row"><div><b>${Number(c.activeOffers || 0)} offers · ${Number(c.uniqueBidders || 0)} bidders</b><br><span>${Number(c.confirmedBotBidders || 0)} confirmed · ${Number(c.highlySuspectedBidders || 0)} suspected</span><div class="scan-delta">${scanDeltaChips(scan, previous)}</div></div><span>${esc(when)}</span></div>`;
    }).join('') : '<div class="empty">No stored scans yet.</div>';
    setStatus('ownerStatus', `Owner verified · workspace active via ${workspace.verification_method}.`, 'ok');
    renderRows();
  }

  async function restoreWorkspace() {
    if (!state.scan) return;
    const key = sessionKey(); const saved = key ? localStorage.getItem(key) : '';
    if (!saved) { state.session = ''; state.workspace = null; $('ownerWorkspace').hidden = true; resetOwnerCard(); renderRows(); return; }
    try {
      const bundle = await ownerApi({ action:'workspace' }, saved); state.session = saved; renderWorkspace(bundle);
    } catch (_) {
      localStorage.removeItem(key); state.session = ''; state.workspace = null; $('ownerWorkspace').hidden = true; resetOwnerCard(); renderRows();
    }
  }

  async function connectOwner() {
    if (!state.scan) return setStatus('ownerStatus', 'Scan a collection first.', 'error');
    if (!window.ethereum?.request || !window.ethers?.BrowserProvider) return setStatus('ownerStatus', 'No compatible EVM browser wallet detected.', 'error');
    const button = $('connectOwnerBtn'); busy(button, true, 'VERIFYING OWNER…', 'CONNECT OWNER WALLET');
    setStatus('ownerStatus', 'Connect the owner/admin wallet. You will sign a login message only — no transaction or approval.', 'warn');
    try {
      const provider = new ethers.BrowserProvider(window.ethereum); await provider.send('eth_requestAccounts', []); const signer = await provider.getSigner(); const wallet = (await signer.getAddress()).toLowerCase();
      const challenge = await ownerApi({ action:'challenge', chain:state.scan.contract.chain, contract:state.scan.contract.address, wallet, slug:state.scan.collection?.slug || '' }, '', 20000);
      const signature = await signer.signMessage(challenge.message);
      const verified = await ownerApi({ action:'verify', challengeId:challenge.challengeId, signature, slug:state.scan.collection?.slug || '', collectionName:state.scan.collection?.name || state.scan.contract?.name || '' }, '', 30000);
      state.session = verified.session; localStorage.setItem(sessionKey(), state.session); renderWorkspace(verified); $('ownerWorkspace').scrollIntoView({ behavior:'smooth', block:'start' });
    } catch (error) {
      setStatus('ownerStatus', error?.message || 'Owner verification failed.', 'error'); busy(button, false, '', 'CONNECT OWNER WALLET');
    }
  }

  async function upsertWatch(wallet, status, button) {
    if (!state.session || !state.workspace) return;
    busy(button, true, 'SAVING…', status === 'restricted' ? 'RESTRICT' : 'WATCH');
    try { const bundle = await ownerApi({ action:'watchlist_upsert', wallet, status }); renderWorkspace(bundle); setStatus('ownerStatus', `${short(wallet)} added as ${status.toUpperCase()} in this workspace.`, 'ok'); }
    catch (error) { setStatus('ownerStatus', error?.message || 'Could not update watchlist.', 'error'); }
  }
  async function removeWatch(wallet, button) {
    busy(button, true, '…', 'REMOVE');
    try { const bundle = await ownerApi({ action:'watchlist_remove', wallet }); renderWorkspace(bundle); }
    catch (error) { setStatus('ownerStatus', error?.message || 'Could not remove wallet.', 'error'); }
  }
  async function toggleMonitoring() {
    if (!state.workspace) return; const enabled = state.workspace.workspace?.monitoring_enabled !== true; const button = $('monitorBtn'); busy(button, true, 'SAVING…', enabled ? 'ENABLE' : 'DISABLE');
    try { const bundle = await ownerApi({ action:'monitoring', enabled }); renderWorkspace(bundle); setStatus('ownerStatus', enabled ? 'Monitoring enabled · automatic read-only scan runs about every 6 hours.' : 'Monitoring disabled · scheduled scans paused.', 'ok'); }
    catch (error) { setStatus('ownerStatus', error?.message || 'Could not update monitoring.', 'error'); }
  }
  function disconnectWorkspace() {
    if (state.scan) localStorage.removeItem(sessionKey()); state.session = ''; state.workspace = null; $('ownerWorkspace').hidden = true; resetOwnerCard(); setStatus('ownerStatus', 'Workspace session disconnected. Public scanner remains available.'); renderRows();
  }

  installPolishStyles();
  $('scanBtn').addEventListener('click', scanCollection); $('contractInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') scanCollection(); });
  $('copyFlaggedBtn').addEventListener('click', copyFlagged); $('exportBtn').addEventListener('click', exportCsv); $('connectOwnerBtn').addEventListener('click', connectOwner); $('monitorBtn').addEventListener('click', toggleMonitoring); $('disconnectWorkspaceBtn').addEventListener('click', disconnectWorkspace);

  const contract = new URLSearchParams(location.search).get('contract'); if (validAddress(contract)) { $('contractInput').value = contract; setTimeout(scanCollection, 120); }
})();
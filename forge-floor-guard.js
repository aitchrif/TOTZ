(() => {
  const $ = (id) => document.getElementById(id);
  const state = { scan: null, rows: [], session: '', workspace: null };
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const short = (wallet) => String(wallet || '').length > 15 ? `${wallet.slice(0, 7)}…${wallet.slice(-5)}` : String(wallet || '');
  const validAddress = (value) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());
  const statusClass = (status) => status === 'confirmed' ? 'confirmed' : status === 'highly_suspected' ? 'suspected' : status === 'watch' ? 'watch' : status === 'low_signal' ? 'low' : 'unreviewed';
  const statusLabel = (status) => status === 'confirmed' ? 'CONFIRMED BOT' : status === 'highly_suspected' ? 'HIGHLY SUSPECTED' : status === 'watch' ? 'WATCH' : status === 'low_signal' ? 'LOW SIGNAL' : 'UNREVIEWED';
  const sessionKey = () => state.scan ? `forgeSecurity:${state.scan.contract.chain}:${state.scan.contract.address}` : '';

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

  function renderRows() {
    const body = $('bidderRows'); const empty = $('bidderEmpty'); const rows = state.rows;
    if (!rows.length) { body.innerHTML = ''; empty.hidden = false; return; }
    empty.hidden = true;
    body.innerHTML = rows.map((row) => {
      const evidence = (row.evidence || []).slice(0, 4);
      const ownerActions = state.workspace ? `<button class="btn sky small owner-watch" data-wallet="${esc(row.wallet)}" data-status="watch" type="button">WATCH</button> <button class="btn ghost small owner-watch" data-wallet="${esc(row.wallet)}" data-status="restricted" type="button">RESTRICT</button>` : `<button class="btn ghost small owner-gate" type="button">OWNER TOOLS</button>`;
      return `<tr>
        <td><a class="wallet" href="https://opensea.io/${esc(row.wallet)}" target="_blank" rel="noopener noreferrer">${esc(short(row.wallet))} ↗</a></td>
        <td><span class="badge ${statusClass(row.status)}">${statusLabel(row.status)}</span></td>
        <td><span class="score">${Number(row.confidence || 0)}</span></td>
        <td><b>${Number(row.currentOffers || 0).toLocaleString()}</b></td>
        <td>${Number(row.activeOffersGlobal || 0).toLocaleString()}</td>
        <td><div class="reasons">${evidence.length ? evidence.map((x) => `<span class="reason">${esc(x)}</span>`).join('') : '<span class="reason">no strong evidence</span>'}</div></td>
        <td>${ownerActions}</td>
      </tr>`;
    }).join('');
    document.querySelectorAll('.owner-gate').forEach((button) => button.addEventListener('click', () => $('ownerCard').scrollIntoView({ behavior:'smooth', block:'center' })));
    document.querySelectorAll('.owner-watch').forEach((button) => button.addEventListener('click', () => upsertWatch(button.dataset.wallet, button.dataset.status, button)));
  }

  function renderScan(data) {
    state.scan = data; state.rows = Array.isArray(data.rows) ? data.rows : [];
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
    $('connectOwnerBtn').disabled = false; $('connectOwnerBtn').textContent = 'CONNECT OWNER WALLET'; $('ownerHint').textContent = `Verify owner/admin control of ${data.collection?.name || 'this collection'}.`;
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
    const text = rows.map((r) => `${r.wallet}\t${statusLabel(r.status)}\tconfidence=${r.confidence || 0}\toffers_here=${r.currentOffers || 0}`).join('\n');
    try { await navigator.clipboard.writeText(text); setStatus('scanStatus', `Copied ${rows.length} flagged wallet${rows.length === 1 ? '' : 's'}.`, 'ok'); } catch (_) { setStatus('scanStatus', 'Clipboard access was blocked by the browser.', 'error'); }
  }
  function exportCsv() {
    if (!state.rows.length) return;
    const header = ['wallet','status','confidence','offers_here','global_active_offers','evidence'];
    const lines = state.rows.map((r) => [r.wallet,r.status,r.confidence,r.currentOffers,r.activeOffersGlobal,`"${String((r.evidence||[]).join('; ')).replace(/"/g,'""')}"`].join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type:'text/csv;charset=utf-8' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `totz-forge-security-${state.scan?.collection?.slug || 'scan'}.csv`; document.body.appendChild(link); link.click(); const href = link.href; link.remove(); setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  function renderWorkspace(bundle) {
    const workspace = bundle?.workspace; if (!workspace) return;
    state.workspace = bundle; $('ownerWorkspace').hidden = false;
    $('workspaceIdentity').textContent = `${workspace.collection_name || workspace.collection_slug || 'Collection'} · ${workspace.chain} · owner verified by ${workspace.verification_method}`;
    const enabled = workspace.monitoring_enabled === true; $('monitorLabel').textContent = enabled ? 'Monitoring enabled' : 'Monitoring off'; $('monitorMeta').textContent = enabled ? 'Workspace is tracking scan history' : 'Manual scans only'; $('monitorBtn').textContent = enabled ? 'DISABLE' : 'ENABLE';
    const watch = Array.isArray(bundle.watchlist) ? bundle.watchlist : [];
    $('watchList').innerHTML = watch.length ? watch.map((row) => `<div class="watch-row"><div><code>${esc(short(row.wallet))}</code><div class="watch-meta">${esc(String(row.status || 'watch').toUpperCase())}${row.note ? ` · ${esc(row.note)}` : ''}</div></div><button class="btn ghost small watch-remove" data-wallet="${esc(row.wallet)}" type="button">REMOVE</button></div>`).join('') : '<div class="empty">No wallets on the watchlist.</div>';
    document.querySelectorAll('.watch-remove').forEach((button) => button.addEventListener('click', () => removeWatch(button.dataset.wallet, button)));
    const scans = Array.isArray(bundle.recentScans) ? bundle.recentScans : [];
    $('scanHistory').innerHTML = scans.length ? scans.map((scan) => { const c = scan.counts || {}; const when = scan.scanned_at ? new Date(scan.scanned_at).toLocaleString() : '—'; return `<div class="scan-row"><div><b>${Number(c.activeOffers || 0)} offers · ${Number(c.uniqueBidders || 0)} bidders</b><br><span>${Number(c.confirmedBotBidders || 0)} confirmed · ${Number(c.highlySuspectedBidders || 0)} suspected</span></div><span>${esc(when)}</span></div>`; }).join('') : '<div class="empty">No stored scans yet.</div>';
    setStatus('ownerStatus', `Owner verified · workspace unlocked via ${workspace.verification_method}.`, 'ok');
    renderRows();
  }

  async function restoreWorkspace() {
    if (!state.scan) return;
    const key = sessionKey(); const saved = key ? localStorage.getItem(key) : '';
    if (!saved) { state.session = ''; state.workspace = null; $('ownerWorkspace').hidden = true; renderRows(); return; }
    try {
      const bundle = await ownerApi({ action:'workspace' }, saved); state.session = saved; renderWorkspace(bundle);
      $('connectOwnerBtn').textContent = 'WORKSPACE UNLOCKED'; $('connectOwnerBtn').disabled = true;
    } catch (_) {
      localStorage.removeItem(key); state.session = ''; state.workspace = null; $('ownerWorkspace').hidden = true; renderRows();
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
      state.session = verified.session; localStorage.setItem(sessionKey(), state.session); renderWorkspace(verified); button.textContent = 'WORKSPACE UNLOCKED'; button.disabled = true; $('ownerWorkspace').scrollIntoView({ behavior:'smooth', block:'start' });
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
    try { const bundle = await ownerApi({ action:'monitoring', enabled }); renderWorkspace(bundle); }
    catch (error) { setStatus('ownerStatus', error?.message || 'Could not update monitoring.', 'error'); }
  }
  function disconnectWorkspace() {
    if (state.scan) localStorage.removeItem(sessionKey()); state.session = ''; state.workspace = null; $('ownerWorkspace').hidden = true; $('connectOwnerBtn').disabled = false; $('connectOwnerBtn').textContent = 'CONNECT OWNER WALLET'; setStatus('ownerStatus', 'Workspace session disconnected. Public scanner remains available.'); renderRows();
  }

  $('scanBtn').addEventListener('click', scanCollection); $('contractInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') scanCollection(); });
  $('copyFlaggedBtn').addEventListener('click', copyFlagged); $('exportBtn').addEventListener('click', exportCsv); $('connectOwnerBtn').addEventListener('click', connectOwner); $('monitorBtn').addEventListener('click', toggleMonitoring); $('disconnectWorkspaceBtn').addEventListener('click', disconnectWorkspace);

  const contract = new URLSearchParams(location.search).get('contract'); if (validAddress(contract)) { $('contractInput').value = contract; setTimeout(scanCollection, 120); }
})();

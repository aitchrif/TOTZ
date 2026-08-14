// Clarify reward lifecycle in the admin list and add safe raffle removal.
const REMOVE_API = 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/totz-rewards-admin-remove';

function removeMessage(id, ts) {
  return ['TOTZ Rewards Admin','Action: remove_raffle',`Wallet: ${wallet}`,`Raffle ID: ${id}`,`Chain ID: ${CHAIN_ID}`,`Contract: ${CONTRACT}`,`Timestamp: ${ts}`].join('\n');
}

async function removeApi(body, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(REMOVE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  } finally { clearTimeout(timer); }
}

async function removeRaffle(r) {
  if (!wallet || busy) return;
  const entries = Number(r.totalEntries || 0);
  const spent = Number(r.totalPointsSpent || 0);
  const warning = entries > 0
    ? `Delete “${r.title}”?\n\nThis raffle has ${entries} entries and ${spent.toLocaleString()} $TOTZ recorded. It will disappear from Admin/Rewards, but a recovery snapshot of the raffle and entries will be saved. Existing $TOTZ spend records are not refunded.`
    : `Delete “${r.title}”?\n\nThis raffle will be removed from Admin and Rewards. A recovery snapshot will be saved.`;
  if (!window.confirm(warning)) return;
  busy = true;
  try {
    const ts = Date.now();
    showStatus(`Sign to delete ${r.title}.`);
    const signature = await sign(removeMessage(r.id, ts));
    const result = await removeApi({ wallet, raffleId: r.id, timestamp: ts, signature });
    raffles = raffles.filter((x) => x.id !== r.id);
    if ($('raffleId').value === r.id) resetForm();
    renderRaffles();
    showStatus(result.archived ? 'Raffle deleted. Recovery snapshot saved.' : 'Raffle deleted.', 'ok');
  } catch (e) {
    showStatus(e.message || 'Could not delete raffle.', 'error');
  } finally { busy = false; }
}

renderRaffles = function() {
  const list = $('raffleList');
  if (!raffles.length) {
    list.innerHTML = '<div class="empty">No rewards yet. Create your first raffle.</div>';
    return;
  }
  list.innerHTML = '';
  const now = Date.now();
  for (const r of raffles) {
    const starts = Date.parse(r.starts_at);
    const ends = Date.parse(r.ends_at);
    const scheduled = Boolean(r.active) && Number.isFinite(starts) && now < starts;
    const ended = Number.isFinite(ends) && now >= ends;
    const live = Boolean(r.active) && !scheduled && !ended;
    let statusText = 'PAUSED';
    if (ended) statusText = 'ENDED';
    else if (scheduled) statusText = 'SCHEDULED';
    else if (live) statusText = 'ACTIVE';
    const timingLine = scheduled ? `Starts ${fmtDate(r.starts_at)} · Ends ${fmtDate(r.ends_at)}` : `Ends ${fmtDate(r.ends_at)}`;
    const el = document.createElement('article');
    el.className = 'raffle';
    el.innerHTML = `
      <div class="raffle-top">
        <div><h3>${escapeHtml(r.title)}</h3><div class="meta">${escapeHtml(r.prize_name)} · ${Number(r.entry_cost)} $TOTZ / entry<br>${r.max_entries_per_wallet ? `Max ${r.max_entries_per_wallet} / wallet` : 'Unlimited entries'} · ${timingLine}</div></div>
        <span class="tag ${live ? 'on' : 'off'}">${statusText}</span>
      </div>
      <div class="meta">${Number(r.totalEntries || 0)} total entries · ${Number(r.totalPointsSpent || 0).toLocaleString()} $TOTZ spent</div>
      <div class="raffle-actions">
        <button class="btn sky edit-btn">EDIT</button>
        <button class="btn ${r.active ? 'ghost' : 'dark'} active-btn" ${ended ? 'disabled' : ''}>${r.active ? 'PAUSE' : 'ACTIVATE'}</button>
        <button class="btn delete-btn">DELETE</button>
      </div>`;
    el.querySelector('.edit-btn').onclick = () => editRaffle(r);
    el.querySelector('.active-btn').onclick = () => toggleActive(r);
    el.querySelector('.delete-btn').onclick = () => removeRaffle(r);
    list.appendChild(el);
  }
};

(() => {
  const style = document.createElement('style');
  style.textContent = `.btn.delete-btn{background:#ffe0dc;color:#8b2b1f;border:2px solid #ffb2a8}.btn.delete-btn:hover{background:#ffcbc3}`;
  document.head.appendChild(style);
  const costInput = $('entryCost');
  const costLabel = costInput?.closest('.field')?.querySelector('label');
  if (costLabel) costLabel.textContent = '$TOTZ / Entry';
  if (!document.querySelector('script[data-totz-ui-brand]')) {
    const script = document.createElement('script');
    script.src = 'totz-ui-brand.js';
    script.dataset.totzUiBrand = '1';
    document.head.appendChild(script);
  }
  if (!document.querySelector('script[data-raffle-draw]')) {
    const script = document.createElement('script');
    script.src = 'rewards-admin-draw.js';
    script.dataset.raffleDraw = '1';
    document.head.appendChild(script);
  }
  if (wallet && raffles.length) renderRaffles();
})();

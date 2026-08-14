// Clarify reward lifecycle in the admin list.
// Active + future start time is SCHEDULED, not ACTIVE.
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

    const timingLine = scheduled
      ? `Starts ${fmtDate(r.starts_at)} · Ends ${fmtDate(r.ends_at)}`
      : `Ends ${fmtDate(r.ends_at)}`;

    const el = document.createElement('article');
    el.className = 'raffle';
    el.innerHTML = `
      <div class="raffle-top">
        <div>
          <h3>${escapeHtml(r.title)}</h3>
          <div class="meta">
            ${escapeHtml(r.prize_name)} · ${Number(r.entry_cost)} $TOTZ / entry<br>
            ${r.max_entries_per_wallet ? `Max ${r.max_entries_per_wallet} / wallet` : 'Unlimited entries'} · ${timingLine}
          </div>
        </div>
        <span class="tag ${live ? 'on' : 'off'}">${statusText}</span>
      </div>
      <div class="meta">${Number(r.totalEntries || 0)} total entries · ${Number(r.totalPointsSpent || 0).toLocaleString()} $TOTZ spent</div>
      <div class="raffle-actions">
        <button class="btn sky edit-btn">EDIT</button>
        <button class="btn ${r.active ? 'ghost' : 'dark'} active-btn" ${ended ? 'disabled' : ''}>${r.active ? 'PAUSE' : 'ACTIVATE'}</button>
      </div>`;

    el.querySelector('.edit-btn').onclick = () => editRaffle(r);
    el.querySelector('.active-btn').onclick = () => toggleActive(r);
    list.appendChild(el);
  }
};

(() => {
  if (document.querySelector('script[data-totz-ui-brand]')) return;
  const script = document.createElement('script');
  script.src = 'totz-ui-brand.js';
  script.dataset.totzUiBrand = '1';
  document.head.appendChild(script);
})();

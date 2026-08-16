const WINNER_API = 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/totz-rewards-draw';

function winnerShort(v) {
  const value = String(v || '');
  return value ? `${value.slice(0, 8)}…${value.slice(-6)}` : '';
}
function winnerEscape(v) {
  return String(v ?? '').replace(/[&<>'"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}
function winnerDate(v) {
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toLocaleString(undefined, { dateStyle:'medium', timeStyle:'short' }) : '';
}

function installWinnerSection() {
  if (document.getElementById('winnerSection')) return;
  const dashboard = document.getElementById('dashboard');
  if (!dashboard) return;
  const section = document.createElement('section');
  section.id = 'winnerSection';
  section.hidden = true;
  section.innerHTML = `
    <div class="section-head winner-head">
      <div><h2>Recent Winners 🏆</h2><p>Completed TOTZ raffles and their verified winners.</p></div>
      <span class="badge">VERIFIABLE DRAW</span>
    </div>
    <div id="winnerGrid" class="winner-grid"></div>`;
  dashboard.insertAdjacentElement('afterend', section);
}

function renderWinners(winners) {
  installWinnerSection();
  const section = document.getElementById('winnerSection');
  const grid = document.getElementById('winnerGrid');
  if (!section || !grid) return;
  if (!winners?.length) {
    section.hidden = true;
    grid.innerHTML = '';
    return;
  }
  section.hidden = false;
  const currentWallet = typeof wallet === 'string' ? wallet.toLowerCase() : '';
  grid.innerHTML = winners.map((w) => {
    const winner = String(w.winner_wallet || '').toLowerCase();
    const mine = currentWallet && winner === currentWallet;
    const proofUrl = `https://robinhoodchain.blockscout.com/block/${Number(w.draw_block_number || 0)}`;
    return `
      <article class="winner-card ${mine ? 'mine' : ''}">
        <div class="winner-media">
          ${w.prize_image_url ? `<img src="${winnerEscape(w.prize_image_url)}" alt="${winnerEscape(w.prize_name || w.title)}">` : '<div class="winner-placeholder">🏆</div>'}
          <span class="winner-badge">${mine ? '🎉 YOU WON' : '🏆 WINNER'}</span>
        </div>
        <div class="winner-body">
          <h3>${winnerEscape(w.title)}</h3>
          <p class="winner-prize">${winnerEscape(w.prize_name || '')}</p>
          <div class="winner-address" title="${winnerEscape(winner)}">${winnerEscape(winnerShort(winner))}</div>
          <div class="winner-proof">Ticket #${Number(w.winning_ticket || 0).toLocaleString()} of ${Number(w.draw_total_entries || 0).toLocaleString()} · ${winnerDate(w.drawn_at)}</div>
          <div class="winner-actions">
            <button type="button" class="winner-copy" data-wallet="${winnerEscape(winner)}">COPY WINNER</button>
            <a href="${proofUrl}" target="_blank" rel="noopener">VERIFY BLOCK #${Number(w.draw_block_number || 0).toLocaleString()}</a>
          </div>
        </div>
      </article>`;
  }).join('');

  grid.querySelectorAll('.winner-copy').forEach((button) => {
    button.addEventListener('click', async () => {
      const value = button.dataset.wallet || '';
      try {
        await navigator.clipboard.writeText(value);
        button.textContent = 'COPIED ✓';
        setTimeout(() => { button.textContent = 'COPY WINNER'; }, 1400);
      } catch (_) {}
    });
  });
}

async function loadWinners() {
  try {
    const res = await fetch(`${WINNER_API}?action=winners`, { cache:'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) return;
    renderWinners(data.winners || []);
  } catch (_) {}
}

(() => {
  const style = document.createElement('style');
  style.textContent = `
    #winnerSection{margin-top:42px}.winner-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
    .winner-card{background:#fff;border:2px solid var(--sky2);border-radius:22px;overflow:hidden;box-shadow:var(--shadow)}.winner-card.mine{border-color:var(--lime);box-shadow:0 0 0 3px rgba(203,219,42,.22),var(--shadow)}
    .winner-media{position:relative;aspect-ratio:16/10;background:linear-gradient(145deg,var(--sky),var(--cream2));overflow:hidden;display:grid;place-items:center}.winner-media img{width:100%;height:100%;object-fit:cover}.winner-placeholder{font-size:3.5rem}
    .winner-badge{position:absolute;top:10px;left:10px;background:var(--lime);color:var(--ink);padding:6px 9px;border-radius:999px;font-size:.68rem;font-weight:1000;box-shadow:0 5px 14px rgba(43,33,64,.14)}
    .winner-body{padding:14px}.winner-body h3{margin:0;font-size:1.15rem}.winner-prize{margin:3px 0 10px;color:var(--soft);font-size:.82rem;font-weight:800}.winner-address{font-family:monospace;font-size:.9rem;font-weight:900;background:var(--cream);border-radius:10px;padding:8px 9px}.winner-proof{font-size:.7rem;color:var(--soft);font-weight:800;line-height:1.45;margin:8px 0}
    .winner-actions{display:flex;gap:7px;flex-wrap:wrap}.winner-actions button,.winner-actions a{border:0;background:var(--ink);color:#fff;border-radius:999px;padding:7px 9px;font:900 .64rem 'Nunito';cursor:pointer}.winner-actions a{background:var(--sky);color:var(--ink)}
    @media(max-width:900px){.winner-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:600px){.winner-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
  installWinnerSection();
  // Free mode: one request when the Rewards page opens. No background polling.
  loadWinners();
})();

const DRAW_API = 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/totz-rewards-draw';
const drawStatuses = new Map();
let drawBusy = false;

function drawMessage(action, raffleId, ts) {
  return [
    'TOTZ Rewards Admin',
    `Action: ${action}`,
    `Wallet: ${wallet}`,
    `Raffle ID: ${raffleId}`,
    `Chain ID: ${CHAIN_ID}`,
    `Contract: ${CONTRACT}`,
    `Timestamp: ${ts}`
  ].join('\n');
}

async function drawApi(body, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(DRAW_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function loadDrawStatuses() {
  if (!raffles?.length) {
    drawStatuses.clear();
    decorateDrawControls();
    return;
  }
  try {
    const data = await drawApi({ action: 'statuses', raffleIds: raffles.map((r) => r.id) });
    drawStatuses.clear();
    for (const status of data.statuses || []) drawStatuses.set(status.id, status);
    decorateDrawControls();
  } catch (_) {
    decorateDrawControls();
  }
}

function winnerPanel(status) {
  const winner = String(status.winner_wallet || '');
  const short = winner ? `${winner.slice(0, 8)}…${winner.slice(-6)}` : '';
  return `
    <div class="draw-winner-panel">
      <div class="draw-winner-label">🏆 WINNER</div>
      <div class="draw-winner-wallet" title="${escapeHtml(winner)}">${escapeHtml(short)}</div>
      <div class="draw-proof">Ticket #${Number(status.winning_ticket || 0).toLocaleString()} of ${Number(status.draw_total_entries || 0).toLocaleString()} · Block #${Number(status.draw_block_number || 0).toLocaleString()}</div>
      <button type="button" class="draw-copy btn sky">COPY WALLET</button>
    </div>`;
}

function decorateDrawControls() {
  const cards = [...document.querySelectorAll('#raffleList .raffle')];
  cards.forEach((card, index) => {
    const raffle = raffles[index];
    if (!raffle) return;
    card.querySelector('.draw-zone')?.remove();

    const status = drawStatuses.get(raffle.id) || {};
    const entries = Number(raffle.totalEntries || 0);
    const zone = document.createElement('div');
    zone.className = 'draw-zone';

    if (status.winner_wallet) {
      zone.innerHTML = winnerPanel(status);
      zone.querySelector('.draw-copy')?.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(status.winner_wallet);
          showStatus('Winner wallet copied.', 'ok');
        } catch (_) {
          showStatus(status.winner_wallet, 'ok');
        }
      });
    } else if (entries > 0 && status.draw_block_number) {
      zone.innerHTML = `
        <div class="draw-locked">
          <div><b>🎲 DRAW LOCKED</b><span>Entries are frozen · Future block #${Number(status.draw_block_number).toLocaleString()}</span></div>
          <button type="button" class="btn dark finalize-draw-btn">FINALIZE DRAW</button>
        </div>`;
      zone.querySelector('.finalize-draw-btn').onclick = () => finalizeRaffleDraw(raffle);
    } else if (entries > 0) {
      zone.innerHTML = `
        <div class="draw-ready">
          <span>Ready to pick 1 winner from ${entries.toLocaleString()} entr${entries === 1 ? 'y' : 'ies'}.</span>
          <button type="button" class="btn draw-btn">START DRAW</button>
        </div>`;
      zone.querySelector('.draw-btn').onclick = () => startRaffleDraw(raffle);
    } else {
      zone.innerHTML = '<div class="draw-empty">Winner draw becomes available after the raffle gets at least 1 entry.</div>';
    }
    card.appendChild(zone);
  });
}

async function startRaffleDraw(raffle) {
  if (!wallet || busy || drawBusy) return;
  const entries = Number(raffle.totalEntries || 0);
  if (!entries) return showStatus('This raffle has no entries yet.', 'error');
  if (!window.confirm(`Start winner draw for “${raffle.title}”?\n\nThis will PAUSE the raffle and permanently LOCK the current ${entries} entries. The winner will be based on a future Robinhood Chain block so the result cannot be known before the draw is locked.`)) return;

  drawBusy = true;
  try {
    const ts = Date.now();
    showStatus('Sign to lock entries and start the verifiable winner draw.');
    const signature = await sign(drawMessage('start_draw', raffle.id, ts));
    const result = await drawApi({ action: 'start_draw', wallet, raffleId: raffle.id, timestamp: ts, signature }, 20000);
    raffle.active = false;
    drawStatuses.set(raffle.id, {
      id: raffle.id,
      draw_block_number: result.drawBlockNumber,
      draw_total_entries: result.totalEntries,
      draw_requested_at: new Date().toISOString()
    });
    renderRaffles();
    showStatus(`Draw locked. Future block #${Number(result.drawBlockNumber).toLocaleString()} will determine the winner. Click FINALIZE DRAW in a moment.`, 'ok');
  } catch (e) {
    showStatus(e.message || 'Could not start the draw.', 'error');
  } finally {
    drawBusy = false;
    loadDrawStatuses();
  }
}

async function finalizeRaffleDraw(raffle) {
  if (!wallet || busy || drawBusy) return;
  drawBusy = true;
  try {
    const ts = Date.now();
    showStatus('Sign to finalize the winner from the locked future block.');
    const signature = await sign(drawMessage('finalize_draw', raffle.id, ts));
    const result = await drawApi({ action: 'finalize_draw', wallet, raffleId: raffle.id, timestamp: ts, signature }, 20000);
    drawStatuses.set(raffle.id, {
      id: raffle.id,
      winner_wallet: result.winnerWallet,
      winning_ticket: result.winningTicket,
      draw_total_entries: result.totalEntries,
      draw_block_number: result.drawBlockNumber,
      draw_block_hash: result.drawBlockHash,
      drawn_at: result.drawnAt
    });
    renderRaffles();
    showStatus(`🏆 Winner: ${result.winnerWallet} · Ticket #${result.winningTicket}`, 'ok');
  } catch (e) {
    showStatus(e.message || 'Could not finalize the draw.', 'error');
  } finally {
    drawBusy = false;
    loadDrawStatuses();
  }
}

(() => {
  const style = document.createElement('style');
  style.textContent = `
    .draw-zone{border-top:1px dashed var(--sky2);margin-top:14px;padding-top:14px}
    .draw-ready,.draw-locked{display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--cream);border-radius:14px;padding:11px 12px;font-size:.8rem;font-weight:800}
    .draw-ready .draw-btn{background:var(--lime);color:var(--ink);padding:8px 13px;font-size:.78rem}
    .draw-locked{background:#f2ecff}.draw-locked div{display:flex;flex-direction:column;gap:2px}.draw-locked span{color:var(--soft);font-size:.72rem}.draw-locked .btn{padding:8px 13px;font-size:.78rem;white-space:nowrap}
    .draw-winner-panel{background:#eef6c9;border:2px solid var(--lime);border-radius:16px;padding:13px;text-align:center}
    .draw-winner-label{font-size:.72rem;font-weight:1000;letter-spacing:.08em;color:var(--soft)}
    .draw-winner-wallet{font-family:monospace;font-size:1rem;font-weight:900;margin:5px 0;color:var(--ink)}
    .draw-proof{font-size:.72rem;font-weight:800;color:var(--soft);margin-bottom:9px}
    .draw-winner-panel .btn{padding:7px 11px;font-size:.72rem}
    .draw-empty{font-size:.76rem;font-weight:800;color:var(--soft);background:var(--cream);border-radius:12px;padding:10px}
    @media(max-width:600px){.draw-ready,.draw-locked{align-items:stretch;flex-direction:column}.draw-ready .btn,.draw-locked .btn{width:100%}}
  `;
  document.head.appendChild(style);

  const baseRenderRaffles = renderRaffles;
  renderRaffles = function() {
    baseRenderRaffles();
    queueMicrotask(decorateDrawControls);
  };

  loadDrawStatuses();
  setInterval(() => {
    if (wallet && !drawBusy && document.visibilityState === 'visible') loadDrawStatuses();
  }, 20000);
})();

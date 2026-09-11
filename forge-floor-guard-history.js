(() => {
  if (window.__TOTZ_FORGE_SCAN_HISTORY_ACTIVE__) return;
  window.__TOTZ_FORGE_SCAN_HISTORY_ACTIVE__ = true;

  const VISIBLE_SCANS = 3;
  let expanded = false;
  let scheduled = false;

  function installStyles() {
    if (document.querySelector('style[data-forge-scan-history]')) return;
    const style = document.createElement('style');
    style.dataset.forgeScanHistory = '1';
    style.textContent = `
      .scan-history-controls{display:flex;align-items:center;justify-content:space-between;gap:9px;margin:0 0 9px;padding:7px 8px;border-radius:13px;background:var(--purple,#F1ECF7);color:var(--soft,#6A607B);font-size:.57rem;font-weight:900}
      .scan-history-toggle{border:2px solid var(--ink,#2B2140);border-radius:999px;padding:6px 9px;background:#fff;color:var(--ink,#2B2140);font:900 .56rem 'Nunito',sans-serif;cursor:pointer;white-space:nowrap}
      .scan-history-toggle[hidden]{display:none!important}
      @media(max-width:650px){.scan-history-controls{align-items:flex-start;flex-direction:column}.scan-history-toggle{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function ensureControls(history) {
    let controls = document.getElementById('scanHistoryControls');
    if (controls) return controls;
    controls = document.createElement('div');
    controls.id = 'scanHistoryControls';
    controls.className = 'scan-history-controls';
    controls.innerHTML = '<span id="scanHistoryMeta">Latest scans</span><button id="scanHistoryToggle" class="scan-history-toggle" type="button" hidden>VIEW HISTORY</button>';
    history.insertAdjacentElement('beforebegin', controls);
    document.getElementById('scanHistoryToggle')?.addEventListener('click', () => {
      expanded = !expanded;
      sync();
    });
    return controls;
  }

  function sync() {
    scheduled = false;
    const history = document.getElementById('scanHistory');
    if (!history) return;
    installStyles();
    ensureControls(history);

    const rows = Array.from(history.children).filter((node) => node.classList?.contains('scan-row'));
    const total = rows.length;
    if (total <= VISIBLE_SCANS) expanded = false;

    rows.forEach((row, index) => {
      row.style.display = (!expanded && index >= VISIBLE_SCANS) ? 'none' : '';
    });

    const shown = expanded ? total : Math.min(total, VISIBLE_SCANS);
    const meta = document.getElementById('scanHistoryMeta');
    const toggle = document.getElementById('scanHistoryToggle');
    if (meta) meta.textContent = total ? `Showing ${shown} of ${total} security scans` : 'No stored security scans yet';
    if (toggle) {
      toggle.hidden = total <= VISIBLE_SCANS;
      toggle.textContent = expanded ? 'SHOW LATEST 3' : `VIEW HISTORY ${total}`;
    }
  }

  function scheduleSync() {
    if (scheduled) return;
    scheduled = true;
    const run = () => sync();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  function start() {
    scheduleSync();
    const history = document.getElementById('scanHistory');
    if (history) new MutationObserver(scheduleSync).observe(history, { childList:true });
    const root = document.getElementById('ownerWorkspace') || document.body;
    if (root) new MutationObserver(() => {
      const current = document.getElementById('scanHistory');
      if (!current || current.dataset.historyObserved === '1') return scheduleSync();
      current.dataset.historyObserved = '1';
      new MutationObserver(scheduleSync).observe(current, { childList:true });
      scheduleSync();
    }).observe(root, { childList:true, subtree:true });
    if (history) history.dataset.historyObserved = '1';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
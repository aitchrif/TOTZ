(() => {
  const PAGE_SIZE = 100;
  let cachedRows = [];
  let visible = PAGE_SIZE;
  let internal = false;

  function installStyle() {
    if (document.getElementById('forge-performance-style')) return;
    const style = document.createElement('style');
    style.id = 'forge-performance-style';
    style.textContent = `
      .table-wrap,.epochs-table-wrap{
        max-height:min(560px,68vh)!important;
        overflow:auto!important;
        overscroll-behavior:contain;
        scrollbar-gutter:stable;
        position:relative;
      }
      .holders-table th,.epochs-table th{position:sticky!important;top:0!important;z-index:3!important}
      .holders-table tr,.epochs-table tr{content-visibility:auto;contain-intrinsic-size:50px}
      .forge-table-more td{background:#fffaf0!important;text-align:center!important;padding:14px!important}
      .forge-load-more{border:0;border-radius:999px;background:var(--ink,#2B2140);color:#fff;padding:9px 16px;font-family:'Baloo 2',cursive;font-weight:800;cursor:pointer}
      .forge-table-note{display:block;margin-top:6px;color:var(--soft,#5B5270);font-size:.63rem;font-weight:800}
      @media(max-width:760px){.table-wrap,.epochs-table-wrap{max-height:480px!important}}
    `;
    document.head.appendChild(style);
  }

  function normalizeRows(tbody) {
    if (internal || !tbody) return;
    const rows = [...tbody.querySelectorAll(':scope > tr')];
    if (!rows.length) return;

    const dataRows = rows.filter((row) => !row.querySelector('.empty-row'));
    const terminal = rows.find((row) => row.querySelector('.empty-row')) || null;
    if (dataRows.length <= PAGE_SIZE) {
      cachedRows = dataRows.map((row) => row.outerHTML);
      visible = dataRows.length;
      return;
    }

    cachedRows = dataRows.map((row) => row.outerHTML);
    visible = PAGE_SIZE;
    render(tbody, terminal?.outerHTML || '');
  }

  function render(tbody, terminalHtml = '') {
    if (!tbody) return;
    internal = true;
    const shown = Math.min(visible, cachedRows.length);
    const hasMore = shown < cachedRows.length;
    const more = hasMore
      ? `<tr class="forge-table-more"><td colspan="5"><button type="button" class="forge-load-more" id="forgeLoadMoreRows">LOAD ${Math.min(PAGE_SIZE, cachedRows.length - shown)} MORE</button><span class="forge-table-note">Showing ${shown} of ${cachedRows.length} rows on screen. Search, Copy Wallets and CSV still use the full filtered holder set.</span></td></tr>`
      : (terminalHtml || '');
    tbody.innerHTML = cachedRows.slice(0, shown).join('') + more;
    internal = false;
  }

  function installHolderTable() {
    const tbody = document.getElementById('holderRows');
    if (!tbody || tbody.dataset.performanceReady === '1') return;
    tbody.dataset.performanceReady = '1';

    const observer = new MutationObserver(() => {
      if (internal) return;
      requestAnimationFrame(() => normalizeRows(tbody));
    });
    observer.observe(tbody, { childList: true });
    normalizeRows(tbody);

    tbody.addEventListener('click', (event) => {
      const button = event.target.closest('#forgeLoadMoreRows');
      if (!button) return;
      const wrap = tbody.closest('.table-wrap');
      const previousTop = wrap?.scrollTop || 0;
      visible += PAGE_SIZE;
      render(tbody);
      if (wrap) wrap.scrollTop = previousTop;
    });

    for (const id of ['holderSearch','minHoldings','customMin']) {
      document.getElementById(id)?.addEventListener('input', () => { visible = PAGE_SIZE; });
      document.getElementById(id)?.addEventListener('change', () => { visible = PAGE_SIZE; });
    }
  }

  function installEpochTable() {
    const wrap = document.querySelector('.epochs-table-wrap');
    if (!wrap) return;
    wrap.style.maxHeight = '560px';
  }

  installStyle();
  installHolderTable();
  installEpochTable();

  const observer = new MutationObserver(() => {
    installHolderTable();
    installEpochTable();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();

(() => {
  const pathname = (location.pathname || '/').replace(/\/+$/, '') || '/';
  const page = (pathname.split('/').pop() || '').replace(/\.html$/i, '').toLowerCase();
  const isXray = pathname === '/forge' || page === 'forge';
  if (!isXray || window.__FORGE_TABLE_PAGINATION__) return;
  window.__FORGE_TABLE_PAGINATION__ = true;

  const PAGE_SIZE = 50;
  let pageIndex = 0;
  let scheduled = false;

  function parseCount() {
    const text = document.getElementById('resultCountTag')?.textContent || '';
    const digits = text.replace(/[^0-9]/g, '');
    return digits ? Number(digits) : 0;
  }

  function installStyle() {
    if (document.getElementById('forge-table-pagination-style')) return;
    const style = document.createElement('style');
    style.id = 'forge-table-pagination-style';
    style.textContent = `
      .forge-table-pager{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 12px;margin-top:9px;background:var(--cream,#FFF3DC);border:1px solid rgba(43,33,64,.08);border-radius:15px;color:var(--soft,#5B5270);font-size:.68rem;font-weight:900}
      .forge-table-pager[hidden]{display:none!important}
      .forge-table-pager-info{min-width:0;line-height:1.35}.forge-table-pager-info b{color:var(--ink,#2B2140)}
      .forge-table-pager-actions{display:flex;align-items:center;gap:7px;flex:0 0 auto}
      .forge-table-page-label{min-width:74px;text-align:center;color:var(--ink,#2B2140)}
      .forge-table-page-btn{border:0;border-radius:999px;padding:7px 11px;background:var(--ink,#2B2140);color:#fff;font:900 .65rem 'Nunito',sans-serif;cursor:pointer}
      .forge-table-page-btn:disabled{opacity:.3;cursor:not-allowed}
      @media(max-width:620px){.forge-table-pager{align-items:stretch;flex-direction:column}.forge-table-pager-actions{justify-content:space-between}.forge-table-page-btn{padding:8px 13px}}
    `;
    document.head.appendChild(style);
  }

  function ensurePager() {
    const tableWrap = document.querySelector('.table-wrap');
    if (!tableWrap) return null;
    let pager = document.getElementById('forgeTablePager');
    if (pager) return pager;
    pager = document.createElement('div');
    pager.id = 'forgeTablePager';
    pager.className = 'forge-table-pager';
    pager.hidden = true;
    pager.innerHTML = `
      <div class="forge-table-pager-info" id="forgeTablePagerInfo"></div>
      <div class="forge-table-pager-actions">
        <button class="forge-table-page-btn" id="forgeTablePrev" type="button">← PREV</button>
        <span class="forge-table-page-label" id="forgeTablePageLabel">PAGE 1 / 1</span>
        <button class="forge-table-page-btn" id="forgeTableNext" type="button">NEXT →</button>
      </div>`;
    tableWrap.insertAdjacentElement('afterend', pager);
    document.getElementById('forgeTablePrev')?.addEventListener('click', () => {
      if (pageIndex <= 0) return;
      pageIndex -= 1;
      render(false);
      tableWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    document.getElementById('forgeTableNext')?.addEventListener('click', () => {
      pageIndex += 1;
      render(false);
      tableWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    return pager;
  }

  function render(reset = false) {
    const body = document.getElementById('holderRows');
    const pager = ensurePager();
    if (!body || !pager) return;
    if (reset) pageIndex = 0;

    const allRows = Array.from(body.querySelectorAll('tr'));
    const dataRows = allRows.filter((row) => row.querySelector('.rank-badge'));
    const noteRows = allRows.filter((row) => !row.querySelector('.rank-badge'));
    const matching = parseCount() || dataRows.length;

    if (!dataRows.length) {
      noteRows.forEach((row) => { row.style.display = ''; });
      pager.hidden = true;
      return;
    }

    noteRows.forEach((row) => { row.style.display = 'none'; });
    const pageCount = Math.max(1, Math.ceil(dataRows.length / PAGE_SIZE));
    pageIndex = Math.max(0, Math.min(pageIndex, pageCount - 1));
    const start = pageIndex * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, dataRows.length);

    dataRows.forEach((row, index) => {
      row.style.display = index >= start && index < end ? '' : 'none';
    });

    const info = document.getElementById('forgeTablePagerInfo');
    const label = document.getElementById('forgeTablePageLabel');
    const prev = document.getElementById('forgeTablePrev');
    const next = document.getElementById('forgeTableNext');
    if (info) {
      const extra = matching > dataRows.length
        ? ` · browsing top ${dataRows.length.toLocaleString()} · copy/export includes all ${matching.toLocaleString()}`
        : ' · copy/export includes the full filtered set';
      info.innerHTML = `<b>${(start + 1).toLocaleString()}–${end.toLocaleString()}</b> of ${matching.toLocaleString()} matching wallets${extra}`;
    }
    if (label) label.textContent = `PAGE ${pageIndex + 1} / ${pageCount}`;
    if (prev) prev.disabled = pageIndex === 0;
    if (next) next.disabled = pageIndex >= pageCount - 1;
    pager.hidden = dataRows.length <= PAGE_SIZE && matching <= PAGE_SIZE;
  }

  function schedule(reset = true) {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      render(reset);
    });
  }

  function boot() {
    installStyle();
    ensurePager();
    const body = document.getElementById('holderRows');
    if (!body) return;
    new MutationObserver(() => schedule(true)).observe(body, { childList: true });
    schedule(true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
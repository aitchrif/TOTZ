(() => {
  const isAddress = (v) => /^0x[a-fA-F0-9]{40}$/.test(String(v || ''));

  function destination() {
    const params = new URLSearchParams(location.search);
    const chain = params.get('chain');
    const contract = params.get('contract');
    const out = new URLSearchParams();
    if (chain) out.set('chain', chain);
    if (isAddress(contract)) out.set('contract', contract.toLowerCase());
    const qs = out.toString();
    return `/forge-epochs${qs ? `?${qs}` : ''}`;
  }

  function installStyle() {
    if (document.getElementById('forge-tools-nav-style')) return;
    const style = document.createElement('style');
    style.id = 'forge-tools-nav-style';
    style.textContent = `
      .forge-tool-nav{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:4px auto 8px;padding:7px;background:rgba(255,255,255,.66);backdrop-filter:blur(8px);border:1px solid rgba(43,33,64,.08);border-radius:999px;width:max-content;max-width:100%;box-shadow:0 8px 22px rgba(43,33,64,.06)}
      .forge-tool-nav a,.forge-tool-nav span{display:inline-flex;align-items:center;gap:6px;padding:9px 13px;border-radius:999px;font-size:.7rem;font-weight:900;white-space:nowrap}
      .forge-tool-nav a{cursor:pointer}.forge-tool-nav .active{background:var(--ink,#2B2140);color:#fff}.forge-tool-nav .live{background:var(--lime,#CBDB2A);color:var(--ink,#2B2140)}.forge-tool-nav .soon{background:var(--cream,#FFF3DC);color:var(--soft,#5B5270);opacity:.72}
      .module.forge-link-card{cursor:pointer;position:relative;border-style:solid!important;background:linear-gradient(145deg,#fff,#fff8ea)!important;transition:.16s ease}
      .module.forge-link-card:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(43,33,64,.09)}
      .forge-module-live{position:absolute;right:11px;top:10px;padding:5px 8px;border-radius:999px;background:var(--lime,#CBDB2A);font-size:.54rem;font-weight:900;letter-spacing:.04em}
      @media(max-width:680px){.forge-tool-nav{width:100%;border-radius:20px}.forge-tool-nav a,.forge-tool-nav span{flex:1;justify-content:center;padding:9px 8px;font-size:.64rem}.forge-tool-nav .soon{display:none}}
    `;
    document.head.appendChild(style);
  }

  function installTopNav() {
    if (document.querySelector('.forge-tool-nav')) return;
    const scanner = document.querySelector('.scanner');
    if (!scanner) return;
    const nav = document.createElement('div');
    nav.className = 'forge-tool-nav';
    nav.setAttribute('aria-label', 'FORGE tools');
    nav.innerHTML = `
      <a class="active" href="/forge">◉ X-RAY</a>
      <a class="live" id="forgeEpochsNav" href="${destination()}">⚒ EPOCHS</a>
      <span class="soon">🛡 WL CLEANER · SOON</span>
      <span class="soon">✅ GTD CHECK · SOON</span>`;
    scanner.insertAdjacentElement('beforebegin', nav);
  }

  function installEpochCard() {
    const modules = [...document.querySelectorAll('.module')];
    const card = modules.find((m) => /EPOCHS/i.test(m.querySelector('b')?.textContent || ''));
    if (!card || card.dataset.linkReady === '1') return;
    card.dataset.linkReady = '1';
    card.classList.add('forge-link-card');
    card.setAttribute('role', 'link');
    card.setAttribute('tabindex', '0');
    const copy = card.querySelector('span');
    if (copy) copy.textContent = 'Build exact holder reward allocations in a dedicated workspace.';
    const badge = document.createElement('em');
    badge.className = 'forge-module-live';
    badge.textContent = 'OPEN TOOL';
    card.appendChild(badge);
    const go = () => { location.href = destination(); };
    card.addEventListener('click', go);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
  }

  function refreshEpochLinks() {
    const href = destination();
    const top = document.getElementById('forgeEpochsNav');
    if (top) top.href = href;
  }

  installStyle();
  installTopNav();
  installEpochCard();
  window.addEventListener('popstate', refreshEpochLinks);
  const input = document.getElementById('contractInput');
  input?.addEventListener('input', () => setTimeout(refreshEpochLinks, 0));
  document.querySelectorAll('.network-btn').forEach((btn) => btn.addEventListener('click', () => setTimeout(refreshEpochLinks, 0)));
})();
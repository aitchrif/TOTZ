(() => {
  const CHAINS = new Set(['robinhood', 'ink', 'ethereum']);
  const isAddress = (value) => /^0x[a-fA-F0-9]{40}$/.test(String(value || ''));
  let syncing = false;

  function context() {
    const params = new URLSearchParams(location.search);
    const activeNetwork = document.querySelector('.network-btn.active')?.dataset?.chain;
    const chainCandidate = activeNetwork || params.get('chain');
    const chain = CHAINS.has(chainCandidate) ? chainCandidate : null;
    const inputContract = document.getElementById('contractInput')?.value?.trim()?.toLowerCase();
    const queryContract = params.get('contract')?.toLowerCase();
    const contract = isAddress(inputContract) ? inputContract : (isAddress(queryContract) ? queryContract : null);
    return { chain, contract };
  }

  function withContext(path) {
    const current = context();
    const params = new URLSearchParams();
    if (current.chain) params.set('chain', current.chain);
    if (current.contract) params.set('contract', current.contract);
    const query = params.toString();
    return `${path}${query ? `?${query}` : ''}`;
  }

  function toolLinks(kind) {
    const selectors = {
      xray: '[data-forge-nav="xray"], .tool-nav a[href^="/forge"]',
      epochs: '[data-forge-nav="epochs"], .tool-nav a[href^="/forge-epochs"], .tool-nav a[href^="/forge/epochs"]',
      myEpochs: '[data-forge-nav="my-epochs"], .tool-nav a[href^="/forge-my-epochs"], .tool-nav a[href^="/forge/my-epochs"]'
    };
    return [...document.querySelectorAll(selectors[kind] || '')].filter((link) => {
      const href = link.getAttribute('href') || '';
      if (kind === 'xray') return /^\/forge(?:\?|$)/.test(href);
      if (kind === 'epochs') return href.startsWith('/forge-epochs') || href.startsWith('/forge/epochs');
      return href.startsWith('/forge-my-epochs') || href.startsWith('/forge/my-epochs');
    });
  }

  function installEpochCard() {
    const modules = [...document.querySelectorAll('.module')];
    const card = modules.find((module) => /EPOCHS/i.test(module.querySelector('b')?.textContent || ''));
    if (!card || card.dataset.forgeEpochReady === '1') return;
    card.dataset.forgeEpochReady = '1';
    card.setAttribute('role', 'link');
    card.setAttribute('tabindex', '0');
    card.style.cursor = 'pointer';
    card.style.borderStyle = 'solid';
    const copy = card.querySelector('span');
    if (copy) copy.textContent = 'Build exact holder reward allocations from a pinned snapshot. Live now.';
    const open = () => { location.href = withContext('/forge/epochs'); };
    card.addEventListener('click', open);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
  }

  function normalizeLegacyRoutes() {
    document.querySelectorAll('a[href]').forEach((link) => {
      const href = link.getAttribute('href') || '';
      if (/^\/forge-epochs(?:[?#]|$)/.test(href)) {
        link.setAttribute('href', href.replace('/forge-epochs', '/forge/epochs'));
      } else if (/^\/forge-my-epochs(?:[?#]|$)/.test(href)) {
        link.setAttribute('href', href.replace('/forge-my-epochs', '/forge/my-epochs'));
      } else if (/^\/forge-claim-launcher(?:[?#]|$)/.test(href)) {
        link.setAttribute('href', href.replace('/forge-claim-launcher', '/forge/claim-launcher'));
      } else if (/^\/forge-claim(?:[?#]|$)/.test(href)) {
        link.setAttribute('href', href.replace('/forge-claim', '/forge/claim'));
      }
    });
  }

  function normalizeRuntimeCopy() {
    const env = window.TOTZ_FORGE_CONFIG?.environment;
    if (env !== 'mainnet') return;

    document.querySelectorAll('.hero p').forEach((paragraph) => {
      if (/Robinhood Chain Testnet/i.test(paragraph.textContent || '')) {
        paragraph.textContent = (paragraph.textContent || '').replace(/Robinhood Chain Testnet/gi, 'Robinhood Chain Mainnet');
      }
    });

    document.querySelectorAll('a[href^="/forge/claim-launcher"],a[href^="/forge-claim-launcher"]').forEach((link) => {
      if (/TESTNET CLAIM/i.test(link.textContent || '')) link.textContent = 'NEXT: OPEN OPERATOR LAUNCHER →';
      link.setAttribute('href', '/forge/claim-launcher');
    });

    const note = document.querySelector('.contract-note');
    if (note && /Testnet Claim Launcher|Mainnet deployment remains intentionally disabled/i.test(note.textContent || '')) {
      note.innerHTML = '<b>Next step:</b> export the verified Claim JSON and open the operator Claim Launcher. Production Mainnet deploy/fund/publish stays fail-closed until an explicit controlled release is armed.';
    }
  }

  function normalizeEpochNetworkCards() {
    const row = document.querySelector('.workspace .network-row');
    if (!row) return;

    const queryChain = new URLSearchParams(location.search).get('chain');
    const currentChain = row.querySelector('.network-btn.active')?.dataset?.chain;
    const selected = CHAINS.has(currentChain) ? currentChain : (CHAINS.has(queryChain) ? queryChain : 'robinhood');

    if (row.dataset.xrayParity !== '1' || row.querySelector('img') || row.children.length !== 3) {
      row.id = 'networkRow';
      row.dataset.xrayParity = '1';
      row.innerHTML = `
        <button class="network-btn" data-chain="robinhood" type="button"><span class="network-icon">RH</span><span><b>Robinhood Chain</b><span>Chain ID 4663</span></span></button>
        <button class="network-btn" data-chain="ink" type="button"><span class="network-icon">INK</span><span><b>Ink</b><span>Chain ID 57073</span></span></button>
        <button class="network-btn" data-chain="ethereum" type="button"><span class="network-icon">Ξ</span><span><b>Ethereum</b><span>Chain ID 1</span></span></button>
      `;
    }

    row.querySelectorAll('.network-btn').forEach((button) => {
      button.classList.toggle('active', button.dataset.chain === selected);
    });
  }

  function normalizeEpochShell() {
    if (!document.querySelector('.workspace .network-row')) return false;
    document.body.classList.add('epochs-xray-shell');

    const homeLink = document.querySelector('nav .nav-actions a.pill');
    if (homeLink) {
      if (homeLink.getAttribute('href') !== '/') homeLink.setAttribute('href', '/');
      if (homeLink.textContent !== 'HOME') homeLink.textContent = 'HOME';
      if (!homeLink.classList.contains('home-pill')) homeLink.classList.add('home-pill');
    }

    document.querySelectorAll('.tool-nav').forEach((nav) => {
      nav.setAttribute('aria-label', 'FORGE tools');
      if (nav.dataset.xrayShell !== '1' || nav.children.length !== 3) {
        nav.dataset.xrayShell = '1';
        nav.innerHTML = '<a class="live" id="xrayNav" href="/forge">◉ X-RAY</a><a class="active" href="/forge/epochs">⚒ EPOCHS</a><a href="/forge/my-epochs">◫ MY EPOCHS</a>';
      }
    });
    return true;
  }

  function normalizeToolNav() {
    const isEpochs = normalizeEpochShell();
    if (!isEpochs) {
      document.querySelectorAll('.tool-nav').forEach((nav) => {
        nav.setAttribute('aria-label', 'FORGE tools');
        const labels = [...nav.children].map((node) => node.textContent.trim().toUpperCase());
        if (!labels.some((label) => label.includes('WL CLEANER'))) {
          const item = document.createElement('span');
          item.className = 'soon';
          item.textContent = '🛡 WL CLEANER · SOON';
          nav.appendChild(item);
        }
        if (!labels.some((label) => label.includes('GTD CHECK'))) {
          const item = document.createElement('span');
          item.className = 'soon';
          item.textContent = '✅ GTD CHECK · SOON';
          nav.appendChild(item);
        }
        const env = window.TOTZ_FORGE_CONFIG?.environment;
        if (env === 'testnet' && !nav.querySelector('[data-forge-environment]')) {
          const badge = document.createElement('span');
          badge.dataset.forgeEnvironment = 'testnet';
          badge.className = 'forge-env-badge';
          badge.textContent = '🧪 TESTNET';
          badge.title = 'Claim deployment is restricted to Robinhood Chain Testnet';
          nav.appendChild(badge);
        }
        if (env === 'mainnet' && !nav.querySelector('[data-forge-environment]')) {
          const badge = document.createElement('span');
          badge.dataset.forgeEnvironment = 'mainnet';
          badge.className = 'forge-env-badge mainnet';
          badge.textContent = '⛓ MAINNET READ';
          badge.title = 'Production reads Robinhood Chain Mainnet. New claim writes remain release-gated.';
          nav.appendChild(badge);
        }
      });
    }

    if (!document.getElementById('forge-nav-runtime-style')) {
      const style = document.createElement('style');
      style.id = 'forge-nav-runtime-style';
      style.textContent = `
        .tool-nav .forge-env-badge{background:#F4E8FF;color:#603B82;border:1px solid rgba(96,59,130,.12)}
        .tool-nav .forge-env-badge.mainnet{background:#E7F4EF;color:#2B5B49;border-color:rgba(43,91,73,.12)}

        /* Exact X-RAY shell for EPOCHS above the fold. */
        .epochs-xray-shell .wrap{max-width:1190px!important;padding:0 4.5vw 84px!important}
        .epochs-xray-shell nav{gap:16px!important;padding:20px 0!important}
        .epochs-xray-shell .nav-actions{gap:9px!important;flex-wrap:wrap!important;justify-content:flex-end!important}
        .epochs-xray-shell .pill{font-size:.78rem!important}
        .epochs-xray-shell .tool-nav{gap:8px!important;margin:6px auto 0!important;padding:7px!important;border-radius:999px!important;width:max-content!important;max-width:100%!important}
        .epochs-xray-shell .tool-nav a{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;padding:9px 13px!important;border-radius:999px!important;font-size:.69rem!important;font-weight:900!important}
        .epochs-xray-shell .hero{padding:42px 0 22px!important}
        .epochs-xray-shell .eyebrow{display:inline-flex!important;align-items:center!important;gap:7px!important;padding:7px 14px!important;font-size:.74rem!important;letter-spacing:.07em!important;text-transform:uppercase!important}
        .epochs-xray-shell .hero h1{font-size:clamp(2.55rem,6.5vw,5.6rem)!important;line-height:.91!important;margin:18px auto 14px!important;max-width:970px!important}
        .epochs-xray-shell .hero p{max-width:790px!important;font-size:1.04rem!important;line-height:1.58!important}
        .epochs-xray-shell .safety{gap:8px!important;margin-top:17px!important}
        .epochs-xray-shell .safe{display:inline-flex!important;align-items:center!important;gap:7px!important;padding:8px 12px!important;font-size:.76rem!important}
        .epochs-xray-shell .workspace{gap:13px!important}
        .epochs-xray-shell .workspace>.card.blue:first-child{border-radius:30px!important;padding:24px!important;box-shadow:var(--shadow)!important}
        .epochs-xray-shell .workspace>.card.blue:first-child .card-head{gap:18px!important;margin-bottom:16px!important}
        .epochs-xray-shell .workspace>.card.blue:first-child .card-head h2{font-size:1.68rem!important}
        .epochs-xray-shell .workspace>.card.blue:first-child .card-head p{font-size:.9rem!important;line-height:1.45!important}
        .epochs-xray-shell .workspace>.card.blue:first-child .tag{font-size:.65rem!important}
        .epochs-xray-shell .source-form input{padding:13px 17px!important}
        .epochs-xray-shell .source-form input:focus{border-color:var(--coral)!important}
        .epochs-xray-shell .access{border-radius:25px!important;padding:19px 20px!important;box-shadow:var(--shadow-sm)!important}
        .epochs-xray-shell .access h3{font-size:1.28rem!important}
        .epochs-xray-shell .access p{font-size:.76rem!important;line-height:1.4!important}
        .epochs-xray-shell .access-state{min-width:185px!important;text-align:center!important;background:rgba(255,255,255,.09)!important;border:1px solid rgba(255,255,255,.12)!important;border-radius:17px!important;padding:12px!important}
        .epochs-xray-shell .access-state b{font-family:'Baloo 2',cursive!important;font-size:.96rem!important}
        .epochs-xray-shell .access-state span{font-size:.63rem!important;font-weight:900!important;margin-top:3px!important}

        /* Exact copy of the X-RAY selector visual system. */
        .workspace .network-label{display:block;margin:18px 0 8px;color:var(--soft);font-size:.65rem;font-weight:900;letter-spacing:.07em;text-transform:uppercase}
        .workspace .network-row{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
        .workspace .network-btn{border:2px solid transparent!important;border-radius:17px!important;background:var(--cream)!important;padding:11px 13px!important;cursor:pointer;text-align:left;display:flex!important;align-items:center!important;gap:10px!important;transition:.15s ease;color:var(--ink)!important;min-height:0!important;box-shadow:none}
        .workspace .network-btn:hover{transform:translateY(-1px);box-shadow:var(--shadow-sm)}
        .workspace .network-btn.active{background:#fff!important;border-color:var(--ink)!important;box-shadow:0 5px 0 rgba(43,33,64,.1)!important}
        .workspace .network-btn::before,.workspace .network-btn::after{content:none!important;display:none!important}
        .workspace .network-icon{width:34px!important;height:34px!important;flex:0 0 34px!important;border-radius:11px!important;display:grid!important;place-items:center!important;background:#fff!important;font-family:'Baloo 2',cursive!important;font-size:.83rem!important;font-weight:900!important;border:1px solid rgba(43,33,64,.08)!important;color:var(--ink)!important;line-height:1!important;margin:0!important;padding:0!important;box-shadow:none!important}
        .workspace .network-btn.active .network-icon{background:var(--ink)!important;color:#fff!important}
        .workspace .network-btn b{display:block;font-size:.82rem;line-height:normal}
        .workspace .network-btn span{display:block;color:var(--soft);font-size:.64rem;font-weight:800;margin-top:1px;line-height:normal}
        .workspace .network-btn .network-icon + span{margin-top:0}

        @media(max-width:760px){
          .epochs-xray-shell .tool-nav{width:100%!important;border-radius:20px!important}
          .epochs-xray-shell .tool-nav a{flex:1!important;padding:9px 8px!important;font-size:.62rem!important}
          .epochs-xray-shell .hero{padding-top:26px!important}
        }
        @media(max-width:650px){
          .tool-nav .forge-env-badge{display:none}
          .workspace .network-row{grid-template-columns:1fr}
          .epochs-xray-shell .access{align-items:flex-start!important;flex-direction:column!important}
          .epochs-xray-shell .access-state{width:100%!important;text-align:left!important}
        }
      `;
      document.head.appendChild(style);
    }
  }

  function removeLegacyInjectedNav() {
    document.querySelectorAll('.forge-tool-nav').forEach((nav) => nav.remove());
  }

  function sync() {
    if (syncing) return;
    syncing = true;
    try {
      removeLegacyInjectedNav();
      normalizeLegacyRoutes();
      normalizeRuntimeCopy();
      normalizeEpochNetworkCards();
      normalizeToolNav();
      toolLinks('xray').forEach((link) => { link.href = withContext('/forge'); });
      toolLinks('epochs').forEach((link) => { link.href = withContext('/forge/epochs'); });
      toolLinks('myEpochs').forEach((link) => { link.href = '/forge/my-epochs'; });
      installEpochCard();
    } finally {
      syncing = false;
    }
  }

  document.addEventListener('input', (event) => {
    if (event.target?.id === 'contractInput') queueMicrotask(sync);
  });
  document.addEventListener('click', (event) => {
    if (event.target?.closest?.('.network-btn')) setTimeout(sync, 0);
  });
  window.addEventListener('popstate', sync);

  const observer = new MutationObserver(() => queueMicrotask(sync));
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });

  sync();
})();

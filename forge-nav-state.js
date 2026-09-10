(() => {
  const CHAINS = new Set(['robinhood', 'ink', 'ethereum']);
  const isAddress = (value) => /^0x[a-fA-F0-9]{40}$/.test(String(value || ''));
  let syncing = false;
  let syncScheduled = false;

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
      if (/^\/forge-epochs(?:[?#]|$)/.test(href)) link.setAttribute('href', href.replace('/forge-epochs', '/forge/epochs'));
      else if (/^\/forge-my-epochs(?:[?#]|$)/.test(href)) link.setAttribute('href', href.replace('/forge-my-epochs', '/forge/my-epochs'));
      else if (/^\/forge-claim-launcher(?:[?#]|$)/.test(href)) link.setAttribute('href', href.replace('/forge-claim-launcher', '/forge/claim-launcher'));
      else if (/^\/forge-claim(?:[?#]|$)/.test(href)) link.setAttribute('href', href.replace('/forge-claim', '/forge/claim'));
    });
  }

  function normalizeRuntimeCopy() {
    if (window.TOTZ_FORGE_CONFIG?.environment !== 'mainnet') return;
    document.querySelectorAll('.hero p').forEach((paragraph) => {
      if (/Robinhood Chain Testnet/i.test(paragraph.textContent || '')) {
        paragraph.textContent = (paragraph.textContent || '').replace(/Robinhood Chain Testnet/gi, 'Robinhood Chain Mainnet');
      }
    });
    document.querySelectorAll('a[href^="/forge/claim-launcher"],a[href^="/forge-claim-launcher"]').forEach((link) => {
      if (/TESTNET CLAIM/i.test(link.textContent || '')) link.textContent = 'NEXT: OPEN OPERATOR LAUNCHER →';
      if (link.getAttribute('href') !== '/forge/claim-launcher') link.setAttribute('href', '/forge/claim-launcher');
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
    if (!document.body.classList.contains('epochs-xray-shell')) document.body.classList.add('epochs-xray-shell');

    const homeLink = document.querySelector('nav .nav-actions a.pill');
    if (homeLink) {
      if (homeLink.getAttribute('href') !== '/') homeLink.setAttribute('href', '/');
      if (homeLink.textContent !== 'HOME') homeLink.textContent = 'HOME';
      if (!homeLink.classList.contains('home-pill')) homeLink.classList.add('home-pill');
    }

    document.querySelectorAll('.tool-nav').forEach((nav) => {
      if (nav.getAttribute('aria-label') !== 'FORGE tools') nav.setAttribute('aria-label', 'FORGE tools');
      if (nav.dataset.xrayShell !== '1' || nav.children.length !== 3) {
        nav.dataset.xrayShell = '1';
        nav.innerHTML = '<a class="live" id="xrayNav" href="/forge">◉ X-RAY</a><a class="active" href="/forge/epochs">⚒ EPOCHS</a><a href="/forge/my-epochs">◫ MY EPOCHS</a>';
      }
    });
    return true;
  }

  function installRuntimeStyle() {
    if (document.getElementById('forge-nav-runtime-style')) return;
    const style = document.createElement('style');
    style.id = 'forge-nav-runtime-style';
    style.textContent = `
      .tool-nav .forge-env-badge{background:#F4E8FF;color:#603B82;border:1px solid rgba(96,59,130,.12)}
      .tool-nav .forge-env-badge.mainnet{background:#E7F4EF;color:#2B5B49;border-color:rgba(43,91,73,.12)}
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
      @media(max-width:650px){.tool-nav .forge-env-badge{display:none}.workspace .network-row{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function normalizeToolNav() {
    const isEpochs = normalizeEpochShell();
    if (!isEpochs) {
      document.querySelectorAll('.tool-nav').forEach((nav) => {
        if (nav.getAttribute('aria-label') !== 'FORGE tools') nav.setAttribute('aria-label', 'FORGE tools');
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
        if (!nav.querySelector('[data-forge-environment]') && (env === 'testnet' || env === 'mainnet')) {
          const badge = document.createElement('span');
          badge.dataset.forgeEnvironment = env;
          badge.className = env === 'mainnet' ? 'forge-env-badge mainnet' : 'forge-env-badge';
          badge.textContent = env === 'mainnet' ? '⛓ MAINNET READ' : '🧪 TESTNET';
          badge.title = env === 'mainnet'
            ? 'Production reads Robinhood Chain Mainnet. New claim writes remain release-gated.'
            : 'Claim deployment is restricted to Robinhood Chain Testnet';
          nav.appendChild(badge);
        }
      });
    }
    installRuntimeStyle();
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
      toolLinks('xray').forEach((link) => {
        const next = withContext('/forge');
        if (link.getAttribute('href') !== next) link.setAttribute('href', next);
      });
      toolLinks('epochs').forEach((link) => {
        const next = withContext('/forge/epochs');
        if (link.getAttribute('href') !== next) link.setAttribute('href', next);
      });
      toolLinks('myEpochs').forEach((link) => {
        if (link.getAttribute('href') !== '/forge/my-epochs') link.setAttribute('href', '/forge/my-epochs');
      });
      installEpochCard();
    } finally {
      syncing = false;
    }
  }

  // Never run nav normalization in a microtask loop. requestAnimationFrame gives
  // the browser a paint boundary and coalesces bursts from app/wallet DOM changes.
  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    const run = () => {
      syncScheduled = false;
      sync();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  document.addEventListener('input', (event) => {
    if (event.target?.id === 'contractInput') scheduleSync();
  });
  document.addEventListener('click', (event) => {
    if (event.target?.closest?.('.network-btn')) scheduleSync();
  });
  window.addEventListener('popstate', scheduleSync);

  // Child-list only: class churn from EPOCHS state or injected wallet extensions
  // must never keep the global observer hot and starve first paint.
  const root = document.body || document.documentElement;
  if (root) {
    const observer = new MutationObserver(() => scheduleSync());
    observer.observe(root, { subtree: true, childList: true });
  }

  sync();
})();
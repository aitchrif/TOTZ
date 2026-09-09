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

      /* Stable X-RAY selector geometry. */
      .workspace .network-label{display:block;margin:18px 0 8px;color:var(--soft);font-size:.65rem;font-weight:900;letter-spacing:.07em;text-transform:uppercase}
      .workspace .network-row{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
      .workspace .network-btn{border:1.5px solid rgba(43,33,64,.08)!important;border-radius:18px!important;background:#FFF5E3!important;padding:12px 14px!important;cursor:pointer;text-align:left;display:flex!important;align-items:center!important;gap:11px!important;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease,background .16s ease;color:var(--ink)!important;min-height:68px!important;box-shadow:none}
      .workspace .network-btn:hover{transform:translateY(-2px);box-shadow:0 9px 20px rgba(43,33,64,.09)}
      .workspace .network-btn.active{background:#fff!important;border-color:var(--ink)!important;box-shadow:0 5px 0 rgba(43,33,64,.10),0 12px 24px rgba(43,33,64,.07)!important}
      .workspace .network-btn::before,.workspace .network-btn::after{content:none!important;display:none!important}
      .workspace .network-icon{width:40px!important;height:40px!important;flex:0 0 40px!important;border-radius:13px!important;display:grid!important;place-items:center!important;background:#fff!important;font-family:'Baloo 2',cursive!important;font-size:.83rem!important;font-weight:900!important;border:1px solid rgba(43,33,64,.08)!important;color:var(--ink)!important;line-height:1!important;margin:0!important;padding:0!important;box-shadow:0 4px 10px rgba(43,33,64,.06)!important;overflow:hidden}
      .workspace .network-btn b{display:block;font-size:.84rem;line-height:1.15;letter-spacing:-.01em}
      .workspace .network-btn span{display:block;color:var(--soft);font-size:.63rem;font-weight:800;margin-top:3px;line-height:1.2}
      .workspace .network-btn .network-icon + span{margin-top:0}

      /* Network marks: keep DOM text stable for handlers/tests, replace only presentation. */
      .workspace .network-btn[data-chain="robinhood"] .network-icon{font-size:0!important;background:#CCFF00!important;color:#000!important;border-color:rgba(0,0,0,.08)!important}
      .workspace .network-btn[data-chain="robinhood"] .network-icon::before{content:'🪶';font-size:19px;line-height:1;filter:saturate(.7) contrast(1.05)}
      .workspace .network-btn[data-chain="ink"] .network-icon{font-size:0!important;background:#fff url('https://docs.inkonchain.com/images/brand-kit/docs-logo-symbol.png') center/contain no-repeat!important;border-color:rgba(113,50,245,.16)!important}
      .workspace .network-btn[data-chain="ethereum"] .network-icon{font-size:0!important;background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 417'%3E%3Cpath fill='%236f66a8' d='M127.9 0 125 9.8v275.7l2.9 2.9 127.9-75.6z'/%3E%3Cpath fill='%238c8c8c' d='M127.9 0 0 212.8l127.9 75.6V154.1z'/%3E%3Cpath fill='%235f5f5f' d='m127.9 312.7-1.6 1.9v98.2l1.6 4.7L256 236.7z'/%3E%3Cpath fill='%238c8c8c' d='M127.9 417.5V312.7L0 236.7z'/%3E%3C/svg%3E") center/16px 27px no-repeat!important}

      /* EPOCHS polish: richer hierarchy without changing runtime behaviour. */
      .epochs-xray-shell{background:
        radial-gradient(circle at 12% 4%,rgba(255,255,255,.52),transparent 29%),
        radial-gradient(circle at 88% 14%,rgba(191,230,238,.24),transparent 24%),
        var(--cream)!important;min-height:100vh}
      .epochs-xray-shell .wrap{max-width:1210px!important;padding:0 4.5vw 88px!important}
      .epochs-xray-shell nav{padding:22px 0 18px!important}
      .epochs-xray-shell .logo{font-size:1.72rem!important;letter-spacing:-.035em!important;gap:11px!important}
      .epochs-xray-shell .logo .dot{width:13px!important;height:13px!important;box-shadow:0 0 0 5px rgba(255,113,95,.10)!important}
      .epochs-xray-shell .nav-actions{gap:9px!important}
      .epochs-xray-shell .pill{padding:9px 15px!important;transition:transform .15s ease,box-shadow .15s ease!important}
      .epochs-xray-shell .pill:hover{transform:translateY(-1px)!important;box-shadow:0 7px 15px rgba(43,33,64,.08)!important}
      .epochs-xray-shell .pill.dark{box-shadow:0 5px 0 rgba(43,33,64,.12)!important}

      .epochs-xray-shell .tool-nav{background:rgba(255,255,255,.82)!important;border:1px solid rgba(43,33,64,.07)!important;box-shadow:0 10px 24px rgba(43,33,64,.08)!important;backdrop-filter:blur(10px);padding:6px!important;gap:6px!important}
      .epochs-xray-shell .tool-nav a{min-height:34px!important;padding:8px 14px!important;transition:transform .14s ease,box-shadow .14s ease!important}
      .epochs-xray-shell .tool-nav a:hover{transform:translateY(-1px)!important}
      .epochs-xray-shell .tool-nav .active{box-shadow:0 5px 11px rgba(43,33,64,.16)!important}

      .epochs-xray-shell .hero{padding:38px 0 26px!important}
      .epochs-xray-shell .eyebrow{padding:8px 15px!important;border:1px solid rgba(43,33,64,.06)!important;box-shadow:0 7px 16px rgba(43,33,64,.05)!important}
      .epochs-xray-shell .hero h1{font-size:clamp(3rem,6.25vw,5.55rem)!important;max-width:1020px!important;margin:18px auto 14px!important;line-height:.91!important}
      .epochs-xray-shell .hero p{max-width:800px!important;font-size:1.02rem!important;line-height:1.56!important}
      .epochs-xray-shell .safety{gap:9px!important;margin-top:18px!important}
      .epochs-xray-shell .safe{padding:8px 12px!important;border:1px solid rgba(43,33,64,.045)!important;box-shadow:0 7px 16px rgba(43,33,64,.055)!important}

      .epochs-xray-shell .workspace{gap:14px!important}
      .epochs-xray-shell .workspace>.card{border:1px solid rgba(43,33,64,.055)!important;box-shadow:0 14px 34px rgba(43,33,64,.08)!important}
      .epochs-xray-shell .workspace>.card.blue:first-child{border:2px solid var(--sky2)!important;border-radius:30px!important;padding:25px 26px 24px!important;background:rgba(255,255,255,.96)!important;box-shadow:0 16px 40px rgba(43,33,64,.09)!important}
      .epochs-xray-shell .workspace>.card.blue:first-child .card-head{margin-bottom:17px!important}
      .epochs-xray-shell .workspace>.card.blue:first-child .card-head h2{font-size:1.72rem!important;letter-spacing:-.025em!important}
      .epochs-xray-shell .workspace>.card.blue:first-child .card-head p{font-size:.84rem!important;max-width:720px!important}
      .epochs-xray-shell .workspace>.card.blue:first-child .tag{background:#DDF4F7!important;padding:7px 10px!important;border:1px solid rgba(43,33,64,.04)!important}

      .epochs-xray-shell .source-form{gap:12px!important;margin-top:14px!important}
      .epochs-xray-shell .source-form input{min-height:52px!important;padding:13px 18px!important;background:#FFF8EA!important;border-width:2px!important;transition:border-color .15s ease,box-shadow .15s ease,background .15s ease!important}
      .epochs-xray-shell .source-form input:focus{background:#fff!important;border-color:var(--coral)!important;box-shadow:0 0 0 4px rgba(255,113,95,.10)!important}
      .epochs-xray-shell .source-form .btn{min-height:52px!important;padding-left:22px!important;padding-right:22px!important}
      .epochs-xray-shell .btn{transition:transform .15s ease,box-shadow .15s ease!important}
      .epochs-xray-shell .btn:not(:disabled):hover{transform:translateY(-1px)!important}
      .epochs-xray-shell .btn.primary:not(:disabled):hover{box-shadow:0 8px 0 var(--coral2),0 10px 18px rgba(233,80,61,.14)!important}

      .epochs-xray-shell .access{border-radius:26px!important;padding:18px 19px!important;box-shadow:0 13px 28px rgba(43,33,64,.10)!important;border:1px solid rgba(255,255,255,.08)!important}
      .epochs-xray-shell .access.unlocked{background:linear-gradient(135deg,#2F492B,#456039)!important;border-color:rgba(203,219,42,.18)!important}
      .epochs-xray-shell .access h3{font-size:1.25rem!important;letter-spacing:-.015em!important}
      .epochs-xray-shell .access p{font-size:.72rem!important;max-width:720px!important}
      .epochs-xray-shell .access-state{min-width:205px!important;padding:12px 14px!important;background:rgba(255,255,255,.10)!important;border:1px solid rgba(255,255,255,.12)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.07)!important}
      .epochs-xray-shell .access.unlocked .access-state{background:rgba(255,255,255,.12)!important}
      .epochs-xray-shell .access.unlocked .access-state b::before{content:'● ';color:var(--lime);font-size:.72em}

      .epochs-xray-shell .workspace>.card:not(.blue){border-radius:28px!important;padding:23px 24px!important;background:rgba(255,255,255,.96)!important}
      .epochs-xray-shell .workspace>.card:not(.blue) .card-head h2{font-size:1.62rem!important;letter-spacing:-.02em!important}
      .epochs-xray-shell .box{border-color:rgba(43,33,64,.07)!important;border-radius:22px!important;background:#FFFCF7!important;padding:17px!important}
      .epochs-xray-shell .box h3{font-size:1.1rem!important}
      .epochs-xray-shell .field input,.epochs-xray-shell .field select,.epochs-xray-shell .field textarea{background:#FFF8EA!important;border-color:#9DDCE8!important;transition:border-color .15s ease,box-shadow .15s ease,background .15s ease!important}
      .epochs-xray-shell .field input:focus,.epochs-xray-shell .field select:focus,.epochs-xray-shell .field textarea:focus{background:#fff!important;border-color:var(--coral)!important;box-shadow:0 0 0 4px rgba(255,113,95,.08)!important}
      .epochs-xray-shell .lock-note{border:1px dashed rgba(43,33,64,.12)!important}
      .epochs-xray-shell .result-stat,.epochs-xray-shell .merkle-stat{border:1px solid rgba(43,33,64,.045)!important}
      .epochs-xray-shell .table-wrap{box-shadow:inset 0 0 0 1px rgba(255,255,255,.45)!important}

      @media(max-width:760px){
        .epochs-xray-shell .hero{padding-top:26px!important}
        .epochs-xray-shell .hero h1{font-size:clamp(2.65rem,12vw,4.6rem)!important}
        .epochs-xray-shell .workspace>.card.blue:first-child{padding:20px!important}
      }
      @media(max-width:650px){
        .tool-nav .forge-env-badge{display:none}
        .workspace .network-row{grid-template-columns:1fr}
        .epochs-xray-shell .network-btn{min-height:64px!important}
        .epochs-xray-shell .access{align-items:flex-start!important;flex-direction:column!important}
        .epochs-xray-shell .access-state{width:100%!important;text-align:left!important;min-width:0!important}
        .epochs-xray-shell .workspace>.card:not(.blue){padding:19px!important}
      }
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

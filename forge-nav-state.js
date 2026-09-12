(() => {
  const CHAINS = new Set(['robinhood', 'ink', 'ethereum']);
  const isAddress = (value) => /^0x[a-fA-F0-9]{40}$/.test(String(value || ''));
  let syncing = false;
  let syncScheduled = false;

  function normalizedPath() {
    return String(location.pathname || '/').replace(/\.html$/i, '').replace(/\/+$/, '') || '/';
  }

  function activeTool() {
    const path = normalizedPath();
    const params = new URLSearchParams(location.search);
    if (path === '/forge') {
      if (params.get('tool') === 'xray' || params.has('chain') || params.has('contract')) return 'xray';
      return null;
    }
    if (path === '/forge/epochs' || path === '/forge-epochs') return 'epochs';
    if (path === '/forge/my-epochs' || path === '/forge-my-epochs') return 'my-epochs';
    if (path === '/forge/floor-guard' || path === '/forge-floor-guard') return 'floor-guard';
    return null;
  }

  function isForgeHub() {
    return normalizedPath() === '/forge' && activeTool() === null;
  }

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

  function withContext(path, extras = {}) {
    const current = context();
    const params = new URLSearchParams();
    Object.entries(extras).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') params.set(key, String(value));
    });
    if (current.chain) params.set('chain', current.chain);
    if (current.contract) params.set('contract', current.contract);
    const query = params.toString();
    return `${path}${query ? `?${query}` : ''}`;
  }

  function toolLinks(kind) {
    const selectors = {
      xray: '[data-forge-nav="xray"], .tool-nav a[href="/forge"], .tool-nav a[href^="/forge?"]',
      epochs: '[data-forge-nav="epochs"], .tool-nav a[href^="/forge-epochs"], .tool-nav a[href^="/forge/epochs"]',
      myEpochs: '[data-forge-nav="my-epochs"], .tool-nav a[href^="/forge-my-epochs"], .tool-nav a[href^="/forge/my-epochs"]',
      floorGuard: '[data-forge-nav="floor-guard"], .tool-nav a[href^="/forge/floor-guard"]'
    };
    return [...document.querySelectorAll(selectors[kind] || '')].filter((link) => {
      const href = link.getAttribute('href') || '';
      if (kind === 'xray') return /^\/forge(?:\?|$)/.test(href);
      if (kind === 'epochs') return href.startsWith('/forge-epochs') || href.startsWith('/forge/epochs');
      if (kind === 'myEpochs') return href.startsWith('/forge-my-epochs') || href.startsWith('/forge/my-epochs');
      if (kind === 'floorGuard') return href.startsWith('/forge/floor-guard');
      return false;
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
      const label = String(link.textContent || '').trim();
      if (/^\/forge-epochs(?:[?#]|$)/.test(href)) {
        link.setAttribute('href', href.replace('/forge-epochs', '/forge/epochs'));
      } else if (/^\/forge-my-epochs(?:[?#]|$)/.test(href)) {
        link.setAttribute('href', href.replace('/forge-my-epochs', '/forge/my-epochs'));
      } else if (/^\/forge-claim-launcher(?:[?#]|$)/.test(href)) {
        link.setAttribute('href', href.replace('/forge-claim-launcher', '/forge/claim-launcher'));
      } else if (/^\/forge-claim(?:[?#]|$)/.test(href)) {
        link.setAttribute('href', href.replace('/forge-claim', '/forge/claim'));
      } else if (/^\/forge\/(?:wl-cleaner|gtd-check)(?:[?#]|$)/.test(href)) {
        link.setAttribute('href', '/forge/floor-guard');
      } else if (href === '/forge' && /X-RAY/i.test(label)) {
        link.setAttribute('href', '/forge?tool=xray');
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
      if (link.getAttribute('href') !== '/forge/claim-launcher') link.setAttribute('href', '/forge/claim-launcher');
    });

    const note = document.querySelector('.contract-note');
    if (note && /Testnet Claim Launcher|Mainnet deployment remains intentionally disabled/i.test(note.textContent || '')) {
      note.innerHTML = '<b>Next step:</b> export the verified Claim JSON and open the operator Claim Launcher. Production Mainnet deploy/fund/publish stays fail-closed until an explicit controlled release is armed.';
    }
  }

  function ensureToolLink(nav, { key, href, label }) {
    let link = nav.querySelector(`[data-forge-nav="${key}"]`) || nav.querySelector(`a[href^="${href}"]`);
    if (!link && key === 'xray') link = nav.querySelector('a[href="/forge"],a[href^="/forge?"]');
    if (!link) {
      link = document.createElement('a');
      const badge = nav.querySelector('[data-forge-environment]');
      nav.insertBefore(link, badge || null);
    }
    link.dataset.forgeNav = key;
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
    if (link.textContent !== label) link.textContent = label;
    link.classList.remove('live');
    link.classList.toggle('active', activeTool() === key);
    return link;
  }

  function ensureEnvironmentBadge(nav) {
    const env = window.TOTZ_FORGE_CONFIG?.environment;
    let badge = nav.querySelector('[data-forge-environment]');
    if (!env) return;
    if (!badge) {
      badge = document.createElement('span');
      badge.dataset.forgeEnvironment = env;
      badge.className = 'forge-env-badge';
      nav.appendChild(badge);
    }
    badge.dataset.forgeEnvironment = env;
    badge.className = `forge-env-badge${env === 'mainnet' ? ' mainnet' : ''}`;
    let text = '🧪 TESTNET';
    let title = 'Claim deployment is restricted to Robinhood Chain Testnet';
    if (env === 'mainnet') {
      const publicMainnet = window.TOTZ_FORGE_CONFIG?.mainnetClaimsEnabled === true;
      text = publicMainnet ? '⛓ MAINNET LIVE' : '⛓ MAINNET READ';
      title = publicMainnet
        ? 'Robinhood Chain Mainnet is live. New claim launches remain subject to server-side policy and operator signatures.'
        : 'Production reads Robinhood Chain Mainnet. New claim writes remain release-gated.';
    }
    if (badge.textContent !== text) badge.textContent = text;
    if (badge.title !== title) badge.title = title;
  }

  function normalizeToolNav() {
    document.querySelectorAll('.tool-nav').forEach((nav) => {
      if (nav.getAttribute('aria-label') !== 'FORGE tools') nav.setAttribute('aria-label', 'FORGE tools');
      nav.querySelectorAll('.soon,[data-forge-nav="wl-cleaner"],[data-forge-nav="gtd-check"],a[href^="/forge/wl-cleaner"],a[href^="/forge/gtd-check"]').forEach((item) => item.remove());
      ensureToolLink(nav, { key: 'xray', href: '/forge?tool=xray', label: '◉ X-RAY' });
      ensureToolLink(nav, { key: 'epochs', href: '/forge/epochs', label: '⚒ EPOCHS' });
      ensureToolLink(nav, { key: 'my-epochs', href: '/forge/my-epochs', label: '◫ MY EPOCHS' });
      ensureToolLink(nav, { key: 'floor-guard', href: '/forge/floor-guard', label: '⚠ FLOOR GUARD' });
      ensureEnvironmentBadge(nav);
    });

    if (!document.getElementById('forge-nav-runtime-style')) {
      const style = document.createElement('style');
      style.id = 'forge-nav-runtime-style';
      style.textContent = `
        .tool-nav{
          display:inline-flex!important;
          align-items:center!important;
          justify-content:center!important;
          gap:4px!important;
          width:max-content!important;
          max-width:calc(100% - 24px)!important;
          margin-left:auto!important;
          margin-right:auto!important;
          padding:5px!important;
          background:rgba(255,255,255,.94)!important;
          border:1px solid rgba(43,33,64,.08)!important;
          border-radius:999px!important;
          box-shadow:0 9px 24px rgba(43,33,64,.10)!important;
          backdrop-filter:blur(14px);
          -webkit-backdrop-filter:blur(14px);
          flex-wrap:nowrap!important;
        }
        .tool-nav>a,
        .tool-nav .forge-env-badge{
          display:inline-flex!important;
          align-items:center!important;
          justify-content:center!important;
          box-sizing:border-box!important;
          min-height:34px!important;
          padding:0 12px!important;
          border-radius:999px!important;
          font-family:'Nunito',sans-serif!important;
          font-size:.68rem!important;
          font-weight:900!important;
          line-height:1!important;
          letter-spacing:.01em!important;
          white-space:nowrap!important;
        }
        .tool-nav>a{
          --forge-tab-accent:#2B2140;
          --forge-tab-tint:#F4F1F7;
          position:relative!important;
          overflow:hidden!important;
          color:#2B2140!important;
          background:transparent!important;
          border:1px solid transparent!important;
          box-shadow:none!important;
          transition:background .14s ease,color .14s ease,transform .14s ease!important;
        }
        .tool-nav>a[data-forge-nav="xray"]{--forge-tab-accent:#FF715F;--forge-tab-tint:#FFF0EC}
        .tool-nav>a[data-forge-nav="epochs"]{--forge-tab-accent:#CBDB2A;--forge-tab-tint:#F4F7C9}
        .tool-nav>a[data-forge-nav="my-epochs"]{--forge-tab-accent:#8ED2E2;--forge-tab-tint:#E8F6F8}
        .tool-nav>a[data-forge-nav="floor-guard"]{--forge-tab-accent:#2B2140;--forge-tab-tint:#F1ECF7}
        .tool-nav>a:hover{
          background:#FFF8EA!important;
          transform:translateY(-1px);
        }
        .tool-nav>a.active{
          background:var(--forge-tab-tint)!important;
          color:#2B2140!important;
          border-color:rgba(43,33,64,.06)!important;
        }
        .tool-nav>a.active::after{
          content:'';
          position:absolute;
          left:12px;
          right:12px;
          bottom:2px;
          height:3px;
          border-radius:999px;
          background:var(--forge-tab-accent);
        }
        .tool-nav .forge-env-badge{
          margin-left:7px!important;
          padding-left:14px!important;
          padding-right:14px!important;
          border:1px solid rgba(96,59,130,.12)!important;
          background:#F4E8FF!important;
          color:#603B82!important;
          box-shadow:inset 0 0 0 1px rgba(255,255,255,.45)!important;
        }
        .tool-nav .forge-env-badge.mainnet{
          background:linear-gradient(180deg,#F0FAF6 0%,#E2F2EB 100%)!important;
          color:#245743!important;
          border-color:rgba(36,87,67,.16)!important;
        }
        html[data-forge-hub="true"] .totz-top-accent,
        html[data-forge-active-tool] .totz-top-accent{
          position:relative!important;
          background:rgba(43,33,64,.08)!important;
          overflow:hidden!important;
        }
        html[data-forge-hub="true"] .totz-top-accent::after,
        html[data-forge-active-tool] .totz-top-accent::after{
          content:'';
          position:absolute;
          top:0;
          bottom:0;
          width:25%;
          border-radius:0 999px 999px 0;
          transform:translateX(-110%);
          transition:transform .18s ease,background .18s ease;
        }
        html[data-forge-active-tool="xray"] .totz-top-accent::after{left:0;background:#FF715F;transform:none}
        html[data-forge-active-tool="epochs"] .totz-top-accent::after{left:25%;background:#CBDB2A;transform:none;border-radius:999px}
        html[data-forge-active-tool="my-epochs"] .totz-top-accent::after{left:50%;background:#8ED2E2;transform:none;border-radius:999px}
        html[data-forge-active-tool="floor-guard"] .totz-top-accent::after{left:75%;background:#2B2140;transform:none;border-radius:999px 0 0 999px}

        html[data-forge-hub="true"] .wrap>.hero,
        html[data-forge-hub="true"] .wrap>.scanner,
        html[data-forge-hub="true"] .wrap>#dashboard,
        html[data-forge-hub="true"] .wrap>.footer{display:none!important}
        .forge-hub-shell{max-width:1040px;margin:46px auto 16px;padding:0 0 28px;text-align:center}
        .forge-hub-kicker{display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:999px;background:#CBDB2A;color:#2B2140;font-size:.7rem;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
        .forge-hub-shell h1{max-width:800px;margin:17px auto 10px;font-family:'Baloo 2',cursive;font-size:clamp(2.75rem,6vw,5.3rem);line-height:.92;letter-spacing:-.045em}
        .forge-hub-shell h1 span{color:#E9503D}
        .forge-hub-intro{max-width:720px;margin:0 auto;color:#5B5270;font-size:1rem;font-weight:800;line-height:1.55}
        .forge-hub-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:30px;text-align:left}
        .forge-hub-card{--hub-accent:#2B2140;--hub-tint:#F4F1F7;position:relative;display:flex;flex-direction:column;min-height:230px;padding:23px;border:1px solid rgba(43,33,64,.08);border-radius:26px;background:#fff;color:#2B2140;box-shadow:0 12px 30px rgba(43,33,64,.09);overflow:hidden;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}
        .forge-hub-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:6px;background:var(--hub-accent)}
        .forge-hub-card:hover{transform:translateY(-3px);box-shadow:0 18px 38px rgba(43,33,64,.13);border-color:rgba(43,33,64,.15)}
        .forge-hub-card[data-tool="xray"]{--hub-accent:#FF715F;--hub-tint:#FFF0EC}
        .forge-hub-card[data-tool="epochs"]{--hub-accent:#CBDB2A;--hub-tint:#F4F7C9}
        .forge-hub-card[data-tool="my-epochs"]{--hub-accent:#8ED2E2;--hub-tint:#E8F6F8}
        .forge-hub-card[data-tool="floor-guard"]{--hub-accent:#2B2140;--hub-tint:#F1ECF7}
        .forge-hub-icon{width:46px;height:46px;display:grid;place-items:center;border-radius:15px;background:var(--hub-tint);font-size:1.25rem;font-weight:900}
        .forge-hub-card h2{margin:15px 0 4px;font-family:'Baloo 2',cursive;font-size:1.55rem;line-height:1}
        .forge-hub-card p{margin:0;color:#5B5270;font-size:.82rem;font-weight:800;line-height:1.48}
        .forge-hub-open{display:inline-flex;align-items:center;gap:6px;width:max-content;margin-top:auto;padding-top:18px;color:#2B2140;font-size:.72rem;font-weight:900}
        .forge-hub-open::after{content:'→';font-size:1rem;transition:transform .14s ease}
        .forge-hub-card:hover .forge-hub-open::after{transform:translateX(3px)}
        .forge-hub-footnote{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:18px;color:#5B5270;font-size:.68rem;font-weight:900}
        .forge-hub-footnote span{padding:7px 10px;border-radius:999px;background:rgba(255,255,255,.75);border:1px solid rgba(43,33,64,.06)}
        @media(max-width:700px){
          .forge-hub-shell{margin-top:30px}
          .forge-hub-grid{grid-template-columns:1fr;gap:11px;margin-top:24px}
          .forge-hub-card{min-height:205px;padding:20px}
          .forge-hub-intro{font-size:.9rem}
        }
        @media(max-width:650px){
          .tool-nav{
            width:calc(100% - 16px)!important;
            max-width:calc(100% - 16px)!important;
            justify-content:flex-start!important;
            overflow-x:auto!important;
            scrollbar-width:none;
          }
          .tool-nav::-webkit-scrollbar{display:none}
          .tool-nav>a,.tool-nav .forge-env-badge{
            min-height:32px!important;
            padding:0 10px!important;
            font-size:.62rem!important;
          }
          .tool-nav .forge-env-badge{margin-left:4px!important}
        }
      `;
      document.head.appendChild(style);
    }
  }

  function installForgeHub() {
    const root = document.documentElement;
    if (!root) return;
    const hub = isForgeHub();
    root.dataset.forgeHub = hub ? 'true' : 'false';
    if (!hub) {
      document.querySelector('.forge-hub-shell')?.remove();
      return;
    }
    if (document.querySelector('.forge-hub-shell')) return;

    const shell = document.createElement('section');
    shell.className = 'forge-hub-shell';
    shell.setAttribute('aria-labelledby', 'forgeHubTitle');
    shell.innerHTML = `
      <span class="forge-hub-kicker">⚒ TOTZ FORGE · TOOL HUB</span>
      <h1 id="forgeHubTitle">CHOOSE YOUR <span>TOOL.</span></h1>
      <p class="forge-hub-intro">Four focused tools for holder intelligence, reward infrastructure, epoch tracking and collection security. Start with the job you need to do.</p>
      <div class="forge-hub-grid">
        <a class="forge-hub-card" data-tool="xray" href="/forge?tool=xray">
          <span class="forge-hub-icon">◉</span>
          <h2>X-RAY</h2>
          <p>Scan ERC-721 ownership, holder distribution, concentration and individual wallet positions from pinned on-chain data.</p>
          <span class="forge-hub-open">OPEN X-RAY</span>
        </a>
        <a class="forge-hub-card" data-tool="epochs" href="/forge/epochs">
          <span class="forge-hub-icon">⚒</span>
          <h2>EPOCHS</h2>
          <p>Turn a verified holder snapshot into exact reward allocations and verifiable Merkle claim packages.</p>
          <span class="forge-hub-open">OPEN EPOCHS</span>
        </a>
        <a class="forge-hub-card" data-tool="my-epochs" href="/forge/my-epochs">
          <span class="forge-hub-icon">◫</span>
          <h2>MY EPOCHS</h2>
          <p>Track published reward epochs, live claim progress, recovery-ready distributions and your operator history.</p>
          <span class="forge-hub-open">OPEN MY EPOCHS</span>
        </a>
        <a class="forge-hub-card" data-tool="floor-guard" href="/forge/floor-guard">
          <span class="forge-hub-icon">⚠</span>
          <h2>FLOOR GUARD</h2>
          <p>Review bidder activity, automation-risk signals and collection-security intelligence with an owner workspace.</p>
          <span class="forge-hub-open">OPEN FLOOR GUARD</span>
        </a>
      </div>
      <div class="forge-hub-footnote"><span>👁 Read-first by default</span><span>🔑 Operator signs every write</span><span>⛓ Robinhood Mainnet live</span></div>`;

    const nav = document.querySelector('.tool-nav');
    const parent = nav?.parentElement || document.querySelector('.wrap') || document.body;
    if (nav?.nextSibling) parent.insertBefore(shell, nav.nextSibling);
    else parent.appendChild(shell);
    document.title = 'TOTZ FORGE | Tool Hub';
  }

  function syncAccentState() {
    const root = document.documentElement;
    if (!root) return;
    const active = activeTool();
    if (active) root.dataset.forgeActiveTool = active;
    else delete root.dataset.forgeActiveTool;
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
      normalizeToolNav();
      syncAccentState();
      installForgeHub();
      toolLinks('xray').forEach((link) => {
        const next = withContext('/forge', { tool: 'xray' });
        if (link.getAttribute('href') !== next) link.setAttribute('href', next);
      });
      toolLinks('epochs').forEach((link) => {
        const next = withContext('/forge/epochs');
        if (link.getAttribute('href') !== next) link.setAttribute('href', next);
      });
      toolLinks('myEpochs').forEach((link) => {
        if (link.getAttribute('href') !== '/forge/my-epochs') link.setAttribute('href', '/forge/my-epochs');
      });
      toolLinks('floorGuard').forEach((link) => {
        if (link.getAttribute('href') !== '/forge/floor-guard') link.setAttribute('href', '/forge/floor-guard');
      });
      installEpochCard();
    } finally {
      syncing = false;
    }
  }

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

  const root = document.body || document.documentElement;
  if (root) {
    const observer = new MutationObserver(() => scheduleSync());
    observer.observe(root, { subtree: true, childList: true });
  }

  sync();
})();
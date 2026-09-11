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
    if (!link) {
      link = document.createElement('a');
      const badge = nav.querySelector('[data-forge-environment]');
      nav.insertBefore(link, badge || null);
    }
    link.dataset.forgeNav = key;
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
    if (link.textContent !== label) link.textContent = label;
    const currentPath = location.pathname.replace(/\.html$/, '');
    link.classList.toggle('active', currentPath === href);
    return link;
  }

  function normalizeToolNav() {
    document.querySelectorAll('.tool-nav').forEach((nav) => {
      if (nav.getAttribute('aria-label') !== 'FORGE tools') nav.setAttribute('aria-label', 'FORGE tools');
      nav.querySelectorAll('.soon,[data-forge-nav="wl-cleaner"],[data-forge-nav="gtd-check"],a[href^="/forge/wl-cleaner"],a[href^="/forge/gtd-check"]').forEach((item) => item.remove());
      ensureToolLink(nav, { key: 'floor-guard', href: '/forge/floor-guard', label: '⚠ FLOOR GUARD' });

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

    if (!document.getElementById('forge-nav-runtime-style')) {
      const style = document.createElement('style');
      style.id = 'forge-nav-runtime-style';
      style.textContent = `
        .tool-nav .forge-env-badge{background:#F4E8FF;color:#603B82;border:1px solid rgba(96,59,130,.12)}
        .tool-nav .forge-env-badge.mainnet{background:#E7F4EF;color:#2B5B49;border-color:rgba(43,91,73,.12)}
        @media(max-width:650px){.tool-nav .forge-env-badge{display:none}}
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
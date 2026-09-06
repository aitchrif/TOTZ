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
      epochs: '[data-forge-nav="epochs"], .tool-nav a[href^="/forge-epochs"]',
      myEpochs: '[data-forge-nav="my-epochs"], .tool-nav a[href^="/forge-my-epochs"]'
    };
    return [...document.querySelectorAll(selectors[kind] || '')].filter((link) => {
      const href = link.getAttribute('href') || '';
      if (kind === 'xray') return /^\/forge(?:\?|$)/.test(href);
      if (kind === 'epochs') return href.startsWith('/forge-epochs');
      return href.startsWith('/forge-my-epochs');
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
    const open = () => { location.href = withContext('/forge-epochs'); };
    card.addEventListener('click', open);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
  }

  function normalizeToolNav() {
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
    });

    if (!document.getElementById('forge-nav-runtime-style')) {
      const style = document.createElement('style');
      style.id = 'forge-nav-runtime-style';
      style.textContent = `
        .tool-nav .forge-env-badge{background:#F4E8FF;color:#603B82;border:1px solid rgba(96,59,130,.12)}
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
    removeLegacyInjectedNav();
    normalizeToolNav();
    toolLinks('xray').forEach((link) => { link.href = withContext('/forge'); });
    toolLinks('epochs').forEach((link) => { link.href = withContext('/forge-epochs'); });
    toolLinks('myEpochs').forEach((link) => { link.href = '/forge-my-epochs'; });
    installEpochCard();
    syncing = false;
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

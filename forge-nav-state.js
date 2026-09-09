(() => {
  const CHAINS = new Set(['robinhood', 'ink', 'ethereum']);
  const isAddress = (value) => /^0x[a-fA-F0-9]{40}$/.test(String(value || ''));
  let syncing = false;

  function ensureSharedBrand() {
    if (document.querySelector('script[src$="totz-ui-brand.js"],script[src$="/totz-ui-brand.js"]')) return;
    const script = document.createElement('script');
    script.src = '/totz-ui-brand.js';
    script.dataset.forgeSharedBrand = '1';
    document.head.appendChild(script);
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

  function normalizeEpochChainIcons() {
    const svgByChain = {
      robinhood: `
        <svg class="forge-chain-svg" viewBox="0 0 32 32" aria-hidden="true">
          <rect x="1" y="1" width="30" height="30" rx="9" fill="#C8FA00"/>
          <path d="M9.2 24.6c2.1-5.5 5.1-9.6 11.7-15.2-1.1 4.7-3.2 9.5-7 13.4-1.4 1.5-3 2.2-4.7 1.8Zm6-9.9 6.1-6.1-2.1 7.7-4 2.5v-4.1Zm-3.4 5.7 5.9-2.8-3.1 5.3-2.8 1.1v-3.6Z" fill="#111111"/>
        </svg>`,
      ink: `
        <svg class="forge-chain-svg" viewBox="0 0 32 32" aria-hidden="true">
          <rect x="1" y="1" width="30" height="30" rx="9" fill="#713CFF"/>
          <circle cx="16" cy="16" r="8.2" fill="none" stroke="#FFFFFF" stroke-width="2.6"/>
          <path d="M11.8 16h8.4M13.6 12.5h4.8M13.6 19.5h4.8" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round"/>
        </svg>`,
      ethereum: `
        <svg class="forge-chain-svg forge-chain-svg-eth" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M16 2.8 8.7 15.9 16 12.6l7.3 3.3L16 2.8Z" fill="#343434"/>
          <path d="M8.7 17.4 16 21.7l7.3-4.3L16 29.2 8.7 17.4Z" fill="#111111"/>
          <path d="m16 12.6-7.3 3.3L16 20v-7.4Z" fill="#777777"/>
          <path d="m16 12.6 7.3 3.3L16 20v-7.4Z" fill="#202020"/>
        </svg>`
    };

    document.querySelectorAll('.network-btn[data-chain] .network-icon').forEach((icon) => {
      const chain = icon.closest('.network-btn')?.dataset?.chain;
      if (!svgByChain[chain] || icon.dataset.forgeChainLogo === '1') return;
      icon.innerHTML = svgByChain[chain];
      icon.dataset.forgeChainLogo = '1';
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
        .network-icon .forge-chain-svg{display:block;width:30px;height:30px}
        .network-icon .forge-chain-svg-eth{width:23px;height:29px}
        @media(max-width:650px){.tool-nav .forge-env-badge{display:none}}
      `;
      document.head.appendChild(style);
    }
  }

  function removeLegacyInjectedNav() {
    document.querySelectorAll('.forge-tool-nav').forEach((nav) => nav.remove());
  }

  function stripEmDashCopy() {
    document.title = (document.title || '').replace(/\s*—\s*/g, ' | ');
    const root = document.body;
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const parent = node.parentElement;
      if (!parent || ['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','CODE'].includes(parent.tagName)) return;
      const text = node.nodeValue || '';
      if (text.includes('—')) node.nodeValue = text.replace(/\s*—\s*/g, ' ');
    });
  }

  function sync() {
    if (syncing) return;
    syncing = true;
    removeLegacyInjectedNav();
    normalizeLegacyRoutes();
    normalizeRuntimeCopy();
    normalizeToolNav();
    normalizeEpochChainIcons();
    stripEmDashCopy();
    toolLinks('xray').forEach((link) => { link.href = withContext('/forge'); });
    toolLinks('epochs').forEach((link) => { link.href = withContext('/forge/epochs'); });
    toolLinks('myEpochs').forEach((link) => { link.href = '/forge/my-epochs'; });
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

  ensureSharedBrand();
  sync();
})();
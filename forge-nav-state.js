(() => {
  const CHAINS = new Set(['robinhood', 'ink', 'ethereum']);
  const isAddress = (value) => /^0x[a-fA-F0-9]{40}$/.test(String(value || ''));
  let syncing = false;

  function ensureForgeShell() {
    if (!document.getElementById('forge-shared-shell-style')) {
      const style = document.createElement('style');
      style.id = 'forge-shared-shell-style';
      style.textContent = `
        .totz-top-accent{position:relative;left:50%;transform:translateX(-50%);width:100vw;height:6px;margin:0;background:linear-gradient(90deg,var(--coral,#FF715F) 0 26%,var(--lime,#CBDB2A) 26% 50%,var(--sky2,var(--sky-deep,#8ED2E2)) 50% 74%,var(--ink,#2B2140) 74% 100%);box-shadow:0 2px 0 rgba(43,33,64,.06);z-index:3}
        .totz-section-dock{position:fixed;left:20px;top:50%;transform:translateY(-50%);z-index:9998;display:flex;flex-direction:column;gap:6px;padding:8px;width:132px;box-sizing:border-box;overflow:hidden;background:rgba(255,255,255,.95);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:2px solid var(--sky2,var(--sky-deep,#8ED2E2));border-radius:22px;box-shadow:0 14px 34px rgba(43,33,64,.16)}
        .totz-section-dock::before{content:'TOTZ';display:block;text-align:center;padding:3px 4px 2px;color:var(--soft,var(--ink-soft,#5B5270));font-family:'Baloo 2',cursive;font-size:.62rem;font-weight:900;letter-spacing:.14em}
        .totz-section-dock a{position:relative;width:100%;min-width:0;min-height:43px;box-sizing:border-box;overflow:hidden;display:flex;align-items:center;justify-content:flex-start;gap:8px;padding:8px 10px;border-radius:14px;color:var(--ink,#2B2140);font-family:'Nunito',sans-serif;font-size:.68rem;font-weight:900;letter-spacing:.018em;transition:transform .14s ease,background .14s ease,color .14s ease,box-shadow .14s ease}
        .totz-section-dock a:hover{transform:translateX(2px);background:var(--cream,#FFF3DC)}
        .totz-section-dock a.active{background:var(--ink,#2B2140);color:#fff;box-shadow:0 6px 15px rgba(43,33,64,.18)}
        .totz-section-dock a.active::before{content:'';position:absolute;left:-8px;top:50%;transform:translateY(-50%);width:5px;height:22px;border-radius:999px;background:var(--coral,#FF7A66)}
        .totz-section-dock .dock-icon{width:25px;height:25px;display:grid;place-items:center;flex:0 0 25px;border-radius:9px;background:var(--cream,#FFF3DC);font-size:.9rem;line-height:1}
        .totz-section-dock a.active .dock-icon{background:rgba(255,255,255,.14)}
        .totz-section-dock .dock-label{min-width:0;white-space:nowrap;overflow:hidden;line-height:1}
        @media(max-width:1280px) and (min-width:721px){.totz-section-dock{width:56px;left:9px;padding:6px;border-radius:18px}.totz-section-dock::before{font-size:.5rem;letter-spacing:.05em}.totz-section-dock a{justify-content:center;padding:7px;min-height:42px}.totz-section-dock a.active::before{left:-7px;height:18px}.totz-section-dock .dock-label{display:none}}
        @media(max-width:720px){body{padding-bottom:72px!important}.totz-section-dock{top:auto;left:50%;bottom:10px;transform:translateX(-50%);width:auto;min-width:350px;max-width:calc(100vw - 20px);flex-direction:row;justify-content:center;padding:6px;border-radius:19px;gap:5px}.totz-section-dock::before{display:none}.totz-section-dock a{min-width:0;flex:1;min-height:41px;justify-content:center;padding:7px 8px}.totz-section-dock a.active::before{left:50%;top:auto;bottom:-7px;transform:translateX(-50%);width:28px;height:4px}.totz-section-dock .dock-label{display:inline;font-size:.59rem}}
      `;
      document.head.appendChild(style);
    }

    if (!document.querySelector('.totz-top-accent')) {
      const nav = document.querySelector('nav');
      if (nav) {
        const accent = document.createElement('div');
        accent.className = 'totz-top-accent';
        accent.setAttribute('aria-hidden', 'true');
        nav.insertAdjacentElement('afterend', accent);
      }
    }

    if (!document.querySelector('.totz-section-dock') && document.body) {
      const dock = document.createElement('div');
      dock.className = 'totz-section-dock';
      dock.setAttribute('aria-label', 'TOTZ pages');
      dock.innerHTML = `
        <a href="/" title="Home" aria-label="Home"><span class="dock-icon">🏠</span><span class="dock-label">HOME</span></a>
        <a href="/forge" class="active" title="FORGE" aria-label="FORGE"><span class="dock-icon">⚒️</span><span class="dock-label">FORGE</span></a>
        <a href="/staking" title="Staking" aria-label="Staking"><span class="dock-icon">☁️</span><span class="dock-label">STAKING</span></a>
        <a href="/rewards" title="Rewards" aria-label="Rewards"><span class="dock-icon">🎟️</span><span class="dock-label">REWARDS</span></a>`;
      document.body.appendChild(dock);
    }
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
    ensureForgeShell();
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

  ensureForgeShell();
  sync();
})();
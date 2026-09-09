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

        /* Keep EPOCHS network cards visually identical to X-RAY. */
        .workspace .network-label{display:block;margin:18px 0 8px;color:var(--soft);font-size:.65rem;font-weight:900;letter-spacing:.07em;text-transform:uppercase}
        .workspace .network-row{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
        .workspace .network-btn{border:2px solid transparent;border-radius:17px;background:var(--cream);padding:11px 13px;cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px;transition:.15s ease;color:var(--ink)}
        .workspace .network-btn:hover{transform:translateY(-1px);box-shadow:var(--shadow-sm)}
        .workspace .network-btn.active{background:#fff;border-color:var(--ink);box-shadow:0 5px 0 rgba(43,33,64,.1)}
        .workspace .network-icon{width:34px;height:34px;flex:0 0 34px;border-radius:11px;display:grid;place-items:center;background:#fff;border:1px solid rgba(43,33,64,.08);overflow:hidden}
        .workspace .network-icon img{display:block;object-fit:contain;object-position:center;margin:auto;max-width:26px;max-height:26px}
        .workspace .network-btn[data-chain="robinhood"] .network-icon img{width:26px;height:26px}
        .workspace .network-btn[data-chain="ink"] .network-icon img{width:24px;height:24px}
        .workspace .network-btn[data-chain="ethereum"] .network-icon img{width:20px;height:25px}
        .workspace .network-btn b{display:block;font-size:.82rem}
        .workspace .network-btn span{display:block;color:var(--soft);font-size:.64rem;font-weight:800;margin-top:1px}

        @media(max-width:650px){
          .tool-nav .forge-env-badge{display:none}
          .workspace .network-row{grid-template-columns:1fr}
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
    removeLegacyInjectedNav();
    normalizeLegacyRoutes();
    normalizeRuntimeCopy();
    normalizeToolNav();
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

  sync();
})();

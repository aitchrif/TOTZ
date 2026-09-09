(() => {
  const CHAINS = new Set(['robinhood','ink','ethereum']);
  const isAddress = v => /^0x[a-fA-F0-9]{40}$/.test(String(v || ''));

  const pathname = () => (location.pathname || '/').replace(/\/+$/, '') || '/';
  const isForge = () => pathname() === '/forge' || pathname().startsWith('/forge/') || /^\/forge-/.test(pathname());

  function ctx() {
    const q = new URLSearchParams(location.search);
    const active = document.querySelector('.network-btn.active')?.dataset?.chain;
    const chain = CHAINS.has(active || q.get('chain')) ? (active || q.get('chain')) : null;
    const typed = document.getElementById('contractInput')?.value?.trim()?.toLowerCase();
    const query = q.get('contract')?.toLowerCase();
    return { chain, contract: isAddress(typed) ? typed : (isAddress(query) ? query : null) };
  }

  function withCtx(path) {
    const {chain, contract} = ctx();
    const q = new URLSearchParams();
    if (chain) q.set('chain', chain);
    if (contract) q.set('contract', contract);
    return path + (q.size ? `?${q}` : '');
  }

  function ensureShell() {
    if (!isForge()) return;

    if (!document.getElementById('forge-shell-style')) {
      const s = document.createElement('style');
      s.id = 'forge-shell-style';
      s.textContent = `
        .forge-top-accent{position:relative;left:50%;transform:translateX(-50%);width:100vw;height:6px;background:linear-gradient(90deg,#ff715f 0 26%,#cbdb2a 26% 50%,#8ed2e2 50% 74%,#2b2140 74%);box-shadow:0 2px 0 rgba(43,33,64,.06);z-index:3}
        .forge-site-dock{position:fixed;left:20px;top:50%;transform:translateY(-50%);z-index:9999;width:132px;padding:8px;display:flex;flex-direction:column;gap:6px;background:rgba(255,255,255,.96);border:2px solid #8ed2e2;border-radius:22px;box-shadow:0 14px 34px rgba(43,33,64,.16);backdrop-filter:blur(14px)}
        .forge-site-dock:before{content:'TOTZ';text-align:center;padding:3px 4px 2px;color:#5b5270;font-family:'Baloo 2','Arial Rounded MT Bold','Trebuchet MS',Arial,sans-serif;font-size:.62rem;font-weight:900;letter-spacing:.14em}
        .forge-site-dock a{position:relative;min-height:43px;padding:8px 10px;display:flex;align-items:center;gap:8px;border-radius:14px;color:#2b2140;font-family:'Nunito','Trebuchet MS',Arial,sans-serif;font-size:.68rem;font-weight:900;box-sizing:border-box}
        .forge-site-dock a:hover{background:#fff3dc;transform:translateX(2px)}
        .forge-site-dock a.active{background:#2b2140;color:#fff;box-shadow:0 6px 15px rgba(43,33,64,.18)}
        .forge-site-dock .dock-icon{width:25px;height:25px;flex:0 0 25px;display:grid;place-items:center;border-radius:9px;background:#fff3dc;font-size:.9rem}
        .forge-site-dock a.active .dock-icon{background:rgba(255,255,255,.14)}
        .forge-site-dock .dock-label{white-space:nowrap;overflow:hidden}
        @media(max-width:1280px) and (min-width:721px){.forge-site-dock{left:9px;width:56px;padding:6px;border-radius:18px}.forge-site-dock:before{font-size:.5rem;letter-spacing:.05em}.forge-site-dock a{justify-content:center;padding:7px}.forge-site-dock .dock-label{display:none}}
        @media(max-width:720px){body{padding-bottom:72px!important}.forge-site-dock{top:auto;left:50%;bottom:10px;transform:translateX(-50%);width:auto;min-width:350px;max-width:calc(100vw - 20px);flex-direction:row;padding:6px;border-radius:19px}.forge-site-dock:before{display:none}.forge-site-dock a{flex:1;justify-content:center;padding:7px 8px}.forge-site-dock .dock-label{font-size:.59rem}}
      `;
      document.head.appendChild(s);
    }

    if (!document.querySelector('.forge-top-accent')) {
      const nav = document.querySelector('nav');
      if (nav) {
        const bar = document.createElement('div');
        bar.className = 'forge-top-accent';
        bar.setAttribute('aria-hidden','true');
        nav.insertAdjacentElement('afterend', bar);
      }
    }

    if (!document.querySelector('.forge-site-dock')) {
      document.querySelector('.totz-section-dock')?.remove();
      const d = document.createElement('div');
      d.className = 'forge-site-dock';
      d.setAttribute('aria-label','TOTZ pages');
      d.innerHTML = `
        <a href="/"><span class="dock-icon">🏠</span><span class="dock-label">HOME</span></a>
        <a href="/forge" class="active"><span class="dock-icon">⚒️</span><span class="dock-label">FORGE</span></a>
        <a href="/staking"><span class="dock-icon">☁️</span><span class="dock-label">STAKING</span></a>
        <a href="/rewards"><span class="dock-icon">🎟️</span><span class="dock-label">REWARDS</span></a>`;
      document.body.appendChild(d);
    }
  }

  function normalizeRoutes() {
    document.querySelectorAll('a[href]').forEach(a => {
      const h = a.getAttribute('href') || '';
      if (/^\/forge-epochs(?:[?#]|$)/.test(h)) a.setAttribute('href',h.replace('/forge-epochs','/forge/epochs'));
      else if (/^\/forge-my-epochs(?:[?#]|$)/.test(h)) a.setAttribute('href',h.replace('/forge-my-epochs','/forge/my-epochs'));
      else if (/^\/forge-claim-launcher(?:[?#]|$)/.test(h)) a.setAttribute('href',h.replace('/forge-claim-launcher','/forge/claim-launcher'));
      else if (/^\/forge-claim(?:[?#]|$)/.test(h)) a.setAttribute('href',h.replace('/forge-claim','/forge/claim'));
    });
  }

  function normalizeToolNav() {
    document.querySelectorAll('.tool-nav').forEach(nav => {
      nav.setAttribute('aria-label','FORGE tools');
      const labels = [...nav.children].map(n => n.textContent.trim().toUpperCase());
      if (!labels.some(x => x.includes('WL CLEANER'))) {
        const x = document.createElement('span'); x.className='soon'; x.textContent='🛡 WL CLEANER · SOON'; nav.appendChild(x);
      }
      if (!labels.some(x => x.includes('GTD CHECK'))) {
        const x = document.createElement('span'); x.className='soon'; x.textContent='✅ GTD CHECK · SOON'; nav.appendChild(x);
      }
      const env = window.TOTZ_FORGE_CONFIG?.environment;
      if (env && !nav.querySelector('[data-forge-environment]')) {
        const b = document.createElement('span');
        b.dataset.forgeEnvironment = env;
        b.className = `forge-env-badge ${env === 'mainnet' ? 'mainnet' : ''}`;
        b.textContent = env === 'mainnet' ? '⛓ MAINNET READ' : '🧪 TESTNET';
        nav.appendChild(b);
      }
    });

    if (!document.getElementById('forge-nav-style')) {
      const s = document.createElement('style');
      s.id='forge-nav-style';
      s.textContent=`
        .tool-nav .forge-env-badge{background:#f4e8ff;color:#603b82;border:1px solid rgba(96,59,130,.12)}
        .tool-nav .forge-env-badge.mainnet{background:#e7f4ef;color:#2b5b49;border-color:rgba(43,91,73,.12)}
        .network-icon{background:#fff!important}
        .network-icon img{display:block!important;object-fit:contain!important}
        @media(max-width:650px){.tool-nav .forge-env-badge{display:none}}
      `;
      document.head.appendChild(s);
    }
  }

  function normalizeCopy() {
    document.title = (document.title || '').replace(/\s*—\s*/g,' | ');
    const env = window.TOTZ_FORGE_CONFIG?.environment;
    if (env === 'mainnet') {
      document.querySelectorAll('.hero p').forEach(p => {
        if (/Robinhood Chain Testnet/i.test(p.textContent || '')) p.textContent = p.textContent.replace(/Robinhood Chain Testnet/gi,'Robinhood Chain Mainnet');
      });
      document.querySelectorAll('a[href^="/forge/claim-launcher"],a[href^="/forge-claim-launcher"]').forEach(a => {
        if (/TESTNET CLAIM/i.test(a.textContent || '')) a.textContent='NEXT: OPEN OPERATOR LAUNCHER →';
        a.setAttribute('href','/forge/claim-launcher');
      });
    }

    const root=document.body;
    if (!root) return;
    const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach(n => {
      const p=n.parentElement;
      if (!p || ['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','CODE'].includes(p.tagName)) return;
      if ((n.nodeValue||'').includes('—')) n.nodeValue=n.nodeValue.replace(/\s*—\s*/g,' ');
    });
  }

  function syncLinks() {
    document.querySelectorAll('.tool-nav a[href]').forEach(a => {
      const h=a.getAttribute('href')||'';
      if (/^\/forge(?:\?|$)/.test(h)) a.setAttribute('href',withCtx('/forge'));
      else if (h.startsWith('/forge/epochs')) a.setAttribute('href',withCtx('/forge/epochs'));
      else if (h.startsWith('/forge/my-epochs')) a.setAttribute('href','/forge/my-epochs');
    });
  }

  function sync() {
    ensureShell();
    normalizeRoutes();
    normalizeToolNav();
    normalizeCopy();
    syncLinks();
  }

  document.addEventListener('DOMContentLoaded', sync, { once:true });
  document.addEventListener('input', e => {
    if (e.target?.id === 'contractInput') queueMicrotask(syncLinks);
  });
  document.addEventListener('click', e => {
    if (e.target?.closest?.('.network-btn')) setTimeout(syncLinks,0);
  });
  window.addEventListener('popstate', syncLinks);

  if (document.readyState !== 'loading') sync();
})();
(() => {
  const rawPage = (location.pathname.split('/').pop() || '').toLowerCase();
  const page = rawPage.replace(/\.html$/i, '');
  const isHome = page === '' || page === 'index';
  const isStaking = page === 'staking';
  const isRewards = page === 'rewards';
  const isAdmin = page === 'rewards-admin';
  const isForge = page === 'forge';
  const hasDock = isHome || isStaking || isRewards || isForge;

  const style = document.createElement('style');
  style.textContent = `
    ${isRewards ? `
      .prize-media{aspect-ratio:1/1!important}
      .prize-media img{width:100%!important;height:100%!important;object-fit:cover!important;object-position:center!important}
      .type-badge{font-size:.58rem!important;padding:3px 7px!important;letter-spacing:.04em!important;line-height:1!important}
      .raffle-card{transition:transform .16s ease,box-shadow .16s ease}
      .raffle-card:hover{transform:translateY(-2px)}
    ` : ''}
    ${isAdmin ? `
      .preview{aspect-ratio:1/1!important;max-height:520px}
      .preview img{object-fit:cover!important;object-position:center!important}
    ` : ''}
    ${isStaking ? `
      .wrap{max-width:1080px!important;padding-bottom:52px!important}
      nav{padding:15px 0!important}
      .hero{padding:30px 0 22px!important}
      .hero h1{font-size:clamp(2.25rem,5vw,4rem)!important;margin:14px auto 10px!important}
      .hero p{font-size:1rem!important;line-height:1.5!important}
      .safe{margin-top:13px!important;padding:7px 12px!important;font-size:.8rem!important}
      .connect-card{max-width:860px!important;padding:20px!important;margin:18px auto!important;border-radius:24px!important}
      .connect-copy h2{font-size:1.48rem!important}.connect-copy p{font-size:.9rem!important}
      .connect-card .btn{padding:11px 19px!important;font-size:.9rem!important}
      .status{margin-top:12px!important;padding:11px 14px!important;border-radius:14px!important;font-size:.9rem!important}
      .stats{gap:10px!important;margin:17px 0 20px!important}.stat{padding:15px 17px!important;border-radius:18px!important}
      .stat small{font-size:.72rem!important}.stat strong{font-size:1.52rem!important;margin-top:2px!important}
      #walletStat{margin-top:7px!important;font-size:.9rem!important}
      .economy-panel{padding:16px 18px!important;margin:18px 0 8px!important;border-radius:21px!important}
      .economy-head{margin-bottom:11px!important;gap:12px!important}.economy-head h2{font-size:1.35rem!important}
      .economy-head p{font-size:.88rem!important;line-height:1.42!important;margin-top:2px!important}.economy-live{padding:5px 8px!important;font-size:.64rem!important}
      .economy-grid{gap:8px!important}.economy-item{padding:10px 11px!important;border-radius:14px!important}
      .economy-item b{font-size:.93rem!important}.economy-item span{font-size:.7rem!important;line-height:1.32!important}
      .economy-note{margin:9px 0 0!important;font-size:.72rem!important;line-height:1.4!important}
      .section-head{margin:27px 0 12px!important}.section-head h2{font-size:1.72rem!important}.section-head p{font-size:.91rem!important}
      .section-head .badge{font-size:.67rem!important;padding:5px 8px!important}
      .bulk-actions{padding:10px 13px!important;margin-bottom:13px!important;border-radius:17px!important}
      .bulk-copy strong{font-size:.95rem!important}.bulk-copy span{font-size:.74rem!important}.bulk-buttons .btn{padding:8px 13px!important;font-size:.76rem!important}
      .nfts{gap:14px!important}.nft{border-radius:20px!important}.nft-body{padding:13px!important}.nft-title h3{font-size:1.08rem!important}
      .rate{font-size:.67rem!important;padding:4px 7px!important}.nft-meta{font-size:.8rem!important;margin:6px 0 10px!important}
      .economy-card-line{margin:-2px 0 9px!important;gap:5px!important}.economy-chip{font-size:.63rem!important;padding:3px 7px!important}
      .nft-actions .btn{padding:8px 12px!important;font-size:.78rem!important}.load-more-wrap{padding:18px 0 2px!important}.footer{margin-top:42px!important}
    ` : ''}
    ${isForge ? `
      .forge-source-note{margin:-3px 0 14px;padding:10px 14px;border-radius:15px;background:rgba(191,230,238,.48);color:var(--soft,#5B5270);font-size:.72rem;font-weight:800;line-height:1.42}
      .forge-source-note b{color:var(--ink,#2B2140)}
    ` : ''}
    ${hasDock ? `
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
      @media(max-width:720px){body{padding-bottom:72px!important}.totz-section-dock{top:auto;left:50%;bottom:10px;transform:translateX(-50%);width:auto;min-width:300px;max-width:calc(100vw - 20px);flex-direction:row;justify-content:center;padding:6px;border-radius:19px;gap:5px}.totz-section-dock::before{display:none}.totz-section-dock a{min-width:0;flex:1;min-height:41px;justify-content:center;padding:7px 9px}.totz-section-dock a.active::before{left:50%;top:auto;bottom:-7px;transform:translateX(-50%);width:28px;height:4px}.totz-section-dock .dock-label{display:inline;font-size:.62rem}}
    ` : ''}
  `;
  document.head.appendChild(style);

  function installSectionDock() {
    if (!hasDock || document.querySelector('.totz-section-dock')) return;
    const dock = document.createElement('div');
    dock.className = 'totz-section-dock';
    dock.setAttribute('aria-label', 'TOTZ pages');
    dock.innerHTML = `
      <a href="/" class="${isHome ? 'active' : ''}" title="Home" aria-label="Home"><span class="dock-icon">🏠</span><span class="dock-label">HOME</span></a>
      <a href="/staking" class="${isStaking ? 'active' : ''}" title="Staking" aria-label="Staking"><span class="dock-icon">☁️</span><span class="dock-label">STAKING</span></a>
      <a href="/rewards" class="${isRewards ? 'active' : ''}" title="Rewards" aria-label="Rewards"><span class="dock-icon">🎟️</span><span class="dock-label">REWARDS</span></a>
      <a href="/forge" class="${isForge ? 'active' : ''}" title="Forge" aria-label="Forge"><span class="dock-icon">⚒️</span><span class="dock-label">FORGE</span></a>`;
    document.body.appendChild(dock);
  }

  function installForgeLabels() {
    if (!isForge) return;
    const stats = [...document.querySelectorAll('.stat')];
    for (const stat of stats) {
      const label = stat.querySelector('small');
      const sub = stat.querySelector('span');
      const text = (label?.textContent || '').trim().toUpperCase();
      if (text === 'TOTAL SUPPLY') {
        label.textContent = 'ON-CHAIN SUPPLY';
        if (sub) sub.textContent = 'Live ERC-721 tokens at snapshot block';
      }
      if (text === 'UNIQUE HOLDERS') {
        label.textContent = 'ON-CHAIN HOLDERS';
        if (sub) sub.textContent = 'Unique owner addresses at snapshot block';
      }
    }

    const statsGrid = document.querySelector('.stats');
    if (statsGrid && !document.querySelector('.forge-source-note')) {
      const note = document.createElement('div');
      note.className = 'forge-source-note';
      note.innerHTML = '<b>On-chain snapshot:</b> FORGE reads the NFT contract directly. Marketplace item/owner counts can differ because of indexing, hidden items, filters or timing.';
      statsGrid.insertAdjacentElement('afterend', note);
    }
  }

  function loadHomeEarnings() {
    if (!isHome || document.querySelector('script[data-home-earnings]')) return;
    const script = document.createElement('script');
    script.src = 'home-earnings.js';
    script.dataset.homeEarnings = '1';
    document.head.appendChild(script);
  }

  function loadForgeHistory() {
    if (!isForge || document.querySelector('script[data-forge-history]')) return;
    const script = document.createElement('script');
    script.src = '/forge-history.js?v=1';
    script.dataset.forgeHistory = '1';
    script.async = false;
    document.head.appendChild(script);
  }

  async function silentStakingConnect() {
    if (!isStaking || !window.ethereum) return;
    if (localStorage.getItem('totz_staking_disconnect') === '1') return;
    try {
      if (typeof wallet !== 'undefined' && wallet) return;
      if (typeof loadPortfolio !== 'function') return;
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (!accounts?.length) return;
      wallet = accounts[0].toLowerCase();
      const walletButton = document.getElementById('connectBtn');
      if (walletButton && typeof shortWallet === 'function') walletButton.textContent = shortWallet(wallet);
      const title = document.getElementById('connectTitle');
      if (title) title.textContent = 'Wallet connected';
      const sub = document.getElementById('connectSub');
      if (sub && typeof shortWallet === 'function') sub.innerHTML = `Your TOTZ stay in <span class="wallet-chip">${shortWallet(wallet)}</span>. Nothing is transferred.`;
      const dash = document.getElementById('dashboard');
      if (dash) dash.hidden = false;
      if (typeof showStatus === 'function') showStatus('Connected. Loading your TOTZ…', 'ok');
      await loadPortfolio(true);
    } catch (_) {}
  }

  function rewriteTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    const parent = node.parentElement;
    if (!parent || ['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','CODE'].includes(parent.tagName)) return;
    const text = node.nodeValue || '';
    const next = text.replace(/No NFT transfer, no custody — your NFT stays where it belongs\./g, 'No NFT transfer, no custody. Your NFT stays where it belongs.').replace(/Live points/gi, '$TOTZ Balance').replace(/TOTZ points/gi, '$TOTZ').replace(/your points/gi, 'your $TOTZ').replace(/\bPTS\b/g, '$TOTZ');
    if (next !== text) node.nodeValue = next;
  }

  function cleanAnchor(anchor) {
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const href = anchor.getAttribute('href');
    if (!href || /^(?:https?:|mailto:|tel:|#|javascript:)/i.test(href)) return;
    const cleanMap = {
      'index.html': '/', './index.html': '/',
      'staking.html': '/staking', './staking.html': '/staking',
      'rewards.html': '/rewards', './rewards.html': '/rewards',
      'rewards-admin.html': '/rewards-admin', './rewards-admin.html': '/rewards-admin',
      'forge.html': '/forge', './forge.html': '/forge'
    };
    if (cleanMap[href]) anchor.setAttribute('href', cleanMap[href]);
  }

  function rewrite(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) return rewriteTextNode(root);
    if (!(root instanceof Element) && root !== document.body) return;
    if (root instanceof HTMLAnchorElement) cleanAnchor(root);
    root.querySelectorAll?.('a[href]').forEach(cleanAnchor);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(rewriteTextNode);
  }

  installSectionDock();
  installForgeLabels();
  loadHomeEarnings();
  loadForgeHistory();
  rewrite(document.body);

  if (isStaking) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(silentStakingConnect, 0), { once:true });
    else setTimeout(silentStakingConnect, 0);
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') rewriteTextNode(mutation.target);
      for (const node of mutation.addedNodes || []) rewrite(node);
    }
    if (isForge) installForgeLabels();
  });
  observer.observe(document.body, { childList:true, subtree:true, characterData:true });
})();
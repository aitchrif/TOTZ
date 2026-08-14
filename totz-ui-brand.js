(() => {
  const page = (location.pathname.split('/').pop() || '').toLowerCase();
  const isStaking = page === 'staking.html';
  const isRewards = page === 'rewards.html';
  const isAdmin = page === 'rewards-admin.html';

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
      .connect-copy h2{font-size:1.48rem!important}
      .connect-copy p{font-size:.9rem!important}
      .connect-card .btn{padding:11px 19px!important;font-size:.9rem!important}
      .status{margin-top:12px!important;padding:11px 14px!important;border-radius:14px!important;font-size:.9rem!important}

      .stats{gap:10px!important;margin:17px 0 20px!important}
      .stat{padding:15px 17px!important;border-radius:18px!important}
      .stat small{font-size:.72rem!important}
      .stat strong{font-size:1.52rem!important;margin-top:2px!important}
      #walletStat{margin-top:7px!important;font-size:.9rem!important}

      .economy-panel{padding:16px 18px!important;margin:18px 0 8px!important;border-radius:21px!important}
      .economy-head{margin-bottom:11px!important;gap:12px!important}
      .economy-head h2{font-size:1.35rem!important}
      .economy-head p{font-size:.88rem!important;line-height:1.42!important;margin-top:2px!important}
      .economy-live{padding:5px 8px!important;font-size:.64rem!important}
      .economy-grid{gap:8px!important}
      .economy-item{padding:10px 11px!important;border-radius:14px!important}
      .economy-item b{font-size:.93rem!important}
      .economy-item span{font-size:.7rem!important;line-height:1.32!important}
      .economy-note{margin:9px 0 0!important;font-size:.72rem!important;line-height:1.4!important}

      .section-head{margin:27px 0 12px!important}
      .section-head h2{font-size:1.72rem!important}
      .section-head p{font-size:.91rem!important}
      .section-head .badge{font-size:.67rem!important;padding:5px 8px!important}

      .bulk-actions{padding:10px 13px!important;margin-bottom:13px!important;border-radius:17px!important}
      .bulk-copy strong{font-size:.95rem!important}
      .bulk-copy span{font-size:.74rem!important}
      .bulk-buttons .btn{padding:8px 13px!important;font-size:.76rem!important}

      .nfts{gap:14px!important}
      .nft{border-radius:20px!important}
      .nft-body{padding:13px!important}
      .nft-title h3{font-size:1.08rem!important}
      .rate{font-size:.67rem!important;padding:4px 7px!important}
      .nft-meta{font-size:.8rem!important;margin:6px 0 10px!important}
      .economy-card-line{margin:-2px 0 9px!important;gap:5px!important}
      .economy-chip{font-size:.63rem!important;padding:3px 7px!important}
      .nft-actions .btn{padding:8px 12px!important;font-size:.78rem!important}
      .load-more-wrap{padding:18px 0 2px!important}
      .footer{margin-top:42px!important}
    ` : ''}

    ${(isStaking || isRewards) ? `
      .totz-section-dock{
        position:fixed;right:14px;top:50%;transform:translateY(-50%);z-index:9998;
        display:flex;flex-direction:column;gap:7px;padding:7px;
        width:94px;background:rgba(255,255,255,.94);backdrop-filter:blur(12px);
        border:2px solid var(--sky2,#8ED2E2);border-radius:20px;
        box-shadow:0 12px 30px rgba(43,33,64,.14)
      }
      .totz-section-dock a{
        min-height:42px;display:flex;align-items:center;justify-content:flex-start;gap:7px;
        padding:7px 9px;border-radius:13px;color:var(--ink,#2B2140);
        font-family:'Nunito',sans-serif;font-size:.7rem;font-weight:900;letter-spacing:.02em;
        transition:transform .14s ease,background .14s ease,color .14s ease
      }
      .totz-section-dock a:hover{transform:translateY(-1px);background:var(--cream,#FFF3DC)}
      .totz-section-dock a.active{background:var(--ink,#2B2140);color:#fff}
      .totz-section-dock .dock-icon{font-size:1.05rem;line-height:1;flex:0 0 auto}
      .totz-section-dock .dock-label{white-space:nowrap}

      @media(max-width:1240px) and (min-width:721px){
        .totz-section-dock{width:50px;right:8px;padding:5px;border-radius:17px}
        .totz-section-dock a{justify-content:center;padding:7px;min-height:40px}
        .totz-section-dock .dock-label{display:none}
      }
      @media(max-width:720px){
        body{padding-bottom:72px!important}
        .totz-section-dock{
          top:auto;right:50%;bottom:10px;transform:translateX(50%);
          width:auto;min-width:214px;flex-direction:row;justify-content:center;
          padding:6px;border-radius:18px
        }
        .totz-section-dock a{min-width:96px;min-height:40px;justify-content:center;padding:7px 11px}
        .totz-section-dock .dock-label{display:inline}
      }
    ` : ''}
  `;
  document.head.appendChild(style);

  function installSectionDock() {
    if (!(isStaking || isRewards) || document.querySelector('.totz-section-dock')) return;
    const dock = document.createElement('div');
    dock.className = 'totz-section-dock';
    dock.setAttribute('aria-label', 'TOTZ pages');
    dock.innerHTML = `
      <a href="staking.html" class="${isStaking ? 'active' : ''}" title="Staking" aria-label="Staking">
        <span class="dock-icon">☁️</span><span class="dock-label">STAKING</span>
      </a>
      <a href="rewards.html" class="${isRewards ? 'active' : ''}" title="Rewards" aria-label="Rewards">
        <span class="dock-icon">🎟️</span><span class="dock-label">REWARDS</span>
      </a>`;
    document.body.appendChild(dock);
  }

  function rewriteTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    const parent = node.parentElement;
    if (!parent || ['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','CODE'].includes(parent.tagName)) return;

    const text = node.nodeValue || '';
    const next = text
      .replace(/Live points/gi, '$TOTZ Balance')
      .replace(/TOTZ points/gi, '$TOTZ')
      .replace(/your points/gi, 'your $TOTZ')
      .replace(/\bPTS\b/g, '$TOTZ');

    if (next !== text) node.nodeValue = next;
  }

  function rewrite(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      rewriteTextNode(root);
      return;
    }
    if (!(root instanceof Element) && root !== document.body) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(rewriteTextNode);
  }

  installSectionDock();
  rewrite(document.body);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') rewriteTextNode(mutation.target);
      for (const node of mutation.addedNodes || []) rewrite(node);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
})();

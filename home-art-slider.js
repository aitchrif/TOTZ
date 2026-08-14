(() => {
  if (document.querySelector('.totz-art-slider')) return;

  const CID = 'QmSuozQEVRcxNSwn7huCb8sZMhqhedENfMNRsYwEVBZm1K';
  const tokenIds = [57, 118, 244, 389, 512, 734, 974, 1007, 1196, 1432, 1666, 1888, 2005, 2333, 2609, 2777, 3003, 3210, 3333, 3555, 3777, 3899, 3999, 4000];
  const gateways = [
    (id) => `https://dweb.link/ipfs/${CID}/${id}`,
    (id) => `https://ipfs.io/ipfs/${CID}/${id}`,
    (id) => `https://gateway.pinata.cloud/ipfs/${CID}/${id}`
  ];

  const style = document.createElement('style');
  style.textContent = `
    .totz-art-slider-wrap{max-width:1180px;margin:0 auto 30px;padding:0 4vw;position:relative;z-index:2}
    .totz-art-slider-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 0 11px;padding:0 4px}
    .totz-art-slider-title{display:flex;align-items:center;gap:10px;color:var(--ink,#2B2140);font-family:'Baloo 2',cursive;font-size:1rem;font-weight:900;letter-spacing:.035em;text-transform:uppercase}
    .totz-art-slider-title::before{content:'';width:10px;height:10px;border-radius:50%;background:var(--coral,#FF7A66);box-shadow:0 0 0 5px rgba(255,122,102,.14)}
    .totz-art-slider-note{color:var(--ink-soft,#5B5270);font-size:.72rem;font-weight:900;background:rgba(255,255,255,.72);border:1px solid rgba(43,33,64,.08);border-radius:999px;padding:7px 11px;white-space:nowrap}
    .totz-art-slider{position:relative;overflow:hidden;width:100%;padding:18px 0;background:var(--ink,#2B2140);border-radius:24px;box-shadow:0 16px 34px rgba(43,33,64,.15);border:2px solid rgba(255,255,255,.08)}
    .totz-art-slider::before,.totz-art-slider::after{content:'';position:absolute;top:0;bottom:0;width:90px;z-index:3;pointer-events:none}
    .totz-art-slider::before{left:0;background:linear-gradient(90deg,var(--ink,#2B2140),transparent)}
    .totz-art-slider::after{right:0;background:linear-gradient(-90deg,var(--ink,#2B2140),transparent)}
    .totz-art-track{display:flex;width:max-content;gap:14px;animation:totzArtSlide 46s linear infinite;will-change:transform}
    .totz-art-slider:hover .totz-art-track{animation-play-state:paused}
    .totz-art-group{display:flex;gap:14px;padding-right:14px;align-items:center}
    .totz-art-card{position:relative;display:block;width:126px;flex:0 0 126px;border-radius:19px;overflow:hidden;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);box-shadow:0 10px 20px rgba(0,0,0,.20);transform:translateY(var(--lift,0));transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease}
    .totz-art-card:nth-child(3n+1){--lift:-6px}.totz-art-card:nth-child(3n+2){--lift:6px}.totz-art-card:nth-child(3n+3){--lift:0px}
    .totz-art-card:hover{transform:translateY(calc(var(--lift,0px) - 6px)) scale(1.035);box-shadow:0 16px 28px rgba(0,0,0,.28);border-color:rgba(203,219,42,.60)}
    .totz-art-card img{display:block;width:100%;aspect-ratio:1/1;object-fit:cover;background:#d9edf3}
    .totz-art-id{position:absolute;left:8px;bottom:8px;padding:5px 9px;border-radius:999px;background:rgba(43,33,64,.90);color:#fff;font-size:.66rem;font-weight:900;box-shadow:0 4px 10px rgba(0,0,0,.18)}
    @keyframes totzArtSlide{from{transform:translateX(0)}to{transform:translateX(-50%)}}
    @media(prefers-reduced-motion:reduce){.totz-art-track{animation:none}.totz-art-slider{overflow-x:auto}}
    @media(max-width:720px){.totz-art-slider-wrap{padding:0 14px;margin-bottom:24px}.totz-art-slider-head{align-items:flex-start;flex-direction:column;gap:7px}.totz-art-slider-note{font-size:.66rem}.totz-art-slider{border-radius:20px;padding:15px 0}.totz-art-slider::before,.totz-art-slider::after{width:38px}.totz-art-card{width:96px;flex-basis:96px;border-radius:15px}.totz-art-id{font-size:.58rem;padding:4px 7px;left:6px;bottom:6px}}
  `;
  document.head.appendChild(style);

  const oldTicker = document.querySelector('.totz-marquee');
  const hero = document.querySelector('header.hero');
  const stakingSection = document.querySelector('.staking-home');
  if (!oldTicker && !hero && !stakingSection) return;

  const wrap = document.createElement('section');
  wrap.className = 'totz-art-slider-wrap';
  wrap.innerHTML = `
    <div class="totz-art-slider-head">
      <div class="totz-art-slider-title">Meet the TOTZ</div>
      <div class="totz-art-slider-note">24 NFTs · hover to pause</div>
    </div>
    <div class="totz-art-slider" aria-label="TOTZ NFT art slider">
      <div class="totz-art-track"></div>
    </div>`;

  const track = wrap.querySelector('.totz-art-track');
  const makeGroup = (hidden = false) => {
    const group = document.createElement('div');
    group.className = 'totz-art-group';
    if (hidden) group.setAttribute('aria-hidden', 'true');
    tokenIds.forEach((id) => {
      const card = document.createElement('article');
      card.className = 'totz-art-card';
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = hidden ? '' : `TOTZ #${id}`;
      let gatewayIndex = 0;
      img.src = gateways[gatewayIndex](id);
      img.addEventListener('error', () => {
        gatewayIndex += 1;
        if (gatewayIndex < gateways.length) img.src = gateways[gatewayIndex](id);
      });
      const tag = document.createElement('span');
      tag.className = 'totz-art-id';
      tag.textContent = `#${id}`;
      card.append(img, tag);
      group.appendChild(card);
    });
    return group;
  };

  track.append(makeGroup(false), makeGroup(true));

  if (oldTicker) oldTicker.replaceWith(wrap);
  else if (stakingSection) stakingSection.insertAdjacentElement('beforebegin', wrap);
  else hero.insertAdjacentElement('afterend', wrap);
})();

(() => {
  'use strict';

  const API = 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/totz-game-preview';
  const CHAIN_ID = 4663;
  const CHAIN_HEX = '0x1237';
  const CONTRACT = '0x107c4e7cf931b18e022d40184d03d00b4ec99d5a';
  const W = 960, H = 540, FPS = 60, DT = 1 / FPS, DTMS = 1000 / FPS, MAXRUN = 180000;
  // SHIELD + RESCUE HEART BALANCE
  const SHIELD_SECONDS = 8;
  // RARER SHIELD SPAWNS
  const SHIELD_MIN_TIME = 12000, SHIELD_COOLDOWN = 15000, SHIELD_GATE_MOD = 8, SHIELD_CHANCE = .70;
  const HEART_MIN_TIME = 25000, HEART_COOLDOWN = 35000, HEART_MAX_SPAWNS = 2, HEART_CHANCE = .22;

  const skins = {
    royal: { name: 'Royal Gold', need: 0, aura: '#ffd25a', trail: '#f0bd39' },
    storm: { name: 'Storm', need: 40, aura: '#88a4ff', trail: '#5c73da' },
    frost: { name: 'Frost', need: 100, aura: '#8de9ff', trail: '#66cfe6' },
    neon: { name: 'Neon', need: 200, aura: '#b6ff68', trail: '#82df34' },
    void: { name: 'Void', need: 350, aura: '#c08cff', trail: '#834fd1' }
  };

  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d', { alpha: false });

  let wallet = null, profile = null, mode = 'ranked', selectedSkin = 'royal';
  let session = null, finishToken = null, babyImg = null, soundOn = true, audioCtx = null;
  let hold = false, last = 0, acc = 0, raf = 0, gameRand = Math.random, replayRaw = [];
  let gates = [], pickups = [], particles = [], bgClouds = [], trail = [], floatText = [], sparkles = [];
  let leaderScope = 'all', lastComboShown = 1, lastCoinHud = 0, lastLifeHud = 3, runWasBest = false;
  let state = freshState();
  let player = freshPlayer();

  // AUTO PERFORMANCE MODE — visual quality only; gameplay physics never change.
  const QUALITY = [
    { name: 'LOW', particleScale: .38, trailEvery: 3, sparkleStep: 4, shadow: 0, speedLines: false },
    { name: 'BALANCED', particleScale: .68, trailEvery: 2, sparkleStep: 2, shadow: .55, speedLines: true },
    { name: 'HIGH', particleScale: 1, trailEvery: 1, sparkleStep: 1, shadow: 1, speedLines: true }
  ];
  let qualityLevel = 2, perfFrames = 0, perfWindowStart = 0, perfLowStreak = 0, perfHighStreak = 0, perfFps = 60;
  const quality = () => QUALITY[qualityLevel];

  function ensurePerfBadge() {
    let badge = $('perfBadge');
    if (badge) return badge;
    const foot = document.querySelector('.game-foot');
    if (!foot) return null;
    badge = document.createElement('span');
    badge.id = 'perfBadge';
    badge.style.cssText = 'margin-left:auto;padding:6px 9px;border-radius:999px;background:#eef6c9;color:#46521b;font-size:.58rem;font-weight:1000;white-space:nowrap;transition:background .25s,color .25s';
    foot.appendChild(badge);
    return badge;
  }
  function updatePerfBadge() {
    const badge = ensurePerfBadge(); if (!badge) return;
    badge.textContent = `AUTO • ${quality().name} • ${Math.max(0, Math.round(perfFps))} FPS`;
    if (qualityLevel === 2) { badge.style.background = '#eef6c9'; badge.style.color = '#46521b'; }
    else if (qualityLevel === 1) { badge.style.background = '#fff3dc'; badge.style.color = '#665b78'; }
    else { badge.style.background = '#ffe0dc'; badge.style.color = '#8b2b1f'; }
  }
  function setQuality(level) {
    qualityLevel = clamp(level, 0, QUALITY.length - 1);
    perfLowStreak = 0; perfHighStreak = 0;
    updatePerfBadge();
  }
  function initPerformanceMode() {
    const cores = Number(navigator.hardwareConcurrency || 8);
    const memory = Number(navigator.deviceMemory || 8);
    const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    qualityLevel = (cores <= 2 || memory <= 2) ? 0 : (cores <= 4 || memory <= 4 || reduced) ? 1 : 2;
    perfWindowStart = performance.now(); perfFrames = 0; perfFps = 60;
    updatePerfBadge();
  }
  function samplePerformance(now) {
    if (document.hidden) { perfFrames = 0; perfWindowStart = now; return; }
    perfFrames++;
    if (!perfWindowStart) perfWindowStart = now;
    const elapsed = now - perfWindowStart;
    if (elapsed < 1800) return;
    perfFps = perfFrames * 1000 / elapsed;
    if (perfFps < 48) { perfLowStreak++; perfHighStreak = 0; }
    else if (perfFps > 56) { perfHighStreak++; perfLowStreak = Math.max(0, perfLowStreak - 1); }
    else { perfLowStreak = Math.max(0, perfLowStreak - 1); perfHighStreak = 0; }
    if ((perfFps < 39 || perfLowStreak >= 2) && qualityLevel > 0) setQuality(qualityLevel - 1);
    else if (perfHighStreak >= 4 && qualityLevel < 2) setQuality(qualityLevel + 1);
    else updatePerfBadge();
    perfFrames = 0; perfWindowStart = now;
  }

  function freshState() {
    return { running: false, step: 0, t: 0, coins: 0, lives: 3, shield: 0, heartsSpawned: 0, heartsCollected: 0, lastHeartSpawn: -999999, lastShieldSpawn: -999999, combo: 1, maxCombo: 1, comboTimer: 0, hits: 0, score: 0, speed: 225, spawn: .55, gateNo: 0, shake: 0, flash: 0, best: Number(localStorage.getItem('totzCloudDashV4Best') || 0) };
  }
  function freshPlayer() { return { x: 165, y: 190, w: 86, h: 155, vy: 0, inv: 0, rot: 0 }; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function hexToRgb(hex) { const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function mixColor(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`; }
  function esc(v) { return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function short(v) { return v ? `${v.slice(0, 6)}…${v.slice(-4)}` : 'NO WALLET'; }
  function status(msg, bad = false) { const el = $('status'); el.textContent = msg; el.classList.toggle('bad', bad); }
  function hexText(text) { return '0x' + Array.from(new TextEncoder().encode(text)).map(b => b.toString(16).padStart(2, '0')).join(''); }
  function scoreFormula() { return Math.max(0, Math.floor(Math.round(state.t) / 15) + state.coins * 120 + Math.max(0, state.maxCombo - 1) * 75 - state.hits * 100); }

  function injectPremiumUI() {
    const style = document.createElement('style');
    style.textContent = `
      .game-shell{position:relative;isolation:isolate;box-shadow:0 24px 70px rgba(43,33,64,.18),0 0 0 1px rgba(255,255,255,.8) inset!important}
      .canvas-wrap:after{content:'';position:absolute;z-index:2;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 35%,transparent 20%,rgba(38,32,64,.06) 72%,rgba(38,32,64,.18) 110%);mix-blend-mode:multiply}
      .hud-chip{transition:transform .18s cubic-bezier(.2,.9,.2,1.4),box-shadow .18s,background .18s}
      .hud-chip.juice{transform:scale(1.14);box-shadow:0 8px 24px rgba(43,33,64,.18)}
      .combo-hot{background:linear-gradient(135deg,#fff0a0,#ffd25a)!important;box-shadow:0 0 26px rgba(255,210,90,.55)!important}
      .premium-callout{position:absolute;z-index:5;left:50%;top:27%;transform:translate(-50%,-50%) scale(.72);opacity:0;pointer-events:none;font:800 clamp(1.05rem,3vw,2rem)/1 'Baloo 2',sans-serif;color:#fff;text-shadow:0 3px 0 rgba(43,33,64,.35),0 10px 30px rgba(43,33,64,.28);letter-spacing:.02em;white-space:nowrap}
      .premium-callout.show{animation:totzPop .72s cubic-bezier(.2,.9,.2,1.15)}
      .premium-callout.gold{color:#fff0a0}.premium-callout.cyan{color:#c9f7ff}.premium-callout.coral{color:#ffd7d0}.premium-callout.lime{color:#efff8a}
      @keyframes totzPop{0%{opacity:0;transform:translate(-50%,-50%) scale(.55) rotate(-5deg)}25%{opacity:1;transform:translate(-50%,-58%) scale(1.12) rotate(2deg)}70%{opacity:1;transform:translate(-50%,-70%) scale(1)}100%{opacity:0;transform:translate(-50%,-92%) scale(.9)}}
      .run-progress{position:absolute;z-index:4;left:15%;right:15%;bottom:11px;height:5px;border-radius:999px;background:rgba(255,255,255,.35);overflow:hidden;box-shadow:0 3px 12px rgba(43,33,64,.08);pointer-events:none}
      .run-progress i{display:block;height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#cbdb2a,#ffd25a,#ff7a66);box-shadow:0 0 15px rgba(255,210,90,.6);transition:width .15s linear}
      .speed-badge{position:absolute;z-index:4;right:12px;bottom:22px;padding:5px 8px;border-radius:999px;background:rgba(43,33,64,.72);color:#fff;font:800 .58rem 'Nunito',sans-serif;letter-spacing:.06em;opacity:.72;pointer-events:none;backdrop-filter:blur(6px)}
      .result-extra{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:-4px 0 12px}.result-extra div{background:#f7f3ff;border-radius:13px;padding:8px}.result-extra small{display:block;color:#665b78;font-size:.52rem;font-weight:900}.result-extra strong{font:800 .92rem 'Baloo 2'}
      .new-best{display:none;margin:8px auto 0;width:max-content;padding:5px 9px;border-radius:999px;background:#ffd25a;color:#5d4214;font-size:.62rem;font-weight:1000;box-shadow:0 7px 20px rgba(255,210,90,.3)}.new-best.show{display:block;animation:bestPop .55s cubic-bezier(.2,.9,.2,1.2)}
      @keyframes bestPop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
      .leader-tabs-premium{display:flex;gap:5px;margin-bottom:9px}.leader-tabs-premium button{border:0;background:#fff3dc;color:#665b78;border-radius:999px;padding:6px 9px;font-size:.64rem;font-weight:900;cursor:pointer}.leader-tabs-premium button.active{background:#2b2140;color:#fff}
      .leader-row.me{outline:2px solid #ffd25a;background:#fff1b8!important}.leader-row:first-child{background:linear-gradient(135deg,#fff4bd,#fff3dc)}
      .skin{transition:transform .18s,box-shadow .18s,border-color .18s}.skin:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(43,33,64,.1)}.skin.active{box-shadow:0 0 0 2px rgba(43,33,64,.08),0 12px 28px rgba(43,33,64,.12)!important}
      .mission{transition:transform .2s,background .2s}.mission.live{transform:translateX(2px)}
      .mission .live-progress{display:block;margin-top:2px;color:#8d7c4f;font-size:.58rem;font-weight:900}
      .overlay-card{animation:cardIn .35s ease both}@keyframes cardIn{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}
      .start{transition:transform .18s,filter .18s,box-shadow .18s}.start:hover{filter:saturate(1.12) brightness(1.02);transform:translateY(-1px)}
      .profilebar,.card{transition:box-shadow .25s,transform .25s}.card:hover{box-shadow:0 20px 55px rgba(43,33,64,.13)}
      @media(max-width:680px){.run-progress{left:22%;right:22%;bottom:8px}.speed-badge{bottom:18px}.premium-callout{top:31%}.result-extra{grid-template-columns:repeat(3,1fr)}}`;
    document.head.appendChild(style);

    const wrap = document.querySelector('.canvas-wrap');
    const callout = document.createElement('div'); callout.id = 'premiumCallout'; callout.className = 'premium-callout'; wrap.appendChild(callout);
    const progress = document.createElement('div'); progress.className = 'run-progress'; progress.innerHTML = '<i id="runProgressFill"></i>'; wrap.appendChild(progress);
    const speed = document.createElement('div'); speed.className = 'speed-badge'; speed.id = 'speedBadge'; speed.textContent = 'CRUISE'; wrap.appendChild(speed);

    const result = document.querySelector('.result');
    if (result) {
      const extra = document.createElement('div'); extra.className = 'result-extra'; extra.innerHTML = '<div><small>MAX COMBO</small><strong id="endCombo">x1</strong></div><div><small>HITS</small><strong id="endHits">0</strong></div><div><small>MODE</small><strong id="endMode">RANKED</strong></div>'; result.insertAdjacentElement('afterend', extra);
      const best = document.createElement('div'); best.id = 'newBestBadge'; best.className = 'new-best'; best.textContent = '🏆 NEW PERSONAL BEST'; extra.insertAdjacentElement('afterend', best);
    }

    const leaderCard = $('leaderboard') && $('leaderboard').closest('.card');
    if (leaderCard && !leaderCard.querySelector('.leader-tabs-premium')) {
      const tabs = document.createElement('div'); tabs.className = 'leader-tabs-premium'; tabs.innerHTML = '<button data-premium-scope="today">TODAY</button><button data-premium-scope="all" class="active">ALL TIME</button>';
      leaderCard.insertBefore(tabs, $('leaderboard'));
      tabs.querySelectorAll('button').forEach(b => b.addEventListener('click', () => loadLeaderboard(b.dataset.premiumScope)));
    }

    [['mScore','2500'],['mCoins','18'],['mSurvive','60s']].forEach(([id]) => {
      const text = $(id)?.querySelector('div'); if (text && !text.querySelector('.live-progress')) { const p = document.createElement('span'); p.className = 'live-progress'; text.appendChild(p); }
    });
  }

  function showCallout(text, toneClass = 'gold') {
    const el = $('premiumCallout'); if (!el) return;
    el.className = `premium-callout ${toneClass}`; el.textContent = text;
    void el.offsetWidth; el.classList.add('show');
  }
  function pulseHud(id) { const el = $(id)?.closest('.hud-chip'); if (!el) return; el.classList.add('juice'); setTimeout(() => el.classList.remove('juice'), 190); }
  function chord(notes, dur = .08, vol = .028) { notes.forEach((n, i) => setTimeout(() => tone(n, dur, vol), i * 42)); }
  function vibrate(pattern) { try { navigator.vibrate?.(pattern); } catch (_) {} }

  async function api(body, timeout = 16000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal, cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error || `Request failed (${r.status})`);
      return d;
    } finally { clearTimeout(timer); }
  }

  async function ensureChain() {
    if (!window.ethereum) throw new Error('No EVM wallet detected. Open this page in a browser with your wallet extension enabled.');
    const current = await window.ethereum.request({ method: 'eth_chainId' });
    if (String(current).toLowerCase() === CHAIN_HEX) return;
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] });
    } catch (e) {
      if (e && e.code !== 4902) throw e;
      await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: CHAIN_HEX, chainName: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'], blockExplorerUrls: ['https://robinhoodchain.blockscout.com'] }] });
    }
  }

  async function connectWallet() {
    if (!window.ethereum) throw new Error('Wallet extension not detected.');
    status('Opening wallet…');
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    wallet = accounts && accounts[0] ? accounts[0].toLowerCase() : null;
    if (!wallet) throw new Error('No wallet selected.');
    await ensureChain();
    $('walletChip').textContent = short(wallet);
    $('connectBtn').textContent = 'CONNECTED';
    status('Wallet connected. Ready for Ranked.');
    loadProfile().catch(() => {});
    return wallet;
  }

  function startMessage(ts, name, skin) {
    return ['TOTZ Cloud Dash', 'Action: start_ranked', `Wallet: ${wallet}`, `Name: ${name}`, `Skin: ${skin}`, `Chain ID: ${CHAIN_ID}`, `Contract: ${CONTRACT}`, `Timestamp: ${ts}`].join('\n');
  }

  async function startRun() {
    if (state.running) return;
    $('startBtn').disabled = true;
    try {
      if (mode === 'practice') {
        status('Practice run started.');
        begin((Math.random() * 0xffffffff) >>> 0);
        return;
      }
      if (!wallet) await connectWallet();
      await ensureChain();
      const name = ($('nameInput').value || 'TOTZ Player').trim().slice(0, 18) || 'TOTZ Player';
      const ts = Date.now();
      const msg = startMessage(ts, name, selectedSkin);
      status('Check your wallet and sign once. No transaction, no gas.');
      const sig = await window.ethereum.request({ method: 'personal_sign', params: [hexText(msg), wallet] });
      status('Signature accepted. Opening server-verified run…');
      const d = await api({ action: 'start_ranked', wallet, displayName: name, skin: selectedSkin, timestamp: ts, signature: sig });
      session = d.session;
      finishToken = d.finishToken;
      profile = d.profile || profile;
      selectedSkin = d.skin || selectedSkin;
      renderProfile();
      renderSkins();
      begin(Number(session.seed) || 1);
    } catch (e) {
      console.error(e);
      status(e && e.message ? e.message : 'Could not start Ranked run.', true);
    } finally { $('startBtn').disabled = false; }
  }

  function setMode(next) {
    if (state.running) return;
    mode = next;
    $('rankedMode').classList.toggle('active', mode === 'ranked');
    $('practiceMode').classList.toggle('active', mode === 'practice');
    $('startBtn').textContent = mode === 'ranked' ? 'START RANKED RUN' : 'START PRACTICE';
    status(mode === 'ranked' ? (wallet ? 'Ranked ready. One signature per run.' : 'Ranked needs your wallet. Click Start and it will connect.') : 'Practice mode: instant play, no wallet, no farming.');
  }

  function mulberry32(a) { return function () { let t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function rand(a, b) { return a + gameRand() * (b - a); }
  function vrand(a, b) { return a + Math.random() * (b - a); }

  function begin(seed) {
    gameRand = mulberry32(seed >>> 0);
    hold = false; replayRaw = []; trail = []; floatText = []; sparkles = [];
    lastComboShown = 1; lastCoinHud = 0; lastLifeHud = 3; runWasBest = false;
    const best = state.best;
    state = freshState(); state.best = best; state.running = true;
    player = freshPlayer(); gates = []; pickups = []; particles = []; bgClouds = [];
    for (let i = 0; i < 12; i++) bgClouds.push({ x: vrand(-100, W), y: vrand(35, 385), s: vrand(.35, 1.5), v: vrand(7, 26), layer: i % 3 });
    for (let i = 0; i < 34; i++) sparkles.push({ x: vrand(0, W), y: vrand(20, 420), r: vrand(.7, 2.1), a: vrand(.15, .6), p: vrand(0, Math.PI * 2) });
    $('startOverlay').hidden = true; $('gameOver').hidden = true; $('verified').classList.remove('show'); $('verified').classList.remove('bad');
    $('newBestBadge')?.classList.remove('show');
    last = performance.now(); acc = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); chord([420, 560, 700], .07, .024); showCallout(mode === 'ranked' ? 'RANKED RUN' : 'PRACTICE', 'lime');
  }

  function spawnGate() {
    const gapH = clamp(225 - state.t / 2500, 155, 225), gapY = rand(95, H - 95 - gapH), w = 82;
    gates.push({ x: W + 40, w, gapY, gapH, hit: false, nearChecked: false });
    const coinY = gapY + gapH * (.27 + gameRand() * .46);
    pickups.push({ type: 'coin', x: W + 40 + w / 2, y: coinY, r: 15, taken: false, pulse: vrand(0, Math.PI * 2) });
    state.gateNo++;
    const shieldEligible = state.shield <= 0 && state.t >= SHIELD_MIN_TIME && state.t - state.lastShieldSpawn >= SHIELD_COOLDOWN && state.gateNo % SHIELD_GATE_MOD === 0;
    if (shieldEligible && gameRand() < SHIELD_CHANCE) {
      pickups.push({ type: 'shield', x: W + 40 + w / 2 + 45, y: gapY + gapH / 2, r: 17, taken: false, pulse: vrand(0, Math.PI * 2) });
      state.lastShieldSpawn = state.t;
    }
    const heartEligible = state.lives === 1 && state.t >= HEART_MIN_TIME && state.heartsSpawned < HEART_MAX_SPAWNS && state.t - state.lastHeartSpawn >= HEART_COOLDOWN && state.gateNo % 4 === 0;
    if (heartEligible && gameRand() < HEART_CHANCE) {
      const heartY = gapY + gapH * (.35 + gameRand() * .30);
      pickups.push({ type: 'heart', x: W + 40 + w / 2 + 78, y: heartY, r: 17, taken: false, pulse: vrand(0, Math.PI * 2) });
      state.heartsSpawned++; state.lastHeartSpawn = state.t;
    }
  }
  function hitGate(g) { const px = player.x + 20, py = player.y + 18, pw = player.w - 35, ph = player.h - 32; return px < g.x + g.w && px + pw > g.x && (py < g.gapY || py + ph > g.gapY + g.gapH); }
  function damage(g) {
    if (player.inv > 0 || g.hit) return true;
    g.hit = true;
    if (state.shield > 0) {
      state.shield = 0; burst(player.x + 45, player.y + 70, skins[selectedSkin].aura, 24); chord([680, 840], .07, .03); showCallout('SHIELD SAVED!', 'cyan'); pulseHud('life'); vibrate(18); return true;
    }
    state.lives--; state.hits++; player.inv = 1.15; player.vy = -180; state.combo = 1; state.comboTimer = 0; state.shake = 11; state.flash = .22;
    burst(player.x + 45, player.y + 70, '#ff7a66', 26); chord([180, 135], .1, .05); showCallout(state.lives ? 'OUCH!' : 'CLOUD DOWN!', 'coral'); pulseHud('life'); vibrate([28, 30, 28]);
    return state.lives > 0;
  }
  function collect(p) {
    if (p.taken) return; p.taken = true;
    if (p.type === 'coin') {
      state.coins++; state.combo = state.comboTimer > 0 ? Math.min(5, state.combo + 1) : 1; state.maxCombo = Math.max(state.maxCombo, state.combo); state.comboTimer = 2.4;
      burst(p.x, p.y, '#ffd25a', 15); floatText.push({ x: p.x, y: p.y - 8, text: '+1', color: '#fff0a0', life: .62, vy: -38 });
      tone(820 + state.combo * 70, .045, .035); pulseHud('coins');
      if (state.combo >= 3 && state.combo > lastComboShown) { showCallout(state.combo === 5 ? 'MAX COMBO x5!' : `COMBO x${state.combo}`, state.combo === 5 ? 'lime' : 'gold'); chord([760, 920, 1080].slice(0, state.combo - 1), .045, .022); lastComboShown = state.combo; }
    } else if (p.type === 'shield') {
      if (state.shield <= 0) {
        state.shield = SHIELD_SECONDS; burst(p.x, p.y, '#8de9ff', 24); floatText.push({ x: p.x, y: p.y - 8, text: `${SHIELD_SECONDS}s SHIELD`, color: '#c9f7ff', life: .8, vy: -30 }); chord([520, 690, 920], .07, .026); showCallout(`SHIELD ${SHIELD_SECONDS}s`, 'cyan'); pulseHud('life');
      } else {
        floatText.push({ x: p.x, y: p.y - 8, text: 'NO REFRESH', color: '#c9f7ff', life: .62, vy: -26 }); tone(420, .04, .018);
      }
    } else if (p.type === 'heart') {
      if (state.lives === 1) {
        state.lives = 2; state.heartsCollected++; burst(p.x, p.y, '#ff7a86', 28); floatText.push({ x: p.x, y: p.y - 8, text: '+1 LIFE', color: '#ffd8dc', life: .9, vy: -34 }); chord([620, 820, 1040], .08, .032); showCallout('RESCUE HEART! +1 ❤️', 'coral'); pulseHud('life'); vibrate([18, 22, 18]);
      }
    }
  }
  function burst(x, y, color, n) { const count = Math.max(2, Math.round(n * quality().particleScale)); for (let i = 0; i < count; i++) particles.push({ x, y, vx: vrand(-145, 145), vy: vrand(-145, 115), life: vrand(.35, .8), color, size: vrand(2, 6), spin: vrand(-5, 5) }); }

  function maybeNearMiss(g) {
    if (g.nearChecked || g.hit || g.x + g.w >= player.x + 6) return;
    g.nearChecked = true;
    const py = player.y + 18, ph = player.h - 32;
    const topMargin = py - g.gapY;
    const bottomMargin = (g.gapY + g.gapH) - (py + ph);
    const tight = Math.min(topMargin, bottomMargin);
    if (tight >= 0 && tight < 22) { showCallout('NEAR MISS!', 'gold'); floatText.push({ x: player.x + 70, y: player.y + 32, text: 'NICE!', color: '#fff0a0', life: .8, vy: -32 }); tone(1020, .06, .025); }
  }

  function stepGame() {
    state.t += DTMS;
    if (state.t >= MAXRUN) { state.t = MAXRUN; state.step++; state.score = scoreFormula(); finishRun(true); return; }
    state.speed = Math.min(390, 225 + state.t / 1000 * 1.5);
    state.spawn -= DT;
    if (state.spawn <= 0) { spawnGate(); state.spawn = Math.max(.95, 1.45 - state.t / 120000) + rand(-.08, .12); }
    player.vy += (hold ? -610 : 720) * DT; player.vy = clamp(player.vy, -360, 390); player.y += player.vy * DT; player.rot = clamp(player.vy / 900, -.22, .28);
    let ended = false;
    if (player.y < 8) { player.y = 8; player.vy = 50; }
    if (player.y + player.h > H - 10) { player.y = H - player.h - 10; player.vy = -130; if (player.inv <= 0 && !damage({ hit: false })) ended = true; }
    if (player.inv > 0) player.inv -= DT;
    if (state.shield > 0) {
      const beforeShield = state.shield;
      state.shield = Math.max(0, state.shield - DT);
      if (beforeShield > 0 && state.shield === 0) { showCallout('SHIELD DOWN', 'cyan'); tone(260, .055, .018); pulseHud('life'); }
    }
    if (state.comboTimer > 0) { state.comboTimer -= DT; if (state.comboTimer <= 0) { state.combo = 1; lastComboShown = 1; } }
    if (!ended) for (const g of gates) { g.x -= state.speed * DT; if (hitGate(g) && !damage(g)) { ended = true; break; } maybeNearMiss(g); }
    if (!ended) {
      gates = gates.filter(g => g.x > -120);
      for (const p of pickups) { p.x -= state.speed * DT; if (!p.taken) { const dx = player.x + 48 - p.x, dy = player.y + 76 - p.y; if (dx * dx + dy * dy < (p.r + 27) * (p.r + 27)) collect(p); } }
      pickups = pickups.filter(p => p.x > -70 && !p.taken);
    }
    for (const c of bgClouds) { c.x -= c.v * DT * (1 + c.layer * .35); if (c.x < -160) { c.x = W + vrand(30, 190); c.y = vrand(25, 390); } }
    for (const p of particles) { p.x += p.vx * DT; p.y += p.vy * DT; p.vy += 150 * DT; p.life -= DT; }
    particles = particles.filter(p => p.life > 0);
    for (const f of floatText) { f.y += f.vy * DT; f.life -= DT; }
    floatText = floatText.filter(f => f.life > 0);
    if (state.step % quality().trailEvery === 0) trail.push({ x: player.x + 28, y: player.y + player.h * .72, life: .48, s: vrand(5, 10) });
    const trailCap = qualityLevel === 2 ? 38 : qualityLevel === 1 ? 27 : 17;
    while (trail.length > trailCap) trail.shift(); for (const t of trail) { t.x -= state.speed * DT * .16; t.life -= DT; } trail = trail.filter(t => t.life > 0);
    state.shake = Math.max(0, state.shake - 35 * DT); state.flash = Math.max(0, state.flash - DT); state.step++; state.score = scoreFormula(); syncHud();
    if (ended) finishRun(false);
  }

  function normalizeInputs() {
    const out = []; let prevStep = -1, prevHold = 0;
    for (const [s, h] of replayRaw) {
      if (!Number.isInteger(s) || s < 0 || s >= state.step || s <= prevStep || (h !== 0 && h !== 1) || h === prevHold) continue;
      out.push([s, h]); prevStep = s; prevHold = h;
    }
    return out;
  }

  async function finishRun(cleared) {
    if (!state.running) return;
    state.running = false; hold = false; cancelAnimationFrame(raf); state.score = scoreFormula();
    runWasBest = state.score > state.best;
    if (runWasBest) { state.best = state.score; localStorage.setItem('totzCloudDashV4Best', String(state.best)); $('best').textContent = state.best.toLocaleString(); $('newBestBadge')?.classList.add('show'); chord([660, 880, 1100, 1320], .08, .026); }
    $('endScore').textContent = state.score.toLocaleString(); $('endCoins').textContent = state.coins; $('endTime').textContent = `${Math.floor(state.t / 1000)}s`; $('endFarm').textContent = mode === 'ranked' ? 'VERIFYING…' : '—';
    if ($('endCombo')) $('endCombo').textContent = `x${state.maxCombo}`; if ($('endHits')) $('endHits').textContent = state.hits; if ($('endMode')) $('endMode').textContent = mode.toUpperCase();
    $('gameOver').hidden = false;
    if (mode !== 'ranked' || !session || !finishToken || !wallet) { $('verified').textContent = 'Practice run. No leaderboard or farming.'; $('verified').classList.add('show'); return; }
    try {
      const inputs = normalizeInputs();
      const d = await api({ action: 'finish_ranked', wallet, sessionId: session.id, finishToken, steps: state.step, inputs, clientScore: state.score, clientCoins: state.coins, clientHits: state.hits, clientMaxCombo: state.maxCombo, skin: selectedSkin }, 22000);
      const r = d.serverResult || {};
      $('endScore').textContent = Number(r.score || 0).toLocaleString(); $('endCoins').textContent = Number(r.coins || 0); $('endTime').textContent = `${Math.floor(Number(r.survivalMs || 0) / 1000)}s`; $('endFarm').textContent = `+${Number(d.farmAwarded || 0).toFixed(2)} TEST`;
      if ($('endCombo')) $('endCombo').textContent = `x${Number(r.maxCombo || state.maxCombo)}`; if ($('endHits')) $('endHits').textContent = Number(r.hits || 0);
      $('verified').innerHTML = `✓ FULL REPLAY VERIFIED · ${esc(d.physicsVersion)} · ${inputs.length} inputs · ${esc(String(d.replayHash || '').slice(0, 18))}…<br>+${Number(d.xpAwarded || 0)} XP${d.newMissions ? ` · ${d.newMissions} mission${d.newMissions > 1 ? 's' : ''} completed` : ''}`;
      $('verified').classList.add('show'); profile = d.profile || profile; renderProfile(); renderSkins(); loadLeaderboard(leaderScope); showCallout('VERIFIED ✓', 'lime');
    } catch (e) {
      console.error(e); $('endFarm').textContent = 'REJECTED'; $('verified').textContent = `Replay rejected: ${e.message || e}`; $('verified').classList.add('show', 'bad');
    } finally { session = null; finishToken = null; }
  }

  function syncHud() {
    $('score').textContent = state.score.toLocaleString(); $('coins').textContent = state.coins; $('combo').textContent = `x${state.combo}`; $('life').textContent = '❤️'.repeat(state.lives) + (state.shield > 0 ? `  🛡️${state.shield.toFixed(1)}s` : ''); $('time').textContent = `${Math.floor(state.t / 1000)}s`;
    if (state.coins !== lastCoinHud) { pulseHud('coins'); lastCoinHud = state.coins; }
    if (state.lives !== lastLifeHud) { pulseHud('life'); lastLifeHud = state.lives; }
    const comboChip = $('combo')?.closest('.hud-chip'); comboChip?.classList.toggle('combo-hot', state.combo >= 4);
    const fill = $('runProgressFill'); if (fill) fill.style.width = `${Math.min(100, state.t / MAXRUN * 100)}%`;
    const badge = $('speedBadge'); if (badge) badge.textContent = state.speed > 350 ? '🔥 HYPER' : state.speed > 300 ? '⚡ FAST' : state.speed > 260 ? '💨 FLOW' : '☁️ CRUISE';
    const ms = $('mScore')?.querySelector('.live-progress'); if (ms) ms.textContent = `${Math.min(2500, state.score).toLocaleString()} / 2,500`;
    const mc = $('mCoins')?.querySelector('.live-progress'); if (mc) mc.textContent = `${Math.min(18, state.coins)} / 18`;
    const mt = $('mSurvive')?.querySelector('.live-progress'); if (mt) mt.textContent = `${Math.min(60, Math.floor(state.t / 1000))} / 60s`;
  }

  function drawCloud(x, y, s, a = .7) { ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 35 * s, 0, Math.PI * 2); ctx.arc(x + 35 * s, y - 10 * s, 45 * s, 0, Math.PI * 2); ctx.arc(x + 78 * s, y, 34 * s, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  // CUTE CLOUD BARS V1 — visual only, gameplay hitboxes stay unchanged.
  function drawCloudPuff(cx, cy, r, c1 = '#ffffff', c2 = '#dff6ff') {
    const rg = ctx.createRadialGradient(cx - r * .28, cy - r * .34, Math.max(2, r * .16), cx, cy, r);
    rg.addColorStop(0, c1); rg.addColorStop(1, c2);
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }
  function drawCloudWall(x, y, w, h, flip = false) {
    if (h <= 0) return;
    ctx.save();
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(.45, '#eefaff'); grad.addColorStop(1, '#d9f2ff');
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(91,170,205,.22)'; ctx.shadowBlur = Math.round(18 * quality().shadow);
    ctx.fillRect(x + 7, y, Math.max(0, w - 14), h);
    ctx.shadowBlur = 0;
    const lipY = flip ? y : y + h;
    const lipDir = flip ? 1 : -1;
    const lipR = Math.min(17, Math.max(12, w * .2));
    for (let px = x + 3; px <= x + w - 3; px += 16) {
      const wobble = Math.sin(px * .13) * 2;
      drawCloudPuff(px, lipY + lipDir * 2 + wobble, lipR + ((Math.floor(px / 16) % 2) ? 2 : 0), '#ffffff', '#d9f2ff');
    }
    for (let py = y + 18; py < y + h - 15; py += 30) {
      drawCloudPuff(x + 6, py, 10, '#ffffff', '#e7f8ff');
      drawCloudPuff(x + w - 6, py + 8, 10, '#ffffff', '#e7f8ff');
    }
    ctx.globalAlpha = .9;
    ctx.fillStyle = '#ffffff';
    for (let py = y + 22; py < y + h - 18; py += 50) {
      ctx.beginPath(); ctx.arc(x + w * .36, py, 3.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (qualityLevel > 0 && h > 70) {
      const dots = [
        ['#ffdbe9', .28, .24], ['#fff0a8', .68, .4], ['#dcffd9', .42, .67], ['#dfe7ff', .62, .16]
      ];
      for (const [c, px, py] of dots) {
        const yy = y + h * py;
        if (yy > y + 15 && yy < y + h - 15) {
          ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + w * px, yy, 4, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.strokeStyle = 'rgba(104,190,220,.48)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 2); ctx.lineTo(x + 8, y + h - 2);
    ctx.moveTo(x + w - 8, y + 2); ctx.lineTo(x + w - 8, y + h - 2);
    ctx.stroke();
    ctx.restore();
  }
  function drawBg() {
    const phase = Math.min(1, state.t / 150000), dusk = Math.max(0, (state.t - 65000) / 85000);
    const top = mixColor('#86d9ee', '#7767b7', dusk * .9), mid = mixColor('#d7f4f6', '#e5a6bb', dusk * .65), bottom = mixColor('#fff0c7', '#ffcb91', phase * .65);
    const grad = ctx.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, top); grad.addColorStop(.62, mid); grad.addColorStop(1, bottom); ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    const sunX = 760 - phase * 80, sunY = 100 + phase * 42; const rg = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 95); rg.addColorStop(0, `rgba(255,244,184,${.55 - dusk * .15})`); rg.addColorStop(1, 'rgba(255,244,184,0)'); ctx.fillStyle = rg; ctx.fillRect(sunX - 100, sunY - 100, 200, 200);
    for (let i = 0; i < sparkles.length; i += quality().sparkleStep) { const s = sparkles[i], tw = .35 + Math.sin(state.t / 550 + s.p) * .25; ctx.globalAlpha = clamp(s.a * tw + dusk * .15, .05, .75); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    for (const c of bgClouds) {
      if (qualityLevel === 0 && c.layer === 0) continue;
      if (c.layer === 0) drawCloud(c.x, c.y, c.s * .72, .18);
      else if (c.layer === 1) drawCloud(c.x, c.y, c.s, .33);
      else drawCloud(c.x, c.y, c.s * 1.15, .5);
    }
    if (state.speed > 300 && quality().speedLines) { ctx.strokeStyle = `rgba(255,255,255,${Math.min(.16, (state.speed - 300) / 500)})`; ctx.lineWidth = 2; const lineCount = qualityLevel === 2 ? 12 : 7; for (let i = 0; i < lineCount; i++) { const y = (i * 47 + state.t / 5) % H; const x = (i * 91 + state.t / 3) % W; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 55, y + 3); ctx.stroke(); } }
  }
  function drawGate(g) {
    ctx.save();
    const topH = Math.max(0, g.gapY - 8);
    const bottomY = g.gapY + g.gapH + 8;
    const bottomH = Math.max(0, H - bottomY);
    drawCloudWall(g.x, 0, g.w, topH, false);
    drawCloudWall(g.x, bottomY, g.w, bottomH, true);
    if (qualityLevel > 0) {
      const centerY = g.gapY + g.gapH / 2;
      const glow = ctx.createRadialGradient(g.x + g.w / 2, centerY, 4, g.x + g.w / 2, centerY, 72);
      glow.addColorStop(0, 'rgba(255,255,255,.18)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow; ctx.fillRect(g.x - 35, g.gapY - 35, g.w + 70, g.gapH + 70);
    }
    ctx.restore();
  }
  function drawPickup(p) {
    ctx.save(); ctx.translate(p.x, p.y); const pulse = 1 + Math.sin(state.t / 150 + p.pulse) * .08; ctx.scale(pulse, pulse);
    if (p.type === 'coin') { ctx.shadowColor = '#ffd25a'; ctx.shadowBlur = Math.round(24 * quality().shadow); ctx.fillStyle = '#ffd25a'; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = '#fff2ad'; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = '#5d4214'; ctx.font = '900 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', 0, 1); }
    else if (p.type === 'shield') { ctx.shadowColor = '#8de9ff'; ctx.shadowBlur = Math.round(28 * quality().shadow); ctx.fillStyle = '#c9f7ff'; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = '#4c9fb4'; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = '#36768b'; ctx.font = '900 15px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('S', 0, 1); }
    else { ctx.shadowColor = '#ff7a86'; ctx.shadowBlur = Math.round(30 * quality().shadow); ctx.fillStyle = '#ff7a86'; ctx.beginPath(); ctx.arc(-6, -3, 9, 0, Math.PI * 2); ctx.arc(6, -3, 9, 0, Math.PI * 2); ctx.lineTo(0, 15); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.restore();
  }
  function drawTrail() { const s = skins[selectedSkin] || skins.royal; for (const t of trail) { ctx.globalAlpha = clamp(t.life / .48, 0, 1) * .42; ctx.fillStyle = s.trail; ctx.beginPath(); ctx.arc(t.x, t.y, t.s * (t.life / .48), 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1; }
  function drawPlayer() {
    const s = skins[selectedSkin] || skins.royal, wobble = Math.sin(state.t / 145) * .025, squash = clamp(Math.abs(player.vy) / 900, 0, .045), bob = Math.sin(state.t / 210) * 2.5;
    ctx.save(); ctx.translate(player.x + player.w / 2, player.y + player.h / 2 + bob); ctx.rotate(player.rot + wobble); ctx.scale(1 + squash, 1 - squash * .55); ctx.globalAlpha = player.inv > 0 && Math.floor(player.inv * 12) % 2 ? .45 : 1;
    ctx.shadowColor = s.aura; ctx.shadowBlur = Math.round((state.shield > 0 ? 42 : 24) * quality().shadow); if (babyImg && babyImg.complete && babyImg.naturalWidth) ctx.drawImage(babyImg, -player.w / 2, -player.h / 2, player.w, player.h); else { ctx.fillStyle = '#ffd25a'; ctx.beginPath(); ctx.arc(0, 0, 38, 0, Math.PI * 2); ctx.fill(); }
    ctx.shadowBlur = 0; if (state.shield > 0) { const rr = 65 + Math.sin(state.t / 90) * 4; ctx.strokeStyle = `rgba(141,233,255,${.65 + Math.sin(state.t / 110) * .2})`; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-12, -10, rr - 8, Math.PI * 1.05, Math.PI * 1.52); ctx.stroke(); }
    ctx.restore();
  }
  function drawFloatText() { ctx.save(); ctx.textAlign = 'center'; ctx.font = '900 17px Nunito,system-ui'; for (const f of floatText) { ctx.globalAlpha = clamp(f.life / .8, 0, 1); ctx.fillStyle = f.color; ctx.shadowColor = 'rgba(43,33,64,.35)'; ctx.shadowBlur = Math.round(8 * quality().shadow); ctx.fillText(f.text, f.x, f.y); } ctx.restore(); }
  function draw() {
    ctx.save(); if (state.shake) ctx.translate(vrand(-state.shake, state.shake), vrand(-state.shake, state.shake)); drawBg(); drawTrail(); for (const g of gates) drawGate(g); for (const p of pickups) drawPickup(p); drawPlayer();
    const particleStep = qualityLevel === 0 ? 2 : 1;
    for (let i = 0; i < particles.length; i += particleStep) { const p = particles[i]; ctx.globalAlpha = clamp(p.life / .7, 0, 1); ctx.fillStyle = p.color; if (qualityLevel === 0) ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.spin * p.life); ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.restore(); } } ctx.globalAlpha = 1; drawFloatText();
    if (state.flash) { ctx.fillStyle = `rgba(255,110,90,${state.flash})`; ctx.fillRect(0, 0, W, H); } ctx.restore();
  }
  function loop(now) { if (!state.running) return; samplePerformance(now); const frame = Math.min(.1, (now - last) / 1000 || DT); last = now; acc += frame; while (acc >= DT && state.running) { stepGame(); acc -= DT; } draw(); if (state.running) raf = requestAnimationFrame(loop); }

  function press(v) { if (v === hold) return; hold = v; if (state.running && mode === 'ranked') replayRaw.push([state.step, v ? 1 : 0]); if (v && state.running) { tone(300, .025, .015); burst(player.x + 22, player.y + player.h * .73, skins[selectedSkin].trail, 3); } }
  function tone(freq, dur = .05, vol = .04) { if (!soundOn) return; try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.frequency.value = freq; o.type = freq > 800 ? 'triangle' : 'sine'; g.gain.value = vol; o.connect(g); g.connect(audioCtx.destination); o.start(); g.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + dur); o.stop(audioCtx.currentTime + dur); } catch (_) {} }

  async function loadProfile() { if (!wallet) return; const d = await api({ action: 'profile', wallet }); profile = d.profile; $('nameInput').value = profile.displayName || 'TOTZ Player'; renderProfile(); renderSkins(); }
  function renderProfile() {
    const d = profile && profile.daily ? profile.daily : {};
    $('farmEarned').textContent = Number(d.farmEarned || 0).toFixed(2).replace(/\.00$/, ''); $('farmBar').style.width = `${Math.min(100, Number(d.farmEarned || 0) / 5 * 100)}%`; $('xp').textContent = `${Number(profile && profile.xp || 0)} XP`;
    [['mScore', d.missions && d.missions.score && d.missions.score.done], ['mCoins', d.missions && d.missions.coins && d.missions.coins.done], ['mSurvive', d.missions && d.missions.survive && d.missions.survive.done]].forEach(([id, done]) => { $(id).classList.toggle('done', !!done); $(id).querySelector('.check').textContent = done ? '✓' : '○'; });
  }
  function renderSkins() {
    const xp = Number(profile && profile.xp || 0); const root = $('skinGrid'); root.innerHTML = '';
    Object.entries(skins).forEach(([id, s]) => { const unlocked = xp >= s.need; const b = document.createElement('button'); b.className = `skin ${id === selectedSkin ? 'active' : ''} ${unlocked ? '' : 'locked'}`; b.style.color = s.aura; b.innerHTML = `<i style="background:${s.aura}"></i><strong>${s.name}</strong><span>${unlocked ? 'UNLOCKED' : s.need + ' XP'}</span>`; b.onclick = () => { selectedSkin = id; renderSkins(); status(unlocked ? `${s.name} equipped.` : `${s.name} selected for Practice. Ranked will use an unlocked skin.`); showCallout(`${s.name.toUpperCase()} CLOUD`, unlocked ? 'lime' : 'gold'); }; root.appendChild(b); });
  }
  async function loadLeaderboard(scope = 'all') {
    leaderScope = scope; document.querySelectorAll('[data-premium-scope]').forEach(b => b.classList.toggle('active', b.dataset.premiumScope === scope));
    try { const d = await api({ action: 'leaderboard', scope }); const rows = d.leaderboard || []; $('leaderboard').innerHTML = rows.length ? rows.map(r => `<div class="leader-row ${wallet && String(r.wallet).toLowerCase() === wallet ? 'me' : ''}"><b>#${r.rank}</b><span>${esc(r.display_name || short(r.wallet))}</span><strong>${Number(r.score || 0).toLocaleString()}</strong></div>`).join('') : '<div class="empty">No replay-verified runs yet.</div>'; } catch (_) { $('leaderboard').innerHTML = '<div class="empty">Leaderboard unavailable.</div>'; }
  }
  async function loadBaby() { try { const html = await fetch('/cloud-dash.html', { cache: 'force-cache' }).then(r => r.text()); const m = html.match(/const BABY_SRC='([^']+)'/); babyImg = new Image(); babyImg.src = m && m[1] ? m[1] : '/assets/totz-king.jpg'; } catch (_) { babyImg = new Image(); babyImg.src = '/assets/totz-king.jpg'; } }

  function boot() {
    injectPremiumUI();
    initPerformanceMode();
    $('best').textContent = state.best.toLocaleString();
    $('connectBtn').addEventListener('click', () => connectWallet().catch(e => status(e.message || String(e), true)));
    $('startBtn').addEventListener('click', startRun);
    $('restartBtn').addEventListener('click', () => { $('gameOver').hidden = true; $('startOverlay').hidden = false; $('newBestBadge')?.classList.remove('show'); status(mode === 'ranked' ? 'Ready for another Ranked run.' : 'Ready for Practice.'); });
    $('rankedMode').addEventListener('click', () => setMode('ranked'));
    $('practiceMode').addEventListener('click', () => setMode('practice'));
    $('soundBtn').addEventListener('click', () => { soundOn = !soundOn; $('soundBtn').textContent = soundOn ? '🔊 SOUND ON' : '🔇 SOUND OFF'; if (soundOn) chord([520, 690], .05, .02); });
    canvas.addEventListener('pointerdown', e => { e.preventDefault(); press(true); });
    window.addEventListener('pointerup', () => press(false));
    window.addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); press(true); } });
    window.addEventListener('keyup', e => { if (e.code === 'Space') press(false); });
    if (window.ethereum && window.ethereum.on) window.ethereum.on('accountsChanged', a => { wallet = a && a[0] ? a[0].toLowerCase() : null; $('walletChip').textContent = short(wallet); if (wallet) loadProfile().catch(() => {}); loadLeaderboard(leaderScope); });
    loadBaby(); renderProfile(); renderSkins(); loadLeaderboard('all'); setMode('ranked');
    bgClouds = [{ x: 80, y: 120, s: 1, v: 10, layer: 0 }, { x: 500, y: 230, s: .8, v: 10, layer: 1 }]; drawBg(); drawPlayer();
    status('Premium build loaded. Ranked button is active.');
  }

  window.addEventListener('error', (e) => status(`Game error: ${e.message}`, true));
  boot();
})();

(() => {
  'use strict';

  const API = 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/totz-game-preview';
  const CHAIN_ID = 4663;
  const CHAIN_HEX = '0x1237';
  const CONTRACT = '0x107c4e7cf931b18e022d40184d03d00b4ec99d5a';
  const W = 960, H = 540, FPS = 60, DT = 1 / FPS, DTMS = 1000 / FPS, MAXRUN = 180000;

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
  let gates = [], pickups = [], particles = [], bgClouds = [];
  let state = freshState();
  let player = freshPlayer();

  function freshState() {
    return { running: false, step: 0, t: 0, coins: 0, lives: 3, shield: 0, combo: 1, maxCombo: 1, comboTimer: 0, hits: 0, score: 0, speed: 225, spawn: .55, gateNo: 0, shake: 0, flash: 0, best: Number(localStorage.getItem('totzCloudDashV4Best') || 0) };
  }
  function freshPlayer() { return { x: 165, y: 190, w: 86, h: 155, vy: 0, inv: 0, rot: 0 }; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function esc(v) { return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function short(v) { return v ? `${v.slice(0, 6)}…${v.slice(-4)}` : 'NO WALLET'; }
  function status(msg, bad = false) { const el = $('status'); el.textContent = msg; el.classList.toggle('bad', bad); }
  function hexText(text) { return '0x' + Array.from(new TextEncoder().encode(text)).map(b => b.toString(16).padStart(2, '0')).join(''); }
  function scoreFormula() { return Math.max(0, Math.floor(Math.round(state.t) / 15) + state.coins * 120 + Math.max(0, state.maxCombo - 1) * 75 - state.hits * 100); }

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
    } finally {
      $('startBtn').disabled = false;
    }
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
    hold = false; replayRaw = [];
    const best = state.best;
    state = freshState(); state.best = best; state.running = true;
    player = freshPlayer(); gates = []; pickups = []; particles = []; bgClouds = [];
    for (let i = 0; i < 9; i++) bgClouds.push({ x: vrand(0, W), y: vrand(30, 360), s: vrand(.5, 1.35), v: vrand(10, 28) });
    $('startOverlay').hidden = true; $('gameOver').hidden = true; $('verified').classList.remove('show'); $('verified').classList.remove('bad');
    last = performance.now(); acc = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); tone(420, .06, .05);
  }

  function spawnGate() {
    const gapH = clamp(225 - state.t / 2500, 155, 225), gapY = rand(95, H - 95 - gapH), w = 82;
    gates.push({ x: W + 40, w, gapY, gapH, hit: false });
    const coinY = gapY + gapH * (.27 + gameRand() * .46);
    pickups.push({ type: 'coin', x: W + 40 + w / 2, y: coinY, r: 15, taken: false });
    state.gateNo++;
    if (state.gateNo % 6 === 0) pickups.push({ type: 'shield', x: W + 40 + w / 2 + 45, y: gapY + gapH / 2, r: 17, taken: false });
  }
  function hitGate(g) { const px = player.x + 20, py = player.y + 18, pw = player.w - 35, ph = player.h - 32; return px < g.x + g.w && px + pw > g.x && (py < g.gapY || py + ph > g.gapY + g.gapH); }
  function damage(g) {
    if (player.inv > 0 || g.hit) return true;
    g.hit = true;
    if (state.shield) { state.shield = 0; burst(player.x + 45, player.y + 70, skins[selectedSkin].aura, 14); tone(640, .08, .05); return true; }
    state.lives--; state.hits++; player.inv = 1.15; player.vy = -180; state.combo = 1; state.comboTimer = 0; state.shake = 10; state.flash = .22;
    burst(player.x + 45, player.y + 70, '#ff7a66', 18); tone(150, .12, .07);
    return state.lives > 0;
  }
  function collect(p) {
    if (p.taken) return; p.taken = true;
    if (p.type === 'coin') { state.coins++; state.combo = state.comboTimer > 0 ? Math.min(5, state.combo + 1) : 1; state.maxCombo = Math.max(state.maxCombo, state.combo); state.comboTimer = 2.4; burst(p.x, p.y, '#ffd25a', 10); tone(880, .04, .035); }
    else { state.shield = 1; burst(p.x, p.y, '#8de9ff', 16); tone(520, .1, .05); }
  }
  function burst(x, y, color, n) { for (let i = 0; i < n; i++) particles.push({ x, y, vx: vrand(-120, 120), vy: vrand(-120, 120), life: vrand(.35, .75), color, size: vrand(2, 6) }); }

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
    if (state.comboTimer > 0) { state.comboTimer -= DT; if (state.comboTimer <= 0) state.combo = 1; }
    if (!ended) for (const g of gates) { g.x -= state.speed * DT; if (hitGate(g) && !damage(g)) { ended = true; break; } }
    if (!ended) {
      gates = gates.filter(g => g.x > -120);
      for (const p of pickups) { p.x -= state.speed * DT; if (!p.taken) { const dx = player.x + 48 - p.x, dy = player.y + 76 - p.y; if (dx * dx + dy * dy < (p.r + 27) * (p.r + 27)) collect(p); } }
      pickups = pickups.filter(p => p.x > -70 && !p.taken);
    }
    for (const c of bgClouds) { c.x -= c.v * DT; if (c.x < -120) { c.x = W + vrand(20, 160); c.y = vrand(25, 360); } }
    for (const p of particles) { p.x += p.vx * DT; p.y += p.vy * DT; p.vy += 150 * DT; p.life -= DT; }
    particles = particles.filter(p => p.life > 0);
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
    if (state.score > state.best) { state.best = state.score; localStorage.setItem('totzCloudDashV4Best', String(state.best)); $('best').textContent = state.best.toLocaleString(); }
    $('endScore').textContent = state.score.toLocaleString(); $('endCoins').textContent = state.coins; $('endTime').textContent = `${Math.floor(state.t / 1000)}s`; $('endFarm').textContent = mode === 'ranked' ? 'VERIFYING…' : '—';
    $('gameOver').hidden = false;
    if (mode !== 'ranked' || !session || !finishToken || !wallet) { $('verified').textContent = 'Practice run. No leaderboard or farming.'; $('verified').classList.add('show'); return; }
    try {
      const inputs = normalizeInputs();
      const d = await api({ action: 'finish_ranked', wallet, sessionId: session.id, finishToken, steps: state.step, inputs, clientScore: state.score, clientCoins: state.coins, clientHits: state.hits, clientMaxCombo: state.maxCombo, skin: selectedSkin }, 22000);
      const r = d.serverResult || {};
      $('endScore').textContent = Number(r.score || 0).toLocaleString(); $('endCoins').textContent = Number(r.coins || 0); $('endTime').textContent = `${Math.floor(Number(r.survivalMs || 0) / 1000)}s`; $('endFarm').textContent = `+${Number(d.farmAwarded || 0).toFixed(2)} TEST`;
      $('verified').innerHTML = `✓ FULL REPLAY VERIFIED · ${esc(d.physicsVersion)} · ${inputs.length} inputs · ${esc(String(d.replayHash || '').slice(0, 18))}…`;
      $('verified').classList.add('show'); profile = d.profile || profile; renderProfile(); renderSkins(); loadLeaderboard();
    } catch (e) {
      console.error(e); $('endFarm').textContent = 'REJECTED'; $('verified').textContent = `Replay rejected: ${e.message || e}`; $('verified').classList.add('show', 'bad');
    } finally { session = null; finishToken = null; }
  }

  function syncHud() { $('score').textContent = state.score.toLocaleString(); $('coins').textContent = state.coins; $('combo').textContent = `x${state.combo}`; $('life').textContent = '❤️'.repeat(state.lives) + (state.shield ? '🛡️' : ''); $('time').textContent = `${Math.floor(state.t / 1000)}s`; }

  function drawCloud(x, y, s, a = .7) { ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 35 * s, 0, Math.PI * 2); ctx.arc(x + 35 * s, y - 10 * s, 45 * s, 0, Math.PI * 2); ctx.arc(x + 78 * s, y, 34 * s, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  function drawBg() { const grad = ctx.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, '#91d8e8'); grad.addColorStop(.62, '#d8f2f5'); grad.addColorStop(1, '#fff1cf'); ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H); for (const c of bgClouds) drawCloud(c.x, c.y, c.s, .45); }
  function drawGate(g) { ctx.save(); ctx.fillStyle = '#4b526f'; ctx.fillRect(g.x, 0, g.w, g.gapY - 8); ctx.fillRect(g.x, g.gapY + g.gapH + 8, g.w, H); ctx.fillStyle = '#68718e'; for (let y = 18; y < g.gapY - 18; y += 38) { ctx.beginPath(); ctx.arc(g.x + g.w / 2, y, 25, 0, Math.PI * 2); ctx.fill(); } for (let y = g.gapY + g.gapH + 25; y < H; y += 38) { ctx.beginPath(); ctx.arc(g.x + g.w / 2, y, 25, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); }
  function drawPickup(p) { ctx.save(); ctx.translate(p.x, p.y); if (p.type === 'coin') { ctx.fillStyle = '#ffd25a'; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#a56d10'; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = '#5d4214'; ctx.font = '900 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', 0, 1); } else { ctx.fillStyle = '#bff3ff'; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#4c9fb4'; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = '#36768b'; ctx.font = '900 15px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('S', 0, 1); } ctx.restore(); }
  function drawPlayer() { const s = skins[selectedSkin] || skins.royal; ctx.save(); ctx.translate(player.x + player.w / 2, player.y + player.h / 2); ctx.rotate(player.rot); ctx.globalAlpha = player.inv > 0 && Math.floor(player.inv * 12) % 2 ? .45 : 1; ctx.shadowColor = s.aura; ctx.shadowBlur = state.shield ? 34 : 20; if (babyImg && babyImg.complete && babyImg.naturalWidth) ctx.drawImage(babyImg, -player.w / 2, -player.h / 2, player.w, player.h); else { ctx.fillStyle = '#ffd25a'; ctx.beginPath(); ctx.arc(0, 0, 38, 0, Math.PI * 2); ctx.fill(); } ctx.shadowBlur = 0; if (state.shield) { ctx.strokeStyle = '#8de9ff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, 64, 0, Math.PI * 2); ctx.stroke(); } ctx.restore(); }
  function draw() { ctx.save(); if (state.shake) ctx.translate(vrand(-state.shake, state.shake), vrand(-state.shake, state.shake)); drawBg(); for (const g of gates) drawGate(g); for (const p of pickups) drawPickup(p); drawPlayer(); for (const p of particles) { ctx.globalAlpha = clamp(p.life / .6, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); } ctx.globalAlpha = 1; if (state.flash) { ctx.fillStyle = `rgba(255,110,90,${state.flash})`; ctx.fillRect(0, 0, W, H); } ctx.restore(); }
  function loop(now) { if (!state.running) return; const frame = Math.min(.1, (now - last) / 1000 || DT); last = now; acc += frame; while (acc >= DT && state.running) { stepGame(); acc -= DT; } draw(); if (state.running) raf = requestAnimationFrame(loop); }

  function press(v) { if (v === hold) return; hold = v; if (state.running && mode === 'ranked') replayRaw.push([state.step, v ? 1 : 0]); if (v && state.running) tone(300, .025, .015); }
  function tone(freq, dur = .05, vol = .04) { if (!soundOn) return; try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.frequency.value = freq; g.gain.value = vol; o.connect(g); g.connect(audioCtx.destination); o.start(); g.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + dur); o.stop(audioCtx.currentTime + dur); } catch (_) {} }

  async function loadProfile() {
    if (!wallet) return;
    const d = await api({ action: 'profile', wallet }); profile = d.profile; $('nameInput').value = profile.displayName || 'TOTZ Player'; renderProfile(); renderSkins();
  }
  function renderProfile() {
    const d = profile && profile.daily ? profile.daily : {};
    $('farmEarned').textContent = Number(d.farmEarned || 0).toFixed(2).replace(/\.00$/, ''); $('farmBar').style.width = `${Math.min(100, Number(d.farmEarned || 0) / 5 * 100)}%`; $('xp').textContent = `${Number(profile && profile.xp || 0)} XP`;
    [['mScore', d.missions && d.missions.score && d.missions.score.done], ['mCoins', d.missions && d.missions.coins && d.missions.coins.done], ['mSurvive', d.missions && d.missions.survive && d.missions.survive.done]].forEach(([id, done]) => { $(id).classList.toggle('done', !!done); $(id).querySelector('.check').textContent = done ? '✓' : '○'; });
  }
  function renderSkins() {
    const xp = Number(profile && profile.xp || 0); const root = $('skinGrid'); root.innerHTML = '';
    Object.entries(skins).forEach(([id, s]) => { const unlocked = xp >= s.need; const b = document.createElement('button'); b.className = `skin ${id === selectedSkin ? 'active' : ''} ${unlocked ? '' : 'locked'}`; b.innerHTML = `<i style="background:${s.aura}"></i><strong>${s.name}</strong><span>${unlocked ? 'UNLOCKED' : s.need + ' XP'}</span>`; b.onclick = () => { selectedSkin = id; renderSkins(); status(unlocked ? `${s.name} equipped.` : `${s.name} selected for Practice. Ranked will use an unlocked skin.`); }; root.appendChild(b); });
  }
  async function loadLeaderboard() {
    try { const d = await api({ action: 'leaderboard', scope: 'all' }); const rows = d.leaderboard || []; $('leaderboard').innerHTML = rows.length ? rows.map(r => `<div class="leader-row"><b>#${r.rank}</b><span>${esc(r.display_name || short(r.wallet))}</span><strong>${Number(r.score || 0).toLocaleString()}</strong></div>`).join('') : '<div class="empty">No replay-verified runs yet.</div>'; } catch (_) { $('leaderboard').innerHTML = '<div class="empty">Leaderboard unavailable.</div>'; }
  }
  async function loadBaby() {
    try { const html = await fetch('/cloud-dash.html', { cache: 'force-cache' }).then(r => r.text()); const m = html.match(/const BABY_SRC='([^']+)'/); babyImg = new Image(); babyImg.src = m && m[1] ? m[1] : '/assets/totz-king.jpg'; } catch (_) { babyImg = new Image(); babyImg.src = '/assets/totz-king.jpg'; }
  }

  function boot() {
    $('best').textContent = state.best.toLocaleString();
    $('connectBtn').addEventListener('click', () => connectWallet().catch(e => status(e.message || String(e), true)));
    $('startBtn').addEventListener('click', startRun);
    $('restartBtn').addEventListener('click', () => { $('gameOver').hidden = true; $('startOverlay').hidden = false; status(mode === 'ranked' ? 'Ready for another Ranked run.' : 'Ready for Practice.'); });
    $('rankedMode').addEventListener('click', () => setMode('ranked'));
    $('practiceMode').addEventListener('click', () => setMode('practice'));
    $('soundBtn').addEventListener('click', () => { soundOn = !soundOn; $('soundBtn').textContent = soundOn ? '🔊 SOUND ON' : '🔇 SOUND OFF'; });
    canvas.addEventListener('pointerdown', e => { e.preventDefault(); press(true); });
    window.addEventListener('pointerup', () => press(false));
    window.addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); press(true); } });
    window.addEventListener('keyup', e => { if (e.code === 'Space') press(false); });
    if (window.ethereum && window.ethereum.on) window.ethereum.on('accountsChanged', a => { wallet = a && a[0] ? a[0].toLowerCase() : null; $('walletChip').textContent = short(wallet); if (wallet) loadProfile().catch(() => {}); });
    loadBaby(); renderProfile(); renderSkins(); loadLeaderboard(); setMode('ranked');
    bgClouds = [{ x: 80, y: 120, s: 1, v: 10 }, { x: 500, y: 230, s: .8, v: 10 }]; drawBg(); drawPlayer();
    status('V4 loaded. Ranked button is active.');
  }

  window.addEventListener('error', (e) => status(`Game error: ${e.message}`, true));
  boot();
})();

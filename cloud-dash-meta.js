(() => {
  'use strict';

  const KEY = 'totzCloudDashPilotV1';
  const DAY_MS = 86400000;
  const $ = (id) => document.getElementById(id);

  const defaultPilot = () => ({
    runs: 0,
    totalCoins: 0,
    totalSeconds: 0,
    bestScore: 0,
    bestCombo: 1,
    cleanRuns: 0,
    longestRun: 0,
    streak: 0,
    lastRunDate: '',
    badges: {}
  });

  function loadPilot() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      return { ...defaultPilot(), ...raw, badges: { ...(raw.badges || {}) } };
    } catch (_) {
      return defaultPilot();
    }
  }

  let pilot = loadPilot();
  let countedVisibleRun = false;

  function savePilot() {
    try { localStorage.setItem(KEY, JSON.stringify(pilot)); } catch (_) {}
  }

  function todayKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function dayDiff(a, b) {
    if (!a || !b) return 999;
    const [ay, am, ad] = a.split('-').map(Number);
    const [by, bm, bd] = b.split('-').map(Number);
    const A = Date.UTC(ay, am - 1, ad);
    const B = Date.UTC(by, bm - 1, bd);
    return Math.round((B - A) / DAY_MS);
  }

  function num(text) {
    const n = Number(String(text || '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function rankInfo() {
    const r = pilot.runs;
    if (r >= 60) return { name: 'TOTZ ACE', next: null, pct: 100 };
    if (r >= 30) return { name: 'STORM PILOT', next: 60, pct: ((r - 30) / 30) * 100 };
    if (r >= 15) return { name: 'SKY RACER', next: 30, pct: ((r - 15) / 15) * 100 };
    if (r >= 5) return { name: 'CLOUD RIDER', next: 15, pct: ((r - 5) / 10) * 100 };
    return { name: 'ROOKIE', next: 5, pct: (r / 5) * 100 };
  }

  const badgeDefs = [
    { id: 'first', icon: '☁️', name: 'First Flight', hint: 'Finish 1 run', test: () => pilot.runs >= 1 },
    { id: 'score5k', icon: '🎯', name: '5K Club', hint: 'Score 5,000', test: () => pilot.bestScore >= 5000 },
    { id: 'coins100', icon: '🪙', name: 'Coin Magnet', hint: 'Collect 100 total', test: () => pilot.totalCoins >= 100 },
    { id: 'air600', icon: '⏱️', name: 'Air Time', hint: 'Fly 10 minutes', test: () => pilot.totalSeconds >= 600 },
    { id: 'combo5', icon: '🔥', name: 'Combo King', hint: 'Reach combo x5', test: () => pilot.bestCombo >= 5 },
    { id: 'clean', icon: '✨', name: 'Clean Sky', hint: '2,500+ with 0 hits', test: () => pilot.cleanRuns >= 1 }
  ];

  function unlockBadges() {
    const newly = [];
    for (const b of badgeDefs) {
      if (b.test() && !pilot.badges[b.id]) {
        pilot.badges[b.id] = Date.now();
        newly.push(b);
      }
    }
    if (newly.length) {
      savePilot();
      showUnlock(newly[0]);
    }
  }

  function showUnlock(badge) {
    let pop = $('pilotUnlock');
    if (!pop) return;
    pop.innerHTML = `<b>${badge.icon} BADGE UNLOCKED</b><span>${badge.name}</span>`;
    pop.classList.remove('show');
    void pop.offsetWidth;
    pop.classList.add('show');
  }

  function injectUI() {
    if ($('pilotProfileCard')) return;

    const style = document.createElement('style');
    style.textContent = `
      .pilot-card{position:relative;overflow:hidden}
      .pilot-head{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px}
      .pilot-rank{display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border-radius:999px;background:#2b2140;color:#fff;font-size:.6rem;font-weight:1000;letter-spacing:.05em}
      .pilot-streak{font-size:.66rem;font-weight:1000;color:#8a5b13;background:#fff1b8;padding:5px 8px;border-radius:999px}
      .pilot-progress{height:7px;border-radius:999px;background:#fff3dc;overflow:hidden;margin:8px 0 10px}.pilot-progress i{display:block;height:100%;width:0;background:linear-gradient(90deg,#8ed2e2,#cbdb2a,#ffd25a);border-radius:inherit;transition:width .35s ease}
      .pilot-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}.pilot-stat{background:#fff8ec;border-radius:11px;padding:7px}.pilot-stat small{display:block;color:#665b78;font-size:.52rem;font-weight:900}.pilot-stat b{display:block;font-size:.8rem;margin-top:1px}
      .pilot-badges{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:9px}.pilot-badge{min-width:0;background:#f5f1eb;border:1px solid #ece5da;border-radius:11px;padding:7px;text-align:center;opacity:.44;filter:grayscale(1)}.pilot-badge.on{opacity:1;filter:none;background:#fff7cf;border-color:#f1d66d}.pilot-badge i{display:block;font-style:normal;font-size:1.05rem;line-height:1}.pilot-badge strong{display:block;font-size:.52rem;line-height:1.1;margin-top:4px}.pilot-badge span{display:block;color:#665b78;font-size:.46rem;line-height:1.1;margin-top:2px}
      .pilot-foot{margin-top:8px;color:#665b78;font-size:.54rem;font-weight:800;line-height:1.35}
      .pilot-unlock{position:absolute;z-index:12;left:50%;top:18%;transform:translate(-50%,-20px) scale(.85);display:flex;flex-direction:column;gap:2px;align-items:center;pointer-events:none;opacity:0;background:#2b2140;color:#fff;border:2px solid #ffd25a;border-radius:16px;padding:10px 14px;box-shadow:0 16px 40px rgba(43,33,64,.25);white-space:nowrap}.pilot-unlock b{font-size:.56rem;color:#ffd25a}.pilot-unlock span{font-size:.78rem;font-weight:1000}.pilot-unlock.show{animation:pilotUnlock 2.2s ease both}@keyframes pilotUnlock{0%{opacity:0;transform:translate(-50%,5px) scale(.82)}12%,72%{opacity:1;transform:translate(-50%,0) scale(1)}100%{opacity:0;transform:translate(-50%,-18px) scale(.94)}}
      @media(max-width:650px){.pilot-badges{grid-template-columns:repeat(3,1fr)}}
    `;
    document.head.appendChild(style);

    const left = document.querySelector('.grid > aside.side');
    if (!left) return;
    const card = document.createElement('section');
    card.className = 'card pilot-card';
    card.id = 'pilotProfileCard';
    card.innerHTML = `
      <div id="pilotUnlock" class="pilot-unlock"></div>
      <div class="pilot-head"><h3 style="margin:0">Pilot Profile</h3><span class="pilot-streak" id="pilotStreak">🔥 0 DAY</span></div>
      <div class="pilot-rank" id="pilotRank">☁️ ROOKIE</div>
      <div class="pilot-progress"><i id="pilotRankBar"></i></div>
      <div class="pilot-stats">
        <div class="pilot-stat"><small>RUNS</small><b id="pilotRuns">0</b></div>
        <div class="pilot-stat"><small>BEST</small><b id="pilotBest">0</b></div>
        <div class="pilot-stat"><small>LIFETIME COINS</small><b id="pilotCoins">0</b></div>
        <div class="pilot-stat"><small>AIR TIME</small><b id="pilotTime">0m</b></div>
      </div>
      <div class="pilot-badges" id="pilotBadges"></div>
      <div class="pilot-foot">Local progression only · stored in this browser · no extra server requests.</div>
    `;
    left.appendChild(card);
    renderPilot();
  }

  function renderPilot() {
    const rank = rankInfo();
    if (!$('pilotRuns')) return;
    $('pilotRuns').textContent = pilot.runs.toLocaleString();
    $('pilotBest').textContent = pilot.bestScore.toLocaleString();
    $('pilotCoins').textContent = pilot.totalCoins.toLocaleString();
    $('pilotTime').textContent = pilot.totalSeconds < 60 ? `${pilot.totalSeconds}s` : `${Math.floor(pilot.totalSeconds / 60)}m`;
    $('pilotRank').textContent = `☁️ ${rank.name}`;
    $('pilotRankBar').style.width = `${Math.max(0, Math.min(100, rank.pct))}%`;
    $('pilotStreak').textContent = `🔥 ${pilot.streak} DAY${pilot.streak === 1 ? '' : 'S'}`;
    $('pilotBadges').innerHTML = badgeDefs.map(b => {
      const on = !!pilot.badges[b.id];
      return `<div class="pilot-badge ${on ? 'on' : ''}" title="${b.hint}"><i>${b.icon}</i><strong>${b.name}</strong><span>${on ? 'UNLOCKED' : b.hint}</span></div>`;
    }).join('');
  }

  function updateStreak() {
    const today = todayKey();
    if (pilot.lastRunDate === today) return;
    const diff = dayDiff(pilot.lastRunDate, today);
    pilot.streak = diff === 1 ? Math.max(1, pilot.streak + 1) : 1;
    pilot.lastRunDate = today;
  }

  function captureRun() {
    const score = num($('endScore')?.textContent);
    const coins = Math.max(0, Math.round(num($('endCoins')?.textContent)));
    const seconds = Math.max(0, Math.round(num($('endTime')?.textContent)));
    const combo = Math.max(1, Math.round(num($('endCombo')?.textContent) || 1));
    const hits = Math.max(0, Math.round(num($('endHits')?.textContent)));

    pilot.runs += 1;
    pilot.totalCoins += coins;
    pilot.totalSeconds += seconds;
    pilot.bestScore = Math.max(pilot.bestScore, score);
    pilot.bestCombo = Math.max(pilot.bestCombo, combo);
    pilot.longestRun = Math.max(pilot.longestRun, seconds);
    if (score >= 2500 && hits === 0) pilot.cleanRuns += 1;
    updateStreak();
    savePilot();
    unlockBadges();
    renderPilot();
  }

  function watchRuns() {
    const over = $('gameOver');
    if (!over) return;
    const sync = () => {
      const visible = !over.hidden;
      if (visible && !countedVisibleRun) {
        countedVisibleRun = true;
        // Core game fills the result fields before showing the overlay.
        setTimeout(captureRun, 30);
      } else if (!visible) {
        countedVisibleRun = false;
      }
    };
    new MutationObserver(sync).observe(over, { attributes: true, attributeFilter: ['hidden'] });
    sync();
  }

  function bootMeta() {
    injectUI();
    unlockBadges();
    renderPilot();
    watchRuns();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootMeta, { once: true });
  else bootMeta();
})();

(() => {
  if (document.getElementById('earnings-calculator')) return;

  const ECONOMY_API = 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/totz-staking-economy';
  let base = 1;
  let legendary = 1.5;
  const LEGENDARY_SUPPLY = 36;

  const style = document.createElement('style');
  style.textContent = `
    .earnings-home{max-width:1100px;margin:0 auto;padding:8px 6vw 72px}
    .earnings-shell{background:rgba(255,255,255,.94);border:2.5px solid var(--sky-deep,#8ED2E2);border-radius:30px;padding:32px;box-shadow:var(--shadow,0 14px 32px rgba(43,33,64,.12))}
    .earnings-top{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:22px}
    .earnings-top .section-head{text-align:left;margin:0;max-width:680px}
    .earnings-top .section-head p{margin-bottom:0}
    .live-economy{display:inline-flex;align-items:center;gap:7px;background:var(--lime,#CBDB2A);padding:8px 12px;border-radius:999px;font-size:.72rem;font-weight:900;white-space:nowrap}
    .live-economy::before{content:'';width:8px;height:8px;border-radius:50%;background:var(--coral-deep,#F0533D);box-shadow:0 0 0 4px rgba(240,83,61,.12)}
    .rate-cards{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
    .rate-card{background:var(--cream,#FFF3DC);border:1.5px solid rgba(43,33,64,.08);border-radius:20px;padding:18px}
    .rate-card .rate-label{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--ink-soft,#5B5270);font-size:.73rem;font-weight:900;text-transform:uppercase;letter-spacing:.05em}
    .rate-card strong{display:block;font-family:'Baloo 2',cursive;font-size:1.7rem;line-height:1;margin-top:9px;color:var(--ink,#2B2140)}
    .rate-card p{margin:7px 0 0;color:var(--ink-soft,#5B5270);font-size:.8rem;font-weight:750;line-height:1.45}
    .rate-tag{display:inline-flex;padding:4px 7px;border-radius:999px;background:#fff;font-size:.63rem;color:var(--ink,#2B2140);font-weight:900}
    .loyalty-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0 22px}
    .loyalty-chip{background:#fff;border:1.5px solid rgba(43,33,64,.10);border-radius:16px;padding:11px 12px;text-align:center}
    .loyalty-chip b{display:block;font-family:'Baloo 2',cursive;font-size:.95rem}
    .loyalty-chip span{display:block;margin-top:1px;color:var(--ink-soft,#5B5270);font-size:.67rem;font-weight:900}
    .calc-layout{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(300px,.95fr);gap:14px;align-items:stretch}
    .calc-card,.calc-result{border-radius:23px;padding:20px;border:1.5px solid rgba(43,33,64,.09)}
    .calc-card{background:var(--cream,#FFF3DC)}
    .calc-card h3,.calc-result h3{font-size:1.32rem;margin:0 0 4px;font-family:'Baloo 2',cursive}
    .calc-sub{margin:0 0 16px;color:var(--ink-soft,#5B5270);font-size:.79rem;font-weight:750;line-height:1.45}
    .calc-fields{display:grid;grid-template-columns:repeat(2,1fr);gap:9px}
    .calc-field label,.calc-loyalty label{display:block;margin-bottom:5px;color:var(--ink-soft,#5B5270);font-size:.68rem;font-weight:900;text-transform:uppercase;letter-spacing:.045em}
    .calc-field input,.calc-loyalty select{width:100%;height:46px;border:2px solid rgba(43,33,64,.13);background:#fff;color:var(--ink,#2B2140);border-radius:13px;padding:0 12px;font-family:'Nunito',sans-serif;font-size:.95rem;font-weight:900;outline:none}
    .calc-field input:focus,.calc-loyalty select:focus{border-color:var(--sky-deep,#8ED2E2);box-shadow:0 0 0 3px rgba(142,210,226,.17)}
    .calc-loyalty{margin-top:10px}
    .calc-result{background:var(--ink,#2B2140);color:#fff;display:flex;flex-direction:column;justify-content:center}
    .calc-result .calc-sub{color:rgba(255,255,255,.70);margin-bottom:17px}
    .estimate-main{padding:14px 0 16px;border-top:1px solid rgba(255,255,255,.12);border-bottom:1px solid rgba(255,255,255,.12)}
    .estimate-main span{display:block;color:rgba(255,255,255,.66);font-size:.68rem;font-weight:900;text-transform:uppercase;letter-spacing:.07em}
    .estimate-main strong{display:block;font-family:'Baloo 2',cursive;font-size:2.6rem;line-height:1.05;margin-top:4px;color:var(--lime,#CBDB2A)}
    .estimate-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
    .estimate-small{background:rgba(255,255,255,.08);border-radius:14px;padding:10px 12px}
    .estimate-small span{display:block;color:rgba(255,255,255,.62);font-size:.64rem;font-weight:900;text-transform:uppercase}
    .estimate-small b{display:block;margin-top:2px;font-family:'Baloo 2',cursive;font-size:1.08rem}
    .calc-note{margin:13px 0 0;color:rgba(255,255,255,.66);font-size:.68rem;font-weight:750;line-height:1.45}
    @media(max-width:860px){
      .earnings-top{flex-direction:column;align-items:flex-start}
      .rate-cards{grid-template-columns:1fr}
      .loyalty-strip{grid-template-columns:1fr 1fr}
      .calc-layout{grid-template-columns:1fr}
      .calc-fields{grid-template-columns:1fr}
      .earnings-shell{padding:22px}
    }
  `;
  document.head.appendChild(style);

  const section = document.createElement('section');
  section.className = 'earnings-home';
  section.id = 'earnings-calculator';
  section.innerHTML = `
    <div class="earnings-shell">
      <div class="earnings-top">
        <div class="section-head">
          <span class="eyebrow">⚡ $TOTZ EARNINGS</span>
          <h2>Know your rate.</h2>
          <p>Regular TOTZ earn the base rate. The 36 Legendary TOTZ are the collection's unique 1/1s and receive one special multiplier.</p>
        </div>
        <span class="live-economy" id="economyStatus">LIVE ECONOMY</span>
      </div>

      <div class="rate-cards">
        <article class="rate-card">
          <div class="rate-label"><span>Regular TOTZ</span><span class="rate-tag">BASE</span></div>
          <strong><span id="regularRate">1</span> / day</strong>
          <p>Standard earning rate for every regular TOTZ while soft staked.</p>
        </article>
        <article class="rate-card">
          <div class="rate-label"><span>Legendary · 1/1</span><span class="rate-tag" id="legendaryMult">1.5×</span></div>
          <strong><span id="legendaryRate">1.5</span> / day</strong>
          <p>There are <strong style="display:inline;font:inherit">36 Legendary TOTZ</strong>. Each is a unique 1/1 and earns the Legendary boost.</p>
        </article>
      </div>

      <div class="loyalty-strip" aria-label="Loyalty bonus tiers">
        <div class="loyalty-chip"><b>Day 0</b><span>Base rate</span></div>
        <div class="loyalty-chip"><b>7 Days</b><span>+5% loyalty</span></div>
        <div class="loyalty-chip"><b>30 Days</b><span>+10% loyalty</span></div>
        <div class="loyalty-chip"><b>90+ Days</b><span>+15% loyalty</span></div>
      </div>

      <div class="calc-layout">
        <div class="calc-card">
          <h3>Earnings calculator</h3>
          <p class="calc-sub">Enter the Regular and Legendary TOTZ you plan to stake, then choose a streak tier.</p>
          <div class="calc-fields">
            <div class="calc-field">
              <label for="calcRegular">Regular</label>
              <input id="calcRegular" type="number" min="0" max="4000" step="1" value="1" inputmode="numeric">
            </div>
            <div class="calc-field">
              <label for="calcLegendary">Legendary · 1/1 (max 36)</label>
              <input id="calcLegendary" type="number" min="0" max="36" step="1" value="0" inputmode="numeric">
            </div>
          </div>
          <div class="calc-loyalty">
            <label for="calcLoyalty">Estimated loyalty streak</label>
            <select id="calcLoyalty">
              <option value="1">Day 0 — Base</option>
              <option value="1.05">7 Days — +5%</option>
              <option value="1.10">30 Days — +10%</option>
              <option value="1.15">90+ Days — +15%</option>
            </select>
          </div>
        </div>

        <div class="calc-result" aria-live="polite">
          <h3>Your estimate</h3>
          <p class="calc-sub">Based on the current $TOTZ staking economy.</p>
          <div class="estimate-main">
            <span>Estimated daily</span>
            <strong><span id="calcDaily">1</span> $TOTZ</strong>
          </div>
          <div class="estimate-grid">
            <div class="estimate-small"><span>7 Days</span><b><span id="calcWeekly">7</span> $TOTZ</b></div>
            <div class="estimate-small"><span>30 Days</span><b><span id="calcMonthly">30</span> $TOTZ</b></div>
          </div>
          <p class="calc-note">Estimate only. Loyalty is tracked per NFT, so wallets with mixed staking dates can have different rates across their TOTZ.</p>
        </div>
      </div>
    </div>`;

  const stakingSection = document.querySelector('.staking-home');
  if (stakingSection) stakingSection.insertAdjacentElement('afterend', section);
  else document.querySelector('footer')?.insertAdjacentElement('beforebegin', section);

  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
  const regularCount = () => Math.max(0, Math.min(4000, Math.floor(Number($('calcRegular')?.value || 0))));
  const legendaryCount = () => Math.max(0, Math.min(LEGENDARY_SUPPLY, Math.floor(Number($('calcLegendary')?.value || 0))));

  function refreshCalculator() {
    const loyalty = Math.max(1, Number($('calcLoyalty')?.value || 1));
    const dailyBase = regularCount() * base + legendaryCount() * base * legendary;
    const daily = dailyBase * loyalty;
    $('calcDaily').textContent = fmt(daily);
    $('calcWeekly').textContent = fmt(daily * 7);
    $('calcMonthly').textContent = fmt(daily * 30);
  }

  ['calcRegular', 'calcLegendary', 'calcLoyalty'].forEach((id) => {
    $(id)?.addEventListener(id === 'calcLoyalty' ? 'change' : 'input', refreshCalculator);
  });

  async function loadEconomy() {
    try {
      const res = await fetch(ECONOMY_API, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Economy unavailable');
      const economy = data.economy || {};
      base = Number(economy.baseRatePerDay || 1);
      legendary = Number(economy.specialTiers?.legendary?.multiplier || 1.5);
      $('regularRate').textContent = fmt(base);
      $('legendaryMult').textContent = `${fmt(legendary)}×`;
      $('legendaryRate').textContent = fmt(base * legendary);
      $('economyStatus').textContent = 'LIVE ECONOMY';
    } catch (_) {
      $('economyStatus').textContent = 'CURRENT ECONOMY';
    }
    refreshCalculator();
  }

  refreshCalculator();
  loadEconomy();
})();
(() => {
  const $ = (id) => document.getElementById(id);
  const ACCESS_EVENT = 'totz-forge-access';
  let latest = null;
  let result = null;

  const fmt = (n, max = 0) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: max });
  const short = (a) => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—';
  const isAddress = (v) => /^0x[a-fA-F0-9]{40}$/.test(String(v || ''));
  const genesisUnlocked = () => Boolean(window.__totzForgeAccess?.genesis);

  function toast(message) {
    const el = $('toast');
    if (!el) return alert(message);
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function installStyle() {
    if ($('forge-epochs-style')) return;
    const style = document.createElement('style');
    style.id = 'forge-epochs-style';
    style.textContent = `
      .module.forge-epochs-launch{cursor:pointer;position:relative;border-style:solid;background:linear-gradient(145deg,#fff,#fff8ea);transition:.16s ease}
      .module.forge-epochs-launch:hover{transform:translateY(-2px);box-shadow:var(--shadow-sm,0 8px 20px rgba(43,33,64,.09))}
      .forge-module-status{position:absolute;right:12px;top:11px;padding:5px 8px;border-radius:999px;background:var(--lime,#CBDB2A);font-size:.55rem;font-weight:900;letter-spacing:.04em}
      .forge-epochs{margin-top:18px;background:#fff;border:2.5px solid var(--sky2,#8ED2E2);border-radius:30px;padding:24px;box-shadow:var(--shadow,0 14px 34px rgba(43,33,64,.12))}
      .forge-epochs[hidden]{display:none!important}
      .epochs-hero{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:17px}
      .epochs-hero h2{font-size:1.8rem;margin:0}.epochs-hero p{margin:4px 0 0;color:var(--soft,#5B5270);font-size:.82rem;font-weight:800;line-height:1.45;max-width:720px}
      .epochs-badge{background:var(--ink,#2B2140);color:#fff;border-radius:999px;padding:7px 10px;font-size:.61rem;font-weight:900;white-space:nowrap}
      .epochs-source{display:grid;grid-template-columns:1.5fr repeat(3,.7fr);gap:8px;margin-bottom:14px}
      .epochs-source>div,.epochs-stat{background:var(--cream,#FFF3DC);border-radius:17px;padding:12px;min-width:0}
      .epochs-source small,.epochs-stat small{display:block;color:var(--soft,#5B5270);font-size:.55rem;font-weight:900;letter-spacing:.05em;text-transform:uppercase}
      .epochs-source b,.epochs-stat b{display:block;margin-top:4px;font-family:'Baloo 2',cursive;font-size:1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .epochs-builder-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .epochs-box{border:1px solid rgba(43,33,64,.09);border-radius:21px;padding:16px;background:#fff}
      .epochs-box h3{margin:0 0 3px;font-size:1.05rem}.epochs-box>p{margin:0 0 12px;color:var(--soft,#5B5270);font-size:.67rem;font-weight:800;line-height:1.4}
      .epochs-fields{display:grid;grid-template-columns:1fr 1fr;gap:9px}.epochs-field{min-width:0}.epochs-field.full{grid-column:1/-1}
      .epochs-field label{display:block;margin:0 0 5px;color:var(--soft,#5B5270);font-size:.58rem;font-weight:900;letter-spacing:.045em;text-transform:uppercase}
      .epochs-field input,.epochs-field select,.epochs-field textarea{width:100%;border:2px solid var(--sky2,#8ED2E2);border-radius:14px;padding:10px 11px;background:var(--cream,#FFF3DC);color:var(--ink,#2B2140);outline:0;font-size:.76rem;font-weight:800}
      .epochs-field textarea{min-height:98px;resize:vertical;font-family:monospace;font-size:.69rem;line-height:1.45}
      .epochs-field input:focus,.epochs-field select:focus,.epochs-field textarea:focus{border-color:var(--coral,#FF715F)}
      .epochs-field.locked{opacity:.52}.epochs-field.locked input,.epochs-field.locked select,.epochs-field.locked textarea{cursor:not-allowed}
      .epochs-lock-note{display:none;margin-top:9px;border-radius:13px;padding:9px 10px;background:#F1ECF7;color:var(--soft,#5B5270);font-size:.64rem;font-weight:900;line-height:1.4}.epochs-lock-note.show{display:block}
      .epochs-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.epochs-actions .btn.locked{opacity:.55}
      .epochs-status{display:none;margin-top:12px;border-radius:14px;padding:10px 12px;font-size:.7rem;font-weight:900;line-height:1.4}.epochs-status.show{display:block}.epochs-status.ok{background:#EDF5C8}.epochs-status.warn{background:#FFF0C9}.epochs-status.error{background:#FFDEDA;color:#8D2B1F}
      .epochs-results{margin-top:15px;border-top:1px solid rgba(43,33,64,.09);padding-top:15px}.epochs-results[hidden]{display:none!important}
      .epochs-stats{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:11px}.epochs-stat{background:#fff;border:1px solid rgba(43,33,64,.08)}
      .epochs-fingerprint{display:flex;justify-content:space-between;align-items:center;gap:10px;background:linear-gradient(90deg,#E7F4EF,var(--sky,#BFE6EE));border-radius:15px;padding:10px 12px;margin-bottom:11px;font-size:.64rem;font-weight:900}.epochs-fingerprint code{font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .epochs-table-wrap{overflow:auto;border:1px solid rgba(43,33,64,.08);border-radius:18px}.epochs-table{width:100%;border-collapse:collapse;min-width:720px}.epochs-table th,.epochs-table td{padding:10px 12px;border-bottom:1px solid rgba(43,33,64,.07);text-align:left;font-size:.72rem}.epochs-table th{background:var(--cream,#FFF3DC);color:var(--soft,#5B5270);font-size:.58rem;letter-spacing:.05em;text-transform:uppercase}.epochs-table tr:last-child td{border-bottom:0}.epochs-table .wallet{font-family:monospace;font-weight:800}.epochs-allocation{display:inline-flex;background:var(--lime,#CBDB2A);border-radius:999px;padding:5px 8px;font-weight:900}
      .epochs-footer-note{margin:9px 0 0;color:var(--soft,#5B5270);font-size:.62rem;font-weight:800;line-height:1.45}
      @media(max-width:900px){.epochs-source{grid-template-columns:1fr 1fr}.epochs-builder-grid{grid-template-columns:1fr}.epochs-stats{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:600px){.forge-epochs{padding:17px}.epochs-hero{flex-direction:column}.epochs-source{grid-template-columns:1fr 1fr}.epochs-fields{grid-template-columns:1fr}.epochs-field.full{grid-column:auto}.epochs-stats{grid-template-columns:1fr 1fr}.epochs-actions .btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function installLauncher() {
    const modules = [...document.querySelectorAll('.module')];
    const card = modules.find((m) => /EPOCHS/i.test(m.querySelector('b')?.textContent || ''));
    if (!card || card.dataset.epochsReady === '1') return;
    card.dataset.epochsReady = '1';
    card.classList.add('forge-epochs-launch');
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    const span = card.querySelector('span');
    if (span) span.textContent = 'Turn the current holder snapshot into an exact, auditable reward allocation.';
    const status = document.createElement('em');
    status.className = 'forge-module-status';
    status.textContent = 'LIVE BETA';
    card.appendChild(status);
    const open = () => {
      ensureSection();
      const section = $('forgeEpochs');
      section.hidden = false;
      updateSource();
      applyAccess();
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  }

  function ensureSection() {
    if ($('forgeEpochs')) return;
    const moduleStrip = document.querySelector('.module-strip');
    if (!moduleStrip) return;
    const section = document.createElement('section');
    section.id = 'forgeEpochs';
    section.className = 'forge-epochs';
    section.hidden = true;
    section.innerHTML = `
      <div class="epochs-hero">
        <div><h2>⚒️ FORGE EPOCHS</h2><p>Build an exact holder reward distribution from the current pinned X-RAY snapshot. Calculations happen in your browser — FORGE never holds funds and never asks for token approvals.</p></div>
        <span class="epochs-badge">ALLOCATION BUILDER · V1</span>
      </div>
      <div class="epochs-source">
        <div><small>Source collection</small><b id="epochSourceCollection">Scan a collection first</b></div>
        <div><small>Network</small><b id="epochSourceNetwork">—</b></div>
        <div><small>Snapshot block</small><b id="epochSourceBlock">—</b></div>
        <div><small>Holders</small><b id="epochSourceHolders">—</b></div>
      </div>
      <div class="epochs-builder-grid">
        <div class="epochs-box">
          <h3>1 · Reward pool</h3><p>Define the total amount being distributed. The final allocations are rounded exactly to the chosen token decimals.</p>
          <div class="epochs-fields">
            <div class="epochs-field"><label>Reward amount</label><input id="epochPool" inputmode="decimal" value="1000" placeholder="1000"></div>
            <div class="epochs-field"><label>Reward symbol</label><input id="epochSymbol" value="USDG" maxlength="16" placeholder="USDG"></div>
            <div class="epochs-field full"><label>Token decimals</label><select id="epochDecimals"><option value="2">2 decimals · currency style</option><option value="6" selected>6 decimals · USDC / USDG style</option><option value="18">18 decimals · ERC-20 style</option></select></div>
          </div>
        </div>
        <div class="epochs-box">
          <h3>2 · Eligibility & weighting</h3><p>Free mode can preview an equal split across all current holders. Genesis unlocks operator rules and exports.</p>
          <div class="epochs-fields">
            <div class="epochs-field genesis-rule"><label>Minimum NFTs held</label><input id="epochMin" type="number" min="1" step="1" value="1"></div>
            <div class="epochs-field genesis-rule"><label>Weighting</label><select id="epochWeight"><option value="equal">Equal per wallet</option><option value="nft">NFT-weighted</option></select></div>
            <div class="epochs-field full genesis-rule"><label>Max NFTs counted per wallet · 0 = no cap</label><input id="epochCap" type="number" min="0" step="1" value="0"></div>
            <div class="epochs-field full genesis-rule"><label>Exclude wallets · team / treasury / partners</label><textarea id="epochExclude" placeholder="0x…\n0x…"></textarea></div>
          </div>
          <div id="epochGenesisNote" class="epochs-lock-note">🔒 Advanced eligibility, weighting, exclusions and distribution exports require <b>TOTZ Genesis Access</b>. Free users can still preview a simple equal split.</div>
        </div>
      </div>
      <div class="epochs-actions">
        <button id="epochBuild" class="btn primary" type="button">BUILD DISTRIBUTION</button>
        <button id="epochCopy" class="btn soft" type="button">COPY ALLOCATIONS</button>
        <button id="epochExport" class="btn dark" type="button">EXPORT DISTRIBUTION</button>
      </div>
      <div id="epochStatus" class="epochs-status"></div>
      <div id="epochResults" class="epochs-results" hidden>
        <div class="epochs-stats">
          <div class="epochs-stat"><small>Eligible wallets</small><b id="epochEligible">—</b></div>
          <div class="epochs-stat"><small>Excluded</small><b id="epochExcluded">—</b></div>
          <div class="epochs-stat"><small>Total weight</small><b id="epochTotalWeight">—</b></div>
          <div class="epochs-stat"><small>Average reward</small><b id="epochAverage">—</b></div>
          <div class="epochs-stat"><small>Exact pool</small><b id="epochExactPool">—</b></div>
        </div>
        <div class="epochs-fingerprint"><span>SHA-256 distribution fingerprint</span><code id="epochFingerprint">calculating…</code></div>
        <div class="epochs-table-wrap"><table class="epochs-table"><thead><tr><th>#</th><th>Wallet</th><th>NFTs held</th><th>Weight</th><th>Pool share</th><th>Allocation</th></tr></thead><tbody id="epochRows"></tbody></table></div>
        <p class="epochs-footer-note">V1 produces an allocation file only. It does not transfer rewards or create an on-chain claim contract. A future Merkle Claim module can consume this distribution after security review.</p>
      </div>`;
    moduleStrip.insertAdjacentElement('afterend', section);

    $('epochBuild').addEventListener('click', buildDistribution);
    $('epochCopy').addEventListener('click', copyAllocations);
    $('epochExport').addEventListener('click', exportDistribution);
    $('epochWeight').addEventListener('change', () => {
      const nft = $('epochWeight').value === 'nft';
      $('epochCap').closest('.epochs-field').style.opacity = nft ? '1' : '.55';
      $('epochCap').disabled = !nft || !genesisUnlocked();
    });
    applyAccess();
  }

  function showStatus(message, type = '') {
    const el = $('epochStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `epochs-status show ${type}`;
  }

  function updateSource() {
    if (!$('forgeEpochs')) return;
    if (!latest) {
      $('epochSourceCollection').textContent = 'Scan a collection first';
      $('epochSourceNetwork').textContent = '—'; $('epochSourceBlock').textContent = '—'; $('epochSourceHolders').textContent = '—';
      return;
    }
    const info = latest.info || {};
    $('epochSourceCollection').textContent = `${info.name || 'NFT Collection'}${info.symbol ? ` · ${info.symbol}` : ''}`;
    $('epochSourceNetwork').textContent = String(latest.chainName || latest.chain || '').toUpperCase();
    $('epochSourceBlock').textContent = latest.snapshotBlock ? `#${fmt(latest.snapshotBlock)}` : 'Pinned';
    $('epochSourceHolders').textContent = fmt(latest.holders?.length || 0);
  }

  function applyAccess() {
    if (!$('forgeEpochs')) return;
    const unlocked = genesisUnlocked();
    document.querySelectorAll('#forgeEpochs .genesis-rule').forEach((field) => {
      field.classList.toggle('locked', !unlocked);
      field.querySelectorAll('input,select,textarea').forEach((el) => { el.disabled = !unlocked; });
    });
    if (!unlocked) {
      $('epochMin').value = '1'; $('epochWeight').value = 'equal'; $('epochCap').value = '0'; $('epochExclude').value = '';
    }
    if ($('epochGenesisNote')) $('epochGenesisNote').classList.toggle('show', !unlocked);
    for (const id of ['epochCopy','epochExport']) {
      const btn = $(id); if (!btn) continue;
      btn.classList.toggle('locked', !unlocked);
      btn.textContent = id === 'epochCopy' ? (unlocked ? 'COPY ALLOCATIONS' : '🔒 COPY ALLOCATIONS') : (unlocked ? 'EXPORT DISTRIBUTION' : '🔒 EXPORT DISTRIBUTION');
    }
    const nft = $('epochWeight')?.value === 'nft';
    if ($('epochCap')) $('epochCap').disabled = !unlocked || !nft;
  }

  function parseExclusions(text) {
    const chunks = String(text || '').split(/[\s,;]+/).map(v => v.trim().toLowerCase()).filter(Boolean);
    const valid = new Set(), invalid = [];
    for (const value of chunks) isAddress(value) ? valid.add(value) : invalid.push(value);
    return { valid, invalid };
  }

  function parseUnits(value, decimals) {
    const raw = String(value || '').trim();
    if (!/^\d+(?:\.\d+)?$/.test(raw)) throw new Error('Enter a valid positive reward amount.');
    const [whole, fraction = ''] = raw.split('.');
    if (fraction.length > decimals) throw new Error(`Reward amount has more than ${decimals} decimals.`);
    const units = BigInt(whole) * (10n ** BigInt(decimals)) + BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0');
    if (units <= 0n) throw new Error('Reward pool must be greater than zero.');
    return units;
  }

  function formatUnits(units, decimals, maxDecimals = 6) {
    const base = 10n ** BigInt(decimals);
    const whole = units / base;
    let frac = (units % base).toString().padStart(decimals, '0');
    if (decimals > maxDecimals) frac = frac.slice(0, maxDecimals);
    frac = frac.replace(/0+$/, '');
    return frac ? `${whole.toString()}.${frac}` : whole.toString();
  }

  async function fingerprint(text) {
    try {
      const bytes = new TextEncoder().encode(text);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return '0x' + [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (_) { return 'unavailable'; }
  }

  async function buildDistribution() {
    result = null;
    $('epochResults').hidden = true;
    if (!latest?.holders?.length) {
      showStatus('Scan a collection in X-RAY first. EPOCHS uses the exact pinned holder snapshot you scanned above.', 'warn');
      return;
    }
    try {
      const unlocked = genesisUnlocked();
      const decimals = Number($('epochDecimals').value || 6);
      const poolUnits = parseUnits($('epochPool').value, decimals);
      const symbol = String($('epochSymbol').value || 'TOKEN').trim().replace(/[^a-zA-Z0-9_$.-]/g, '').slice(0, 16) || 'TOKEN';
      const min = unlocked ? Math.max(1, Math.floor(Number($('epochMin').value || 1))) : 1;
      const mode = unlocked ? $('epochWeight').value : 'equal';
      const cap = unlocked && mode === 'nft' ? Math.max(0, Math.floor(Number($('epochCap').value || 0))) : 0;
      const exclusions = unlocked ? parseExclusions($('epochExclude').value) : { valid: new Set(), invalid: [] };
      if (exclusions.invalid.length) throw new Error(`Invalid exclusion address: ${exclusions.invalid[0]}`);

      const holders = latest.holders
        .map((h) => ({ address: String(h.address || '').toLowerCase(), balance: Number(h.balance || 0) }))
        .filter((h) => isAddress(h.address) && h.balance >= min && !exclusions.valid.has(h.address))
        .sort((a, b) => b.balance - a.balance || a.address.localeCompare(b.address));
      if (!holders.length) throw new Error('No wallets match these epoch rules.');

      const weighted = holders.map((h) => {
        const counted = mode === 'nft' ? (cap > 0 ? Math.min(h.balance, cap) : h.balance) : 1;
        return { ...h, weight: BigInt(Math.max(1, counted)) };
      });
      const totalWeight = weighted.reduce((s, h) => s + h.weight, 0n);
      let allocated = 0n;
      const rows = weighted.map((h) => {
        const product = poolUnits * h.weight;
        const units = product / totalWeight;
        const remainder = product % totalWeight;
        allocated += units;
        return { ...h, units, remainder };
      });
      let leftover = poolUnits - allocated;
      if (leftover > 0n) {
        const order = rows.map((r, i) => ({ i, remainder: r.remainder })).sort((a, b) => a.remainder === b.remainder ? a.i - b.i : (a.remainder > b.remainder ? -1 : 1));
        for (let i = 0; i < order.length && leftover > 0n; i++, leftover--) rows[order[i].i].units += 1n;
      }

      const canonical = [
        `chain=${latest.chain || ''}`, `contract=${latest.contract || ''}`, `block=${latest.snapshotBlock || 0}`,
        `pool=${poolUnits.toString()}`, `decimals=${decimals}`, `symbol=${symbol}`, `min=${min}`, `mode=${mode}`, `cap=${cap}`,
        `exclude=${[...exclusions.valid].sort().join('|')}`,
        ...rows.slice().sort((a,b) => a.address.localeCompare(b.address)).map(r => `${r.address}:${r.balance}:${r.weight.toString()}:${r.units.toString()}`)
      ].join('\n');
      const hash = await fingerprint(canonical);
      const exact = rows.reduce((s, r) => s + r.units, 0n);
      if (exact !== poolUnits) throw new Error('Allocation verification failed. Please rebuild the epoch.');

      result = { rows, poolUnits, decimals, symbol, min, mode, cap, exclusions: exclusions.valid, totalWeight, fingerprint: hash, exact, createdAt: new Date().toISOString(), source: latest };
      renderResult();
      showStatus(`Distribution verified · ${fmt(rows.length)} eligible wallets · exact pool preserved to ${decimals} decimals.`, 'ok');
    } catch (error) {
      showStatus(error?.message || 'Could not build this distribution.', 'error');
    }
  }

  function renderResult() {
    if (!result) return;
    const { rows, poolUnits, decimals, symbol, totalWeight, fingerprint: hash, exclusions } = result;
    $('epochEligible').textContent = fmt(rows.length);
    $('epochExcluded').textContent = fmt(exclusions.size);
    $('epochTotalWeight').textContent = totalWeight.toString();
    $('epochAverage').textContent = `${formatUnits(poolUnits / BigInt(rows.length), decimals, Math.min(6, decimals))} ${symbol}`;
    $('epochExactPool').textContent = `${formatUnits(poolUnits, decimals, Math.min(6, decimals))} ${symbol}`;
    $('epochFingerprint').textContent = hash;
    $('epochFingerprint').title = hash;
    const limit = Math.min(300, rows.length);
    $('epochRows').innerHTML = rows.slice(0, limit).map((r, index) => {
      const share = Number((r.units * 1000000n) / poolUnits) / 10000;
      return `<tr><td>${index + 1}</td><td class="wallet">${r.address}</td><td>${fmt(r.balance)}</td><td>${r.weight.toString()}</td><td>${share.toFixed(4)}%</td><td><span class="epochs-allocation">${formatUnits(r.units, decimals, Math.min(6, decimals))} ${symbol}</span></td></tr>`;
    }).join('') + (rows.length > limit ? `<tr><td colspan="6" style="text-align:center;color:var(--soft);font-weight:800">Showing first ${fmt(limit)} of ${fmt(rows.length)} wallets. Export includes the full verified distribution.</td></tr>` : '');
    $('epochResults').hidden = false;
  }

  function requireGenesis() {
    if (genesisUnlocked()) return true;
    toast('TOTZ Genesis unlocks EPOCHS exports and operator rules.');
    $('accessCard')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }

  async function copyAllocations() {
    if (!requireGenesis() || !result) return;
    const text = result.rows.map(r => `${r.address},${formatUnits(r.units, result.decimals, result.decimals)}`).join('\n');
    try { await navigator.clipboard.writeText(text); }
    catch (_) {
      const area = document.createElement('textarea'); area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove();
    }
    toast(`Copied ${fmt(result.rows.length)} allocations`);
  }

  function csvCell(v) { return `"${String(v ?? '').replace(/"/g, '""')}"`; }
  function exportDistribution() {
    if (!requireGenesis() || !result) return;
    const s = result.source;
    const rows = [
      ['TOTZ FORGE EPOCH DISTRIBUTION',''],
      ['Collection', s.info?.name || 'NFT Collection'], ['Symbol', s.info?.symbol || ''], ['Network', s.chainName || s.chain || ''], ['Chain ID', s.chainId || ''],
      ['Contract', s.contract || ''], ['Snapshot Block', s.snapshotBlock || ''], ['Snapshot UTC', s.fetchedAt || ''],
      ['Reward Pool', formatUnits(result.poolUnits, result.decimals, result.decimals)], ['Reward Symbol', result.symbol], ['Reward Decimals', result.decimals],
      ['Minimum NFTs', result.min], ['Weighting', result.mode === 'nft' ? 'NFT-weighted' : 'Equal per wallet'], ['NFT Weight Cap', result.cap || 'None'], ['Excluded Wallets', result.exclusions.size],
      ['Eligible Wallets', result.rows.length], ['Distribution Fingerprint', result.fingerprint], ['Created UTC', result.createdAt],
      [], ['Rank','Wallet','NFTs Held','Weight','Allocation Units','Allocation']
    ];
    result.rows.forEach((r, index) => rows.push([index + 1, r.address, r.balance, r.weight.toString(), r.units.toString(), formatUnits(r.units, result.decimals, result.decimals)]));
    const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
    const slug = (s.info?.symbol || s.info?.name || 'collection').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    link.download = `forge-epoch-${slug || 'collection'}-${String(s.snapshotBlock || 'snapshot')}.csv`;
    document.body.appendChild(link); link.click(); const href = link.href; link.remove(); setTimeout(() => URL.revokeObjectURL(href), 1000);
    toast(`Exported ${fmt(result.rows.length)} allocations`);
  }

  function normalizeScanData(data, url) {
    const params = new URL(url, location.origin).searchParams;
    const chain = params.get('chain') || '';
    const contract = (params.get('contract') || '').toLowerCase();
    if (!Array.isArray(data?.holders) || !data.holders.length || !isAddress(contract)) return null;
    const chainNames = { robinhood: 'Robinhood Chain', ink: 'Ink', ethereum: 'Ethereum' };
    const chainIds = { robinhood: 4663, ink: 57073, ethereum: 1 };
    return { ...data, chain, chainName: chainNames[chain] || chain, chainId: chainIds[chain] || '', contract };
  }

  function interceptScans() {
    if (window.__totzForgeEpochFetchPatched) return;
    window.__totzForgeEpochFetchPatched = true;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await nativeFetch(...args);
      try {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        if (response.ok && /\/api\/forge-holders\?/i.test(url) && !/[?&]mode=balance(?:&|$)/i.test(url)) {
          response.clone().json().then(data => {
            const normalized = normalizeScanData(data, url);
            if (!normalized) return;
            latest = normalized;
            result = null;
            if ($('epochResults')) $('epochResults').hidden = true;
            updateSource();
          }).catch(() => {});
        }
      } catch (_) {}
      return response;
    };
  }

  installStyle();
  installLauncher();
  interceptScans();
  window.addEventListener(ACCESS_EVENT, applyAccess);
  const observer = new MutationObserver(() => { installLauncher(); if ($('forgeEpochs')) applyAccess(); });
  observer.observe(document.body, { childList: true, subtree: true });
})();

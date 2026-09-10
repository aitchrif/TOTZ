(() => {
  const CHAINS = {
    robinhood: { name: 'Robinhood Chain', chainId: 4663 },
    ink: { name: 'Ink', chainId: 57073 },
    ethereum: { name: 'Ethereum', chainId: 1 }
  };
  const MAX_RULES = 4;
  const $ = (id) => document.getElementById(id);
  const isAddress = (value) => /^0x[a-fA-F0-9]{40}$/.test(String(value || ''));
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
  let mode = 'any';
  let ruleSeq = 0;

  function setStatus(message = '', type = '') {
    const box = $('status');
    if (!box) return;
    box.textContent = message;
    box.className = `status${message ? ' show' : ''}${type ? ` ${type}` : ''}`;
  }

  function updateMode(next) {
    mode = next === 'all' ? 'all' : 'any';
    document.querySelectorAll('.mode-btn').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
  }

  function updateCount() {
    const count = document.querySelectorAll('.rule').length;
    if ($('ruleCount')) $('ruleCount').textContent = `${count} RULE${count === 1 ? '' : 'S'}`;
    if ($('addRuleBtn')) $('addRuleBtn').disabled = count >= MAX_RULES;
    document.querySelectorAll('.remove-rule').forEach((button) => { button.disabled = count <= 1; });
  }

  function ruleMarkup({ chain = 'robinhood', contract = '', min = 1 } = {}) {
    const id = ++ruleSeq;
    return `
      <div class="rule" data-rule-id="${id}">
        <select class="chain" aria-label="Network">
          <option value="robinhood"${chain === 'robinhood' ? ' selected' : ''}>Robinhood Chain</option>
          <option value="ink"${chain === 'ink' ? ' selected' : ''}>Ink</option>
          <option value="ethereum"${chain === 'ethereum' ? ' selected' : ''}>Ethereum</option>
        </select>
        <input class="contract" placeholder="0x collection contract…" value="${esc(contract)}" spellcheck="false" autocomplete="off">
        <input class="min" type="number" min="1" step="1" value="${Math.max(1, Number(min) || 1)}" aria-label="Minimum NFTs">
        <button class="remove-rule" type="button" title="Remove rule" aria-label="Remove rule">×</button>
      </div>`;
  }

  function addRule(config = {}) {
    if (document.querySelectorAll('.rule').length >= MAX_RULES) return;
    $('rules').insertAdjacentHTML('beforeend', ruleMarkup(config));
    updateCount();
  }

  function collectRules({ allowEmpty = false } = {}) {
    const rows = [...document.querySelectorAll('.rule')];
    const rules = rows.map((row, index) => {
      const chain = row.querySelector('.chain')?.value || 'robinhood';
      const contract = String(row.querySelector('.contract')?.value || '').trim().toLowerCase();
      const min = Math.max(1, Math.floor(Number(row.querySelector('.min')?.value) || 1));
      return { index, chain, contract, min };
    });
    if (!allowEmpty) {
      for (const rule of rules) {
        if (!CHAINS[rule.chain]) throw new Error(`Rule ${rule.index + 1}: unsupported network.`);
        if (!isAddress(rule.contract)) throw new Error(`Rule ${rule.index + 1}: enter a valid ERC-721 contract address.`);
      }
    }
    return rules;
  }

  async function fetchBalance(rule, wallet) {
    const params = new URLSearchParams({ chain: rule.chain, mode: 'balance', contract: rule.contract, wallet });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`/api/forge-holders?${params.toString()}`, { cache: 'no-store', signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Balance read failed (${response.status}).`);
      return {
        ...rule,
        ok: true,
        balance: Number(data.balance || 0),
        snapshotBlock: Number(data.snapshotBlock || 0),
        passed: Number(data.balance || 0) >= rule.min
      };
    } catch (error) {
      return { ...rule, ok: false, error: error?.name === 'AbortError' ? 'Balance read timed out.' : (error?.message || 'Balance read failed.') };
    } finally {
      clearTimeout(timer);
    }
  }

  function evaluate(results) {
    const passes = results.filter((item) => item.ok && item.passed).length;
    const fails = results.filter((item) => item.ok && !item.passed).length;
    const errors = results.filter((item) => !item.ok).length;
    if (mode === 'any') {
      if (passes > 0) return { state: 'pass', title: 'GTD ELIGIBLE', mark: '✓', sub: `${passes} of ${results.length} rule${results.length === 1 ? '' : 's'} passed.` };
      if (errors > 0) return { state: 'incomplete', title: 'CHECK INCOMPLETE', mark: '!', sub: `${errors} rule${errors === 1 ? '' : 's'} could not be verified. No passing rule was confirmed.` };
      return { state: 'fail', title: 'NOT ELIGIBLE', mark: '×', sub: `0 of ${results.length} rules passed.` };
    }
    if (fails > 0) return { state: 'fail', title: 'NOT ELIGIBLE', mark: '×', sub: `${fails} required rule${fails === 1 ? '' : 's'} failed.` };
    if (errors > 0) return { state: 'incomplete', title: 'CHECK INCOMPLETE', mark: '!', sub: `${errors} required rule${errors === 1 ? '' : 's'} could not be verified.` };
    return { state: 'pass', title: 'GTD ELIGIBLE', mark: '✓', sub: `All ${results.length} required rules passed.` };
  }

  function renderResults(results) {
    const verdict = evaluate(results);
    const result = $('result');
    const hero = $('resultHero');
    result.classList.add('show');
    hero.className = `result-hero ${verdict.state}`;
    $('resultTitle').textContent = verdict.title;
    $('resultSub').textContent = verdict.sub;
    $('resultMark').textContent = verdict.mark;
    $('ruleResults').innerHTML = results.map((item) => {
      const chain = CHAINS[item.chain]?.name || item.chain;
      if (!item.ok) {
        return `<div class="rule-result error"><div><b>${esc(chain)} · Rule ${item.index + 1}</b><code>${esc(item.contract)}</code></div><div class="rule-meta"><strong>—</strong><span>${esc(item.error)}</span></div></div>`;
      }
      return `<div class="rule-result ${item.passed ? 'pass' : 'fail'}"><div><b>${esc(chain)} · Need ≥ ${item.min} NFT${item.min === 1 ? '' : 's'}</b><code>${esc(item.contract)} · block ${item.snapshotBlock || '—'}</code></div><div class="rule-meta"><strong>${item.balance}</strong><span>${item.passed ? 'PASS' : 'FAIL'}</span></div></div>`;
    }).join('');
    result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function checkEligibility() {
    const wallet = String($('walletInput')?.value || '').trim().toLowerCase();
    if (!isAddress(wallet)) return setStatus('Enter a valid wallet address first.', 'error');
    let rules;
    try { rules = collectRules(); }
    catch (error) { return setStatus(error.message, 'error'); }
    setStatus(`Checking ${rules.length} on-chain balance${rules.length === 1 ? '' : 's'}…`, 'warn');
    $('checkBtn').disabled = true;
    $('result').classList.remove('show');
    try {
      const results = await Promise.all(rules.map((rule) => fetchBalance(rule, wallet)));
      renderResults(results);
      setStatus('');
    } finally {
      $('checkBtn').disabled = false;
    }
  }

  async function copySetupLink() {
    let rules;
    try { rules = collectRules(); }
    catch (error) { return setStatus(error.message, 'error'); }
    const url = new URL('/forge/gtd-check', location.origin);
    url.searchParams.set('mode', mode);
    rules.forEach((rule) => url.searchParams.append('r', `${rule.chain}:${rule.contract}:${rule.min}`));
    try {
      await navigator.clipboard.writeText(url.toString());
      setStatus('Setup link copied. It contains the rules only—no wallet address.');
    } catch (_) {
      setStatus('Could not access the clipboard. Copy the page URL manually.', 'warn');
    }
  }

  function clearAll() {
    $('walletInput').value = '';
    $('rules').innerHTML = '';
    updateMode('any');
    addRule();
    $('result').classList.remove('show');
    setStatus('');
    history.replaceState({}, '', '/forge/gtd-check');
  }

  function loadSetup() {
    const params = new URLSearchParams(location.search);
    updateMode(params.get('mode') === 'all' ? 'all' : 'any');
    const encoded = params.getAll('r');
    const rules = [];
    for (const value of encoded.slice(0, MAX_RULES)) {
      const [chain, contract, minRaw] = String(value || '').split(':');
      if (!CHAINS[chain] || !isAddress(contract)) continue;
      rules.push({ chain, contract: contract.toLowerCase(), min: Math.max(1, Math.floor(Number(minRaw) || 1)) });
    }
    if (!rules.length) {
      const chain = params.get('chain');
      const contract = params.get('contract');
      if (CHAINS[chain] && isAddress(contract)) rules.push({ chain, contract: contract.toLowerCase(), min: 1 });
    }
    if (!rules.length) rules.push({});
    rules.forEach(addRule);
    const wallet = params.get('wallet');
    if (isAddress(wallet)) $('walletInput').value = wallet.toLowerCase();
  }

  $('rules')?.addEventListener('click', (event) => {
    const button = event.target.closest('.remove-rule');
    if (!button || button.disabled) return;
    button.closest('.rule')?.remove();
    updateCount();
  });
  document.querySelectorAll('.mode-btn').forEach((button) => button.addEventListener('click', () => updateMode(button.dataset.mode)));
  $('addRuleBtn')?.addEventListener('click', () => addRule());
  $('checkBtn')?.addEventListener('click', checkEligibility);
  $('shareBtn')?.addEventListener('click', copySetupLink);
  $('clearBtn')?.addEventListener('click', clearAll);
  $('walletInput')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') checkEligibility(); });

  loadSetup();
})();

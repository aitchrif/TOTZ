(() => {
  const $ = (id) => document.getElementById(id);
  const ZERO = '0x0000000000000000000000000000000000000000';
  const isAddress = (value) => /^0x[a-fA-F0-9]{40}$/.test(String(value || ''));
  let cleanWallets = [];
  let issueRows = [];

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
  }

  function setStatus(message = '', type = '') {
    const box = $('status');
    if (!box) return;
    box.textContent = message;
    box.className = `status${message ? ' show' : ''}${type ? ` ${type}` : ''}`;
  }

  function normalizeAddress(value) {
    return $('lowercase')?.checked ? value.toLowerCase() : value;
  }

  function scanInput(text) {
    const rawMatches = String(text || '').match(/0x[0-9A-Za-z]+/g) || [];
    const validRaw = [];
    const invalidLike = [];
    for (const token of rawMatches) {
      if (isAddress(token)) validRaw.push(token);
      else invalidLike.push(token);
    }

    const seen = new Set();
    const unique = [];
    const duplicates = [];
    const zeros = [];
    const removeZero = $('removeZero')?.checked !== false;

    for (const raw of validRaw) {
      const key = raw.toLowerCase();
      if (removeZero && key === ZERO) {
        zeros.push(raw);
        continue;
      }
      if (seen.has(key)) {
        duplicates.push(raw);
        continue;
      }
      seen.add(key);
      unique.push(normalizeAddress(raw));
    }

    if ($('sort')?.checked) unique.sort((a, b) => a.localeCompare(b));
    return { rawMatches, validRaw, invalidLike, unique, duplicates, zeros };
  }

  function renderIssues(result) {
    issueRows = [];
    result.duplicates.forEach((value) => issueRows.push({ type: 'DUPLICATE', value }));
    result.invalidLike.forEach((value) => issueRows.push({ type: 'INVALID-LIKE', value }));
    result.zeros.forEach((value) => issueRows.push({ type: 'ZERO ADDRESS', value }));
    const box = $('issues');
    if (!issueRows.length) {
      box.innerHTML = '<div class="empty">Nothing was removed. The extracted wallet list is already clean.</div>';
      return;
    }
    box.innerHTML = issueRows.slice(0, 200).map((item) => `<div class="issue"><b>${esc(item.type)}</b><code>${esc(item.value)}</code></div>`).join('');
    if (issueRows.length > 200) box.insertAdjacentHTML('beforeend', `<div class="empty">Showing the first 200 of ${issueRows.length} flagged entries.</div>`);
  }

  function render(result) {
    cleanWallets = result.unique;
    $('found').textContent = String(result.validRaw.length);
    $('clean').textContent = String(result.unique.length);
    $('duplicates').textContent = String(result.duplicates.length);
    $('invalid').textContent = String(result.invalidLike.length);
    $('zero').textContent = String(result.zeros.length);
    $('resultTag').textContent = `${result.unique.length} CLEAN`;
    $('output').textContent = result.unique.length ? result.unique.join('\n') : 'No valid wallets found.';
    renderIssues(result);
    const enabled = result.unique.length > 0;
    ['copyBtn', 'txtBtn', 'csvBtn'].forEach((id) => { if ($(id)) $(id).disabled = !enabled; });
  }

  function cleanList() {
    const text = $('input')?.value || '';
    if (!text.trim()) {
      render({ validRaw: [], invalidLike: [], unique: [], duplicates: [], zeros: [] });
      return setStatus('Paste some wallet data first.', 'error');
    }
    const result = scanInput(text);
    render(result);
    if (!result.unique.length) return setStatus('No valid EVM wallet addresses were found.', 'error');
    setStatus(`Cleaned ${result.unique.length} unique wallet${result.unique.length === 1 ? '' : 's'} locally in your browser.`, 'ok');
  }

  async function pasteClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return setStatus('Clipboard is empty.', 'error');
      $('input').value = text;
      cleanList();
    } catch (_) {
      setStatus('Browser clipboard access was blocked. Paste into the box manually.', 'error');
    }
  }

  async function copyClean() {
    if (!cleanWallets.length) return;
    try {
      await navigator.clipboard.writeText(cleanWallets.join('\n'));
      setStatus(`Copied ${cleanWallets.length} clean wallet${cleanWallets.length === 1 ? '' : 's'}.`, 'ok');
    } catch (_) {
      setStatus('Could not access the clipboard. Select the clean output manually.', 'error');
    }
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadTxt() {
    if (!cleanWallets.length) return;
    download('forge-clean-wallets.txt', `${cleanWallets.join('\n')}\n`, 'text/plain;charset=utf-8');
  }

  function downloadCsv() {
    if (!cleanWallets.length) return;
    const rows = ['wallet', ...cleanWallets].join('\n');
    download('forge-clean-wallets.csv', `${rows}\n`, 'text/csv;charset=utf-8');
  }

  function clearAll() {
    $('input').value = '';
    cleanWallets = [];
    issueRows = [];
    render({ validRaw: [], invalidLike: [], unique: [], duplicates: [], zeros: [] });
    $('output').textContent = 'No clean list yet.';
    $('issues').innerHTML = '<div class="empty">Duplicates, malformed 0x values and zero addresses will appear here.</div>';
    setStatus('');
  }

  $('cleanBtn')?.addEventListener('click', cleanList);
  $('pasteBtn')?.addEventListener('click', pasteClipboard);
  $('clearBtn')?.addEventListener('click', clearAll);
  $('copyBtn')?.addEventListener('click', copyClean);
  $('txtBtn')?.addEventListener('click', downloadTxt);
  $('csvBtn')?.addEventListener('click', downloadCsv);
  ['lowercase', 'sort', 'removeZero'].forEach((id) => $(id)?.addEventListener('change', () => { if (($('input')?.value || '').trim()) cleanList(); }));
})();

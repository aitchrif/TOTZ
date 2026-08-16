(() => {
  const USAGE_API = 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/totz-wallet-usage';
  let lastUsage = null;
  let loading = false;

  function activeWallet() {
    const selected = window.ethereum?.selectedAddress;
    const pageWallet = typeof wallet !== 'undefined' ? wallet : null;
    const value = selected || pageWallet;
    return value && /^0x[0-9a-fA-F]{40}$/.test(value) ? value.toLowerCase() : null;
  }

  function fmt(value) {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
  }

  function setText(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
  }

  async function fetchUsage() {
    const currentWallet = activeWallet();
    if (!currentWallet || loading) return lastUsage;
    loading = true;
    try {
      const res = await fetch(USAGE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: currentWallet }),
        cache: 'no-store'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) return lastUsage;
      lastUsage = data;
      return data;
    } catch (_) {
      return lastUsage;
    } finally {
      loading = false;
    }
  }

  function ensureSmallNote(parent, id) {
    let note = document.getElementById(id);
    if (note) return note;
    note = document.createElement('span');
    note.id = id;
    note.style.display = 'block';
    note.style.marginTop = '2px';
    note.style.fontSize = '.72rem';
    note.style.fontWeight = '800';
    note.style.color = 'var(--soft, #5B5270)';
    parent.appendChild(note);
    return note;
  }

  function updateRewardsPage(u) {
    const available = document.getElementById('availableStat');
    const earned = document.getElementById('earnedStat');
    const spent = document.getElementById('spentStat');
    const oldEntries = document.getElementById('entriesStat');
    if (!available || !oldEntries) return;

    setText(available, fmt(u.available));
    setText(earned, fmt(u.earned));
    setText(spent, fmt(u.spent));

    const lockedCard = oldEntries.closest('.stat');
    const lockedLabel = lockedCard?.querySelector('small');
    setText(lockedLabel, 'Discord Locked');
    setText(oldEntries, fmt(u.locked));

    if (lockedCard) {
      const note = ensureSmallNote(lockedCard, 'discordLockedNote');
      setText(note, u.activeRaffles > 0
        ? `${u.activeRaffles} active raffle${u.activeRaffles === 1 ? '' : 's'}`
        : 'No active Discord use');

      const availableCard = available.closest('.stat');
      if (availableCard && lockedCard.previousElementSibling !== availableCard) {
        availableCard.insertAdjacentElement('afterend', lockedCard);
      }
    }

    const status = document.getElementById('status');
    if (status?.classList.contains('ok')) {
      setText(status, u.locked > 0
        ? `You have ${fmt(u.available)} $TOTZ available · ${fmt(u.locked)} $TOTZ locked in Discord.`
        : `You have ${fmt(u.available)} $TOTZ available to spend.`);
    }
  }

  function updateStakingPage(u) {
    const balance = document.getElementById('pointsStat');
    if (!balance) return;
    setText(balance, fmt(u.available));
    const card = balance.closest('.stat');
    if (!card) return;
    const note = ensureSmallNote(card, 'stakingDiscordLockedNote');
    setText(note, `Discord locked: ${fmt(u.locked)} $TOTZ`);
  }

  function applyUsage(u) {
    if (!u) return;
    updateRewardsPage(u);
    updateStakingPage(u);
  }

  async function refresh() {
    applyUsage(await fetchUsage());
  }

  const observer = new MutationObserver(() => {
    if (lastUsage) applyUsage(lastUsage);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
  window.ethereum?.on?.('accountsChanged', () => {
    lastUsage = null;
    setTimeout(refresh, 100);
  });

  setTimeout(refresh, 400);
})();

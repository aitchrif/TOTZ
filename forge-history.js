(() => {
  const scripts = [
    { src: '/forge-epochs.js?v=1', attr: 'forgeEpochs' },
    { src: '/forge-history-core.js?v=2', attr: 'forgeHistoryCore' },
    { src: '/forge-access.js?v=2', attr: 'forgeAccessGate' }
  ];

  let index = 0;
  function loadNext() {
    if (index >= scripts.length) return;
    const item = scripts[index++];
    const selector = `script[data-${item.attr.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}]`;
    if (document.querySelector(selector)) return loadNext();
    const script = document.createElement('script');
    script.src = item.src;
    script.dataset[item.attr] = '1';
    script.async = false;
    script.onload = loadNext;
    script.onerror = loadNext;
    document.head.appendChild(script);
  }

  loadNext();
})();

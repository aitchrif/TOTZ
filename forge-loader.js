(() => {
  const scripts = [
    { src: '/forge-history-core.js?v=2', key: 'historyCore' },
    { src: '/forge-access.js?v=2', key: 'accessGate' }
  ];
  let index = 0;
  const next = () => {
    if (index >= scripts.length) return;
    const item = scripts[index++];
    if (document.querySelector(`script[data-${item.key}]`)) return next();
    const script = document.createElement('script');
    script.src = item.src;
    script.dataset[item.key] = '1';
    script.async = false;
    script.onload = next;
    script.onerror = next;
    document.head.appendChild(script);
  };
  next();
})();

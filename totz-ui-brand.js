(() => {
  const page = (location.pathname.split('/').pop() || '').toLowerCase();

  const style = document.createElement('style');
  style.textContent = `
    ${page === 'rewards.html' ? `
      .prize-media{aspect-ratio:1/1!important}
      .prize-media img{width:100%!important;height:100%!important;object-fit:cover!important;object-position:center!important}
      .type-badge{font-size:.58rem!important;padding:3px 7px!important;letter-spacing:.04em!important;line-height:1!important}
      .raffle-card{transition:transform .16s ease,box-shadow .16s ease}
      .raffle-card:hover{transform:translateY(-2px)}
    ` : ''}
    ${page === 'rewards-admin.html' ? `
      .preview{aspect-ratio:1/1!important;max-height:520px}
      .preview img{object-fit:cover!important;object-position:center!important}
    ` : ''}
  `;
  document.head.appendChild(style);

  function rewriteTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    const parent = node.parentElement;
    if (!parent || ['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','CODE'].includes(parent.tagName)) return;

    let text = node.nodeValue || '';
    let next = text
      .replace(/Live points/gi, '$TOTZ Balance')
      .replace(/TOTZ points/gi, '$TOTZ')
      .replace(/your points/gi, 'your $TOTZ')
      .replace(/\bPTS\b/g, '$TOTZ');

    if (next !== text) node.nodeValue = next;
  }

  function rewrite(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      rewriteTextNode(root);
      return;
    }
    if (!(root instanceof Element) && root !== document.body) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(rewriteTextNode);
  }

  rewrite(document.body);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') rewriteTextNode(mutation.target);
      for (const node of mutation.addedNodes || []) rewrite(node);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
})();

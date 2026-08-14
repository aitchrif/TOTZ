(() => {
  const gateways = [
    'https://ipfs.io/ipfs',
    'https://dweb.link/ipfs',
    'https://gateway.pinata.cloud/ipfs'
  ];

  function parseIpfsUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;

    if (raw.startsWith('ipfs://')) {
      const rest = raw.slice(7).replace(/^ipfs\//, '').replace(/^\/+/, '');
      const slash = rest.indexOf('/');
      return slash === -1
        ? { cid: rest, path: '' }
        : { cid: rest.slice(0, slash), path: rest.slice(slash + 1) };
    }

    try {
      const url = new URL(raw, location.href);
      const subdomain = url.hostname.match(/^([a-z0-9]+)\.ipfs\./i);
      if (subdomain) {
        return { cid: subdomain[1], path: url.pathname.replace(/^\/+/, '') };
      }

      const parts = url.pathname.split('/').filter(Boolean);
      const ipfsIndex = parts.findIndex((part) => part.toLowerCase() === 'ipfs');
      if (ipfsIndex >= 0 && parts[ipfsIndex + 1]) {
        return {
          cid: parts[ipfsIndex + 1],
          path: parts.slice(ipfsIndex + 2).join('/')
        };
      }
    } catch (_) {}

    return null;
  }

  function gatewayUrl(cid, path, index) {
    return `${gateways[index]}/${cid}${path ? `/${path}` : ''}`;
  }

  function addPlaceholder(img) {
    const media = img.closest('.prize-media');
    if (!media || media.querySelector('.prize-placeholder')) return;
    const placeholder = document.createElement('div');
    placeholder.className = 'prize-placeholder';
    placeholder.textContent = '🎟️';
    media.appendChild(placeholder);
  }

  function prepare(img) {
    if (!(img instanceof HTMLImageElement) || !img.closest('.prize-media')) return;
    if (img.dataset.ipfsPrepared === '1') return;

    const parsed = parseIpfsUrl(img.getAttribute('src'));
    img.dataset.ipfsPrepared = '1';
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';

    if (!parsed?.cid) {
      img.addEventListener('error', () => {
        img.style.display = 'none';
        addPlaceholder(img);
      }, { once: true });
      return;
    }

    img.dataset.ipfsCid = parsed.cid;
    img.dataset.ipfsPath = parsed.path || '';
    img.dataset.ipfsGateway = '0';
    // Replace fragile/custom IPFS gateway links with a stable public path immediately.
    img.src = gatewayUrl(parsed.cid, parsed.path || '', 0);
  }

  document.addEventListener('error', (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || !img.closest('.prize-media')) return;

    const cid = img.dataset.ipfsCid;
    if (!cid) return;
    const current = Number(img.dataset.ipfsGateway || 0);
    const next = current + 1;

    if (next >= gateways.length) {
      img.style.display = 'none';
      addPlaceholder(img);
      return;
    }

    img.dataset.ipfsGateway = String(next);
    img.src = gatewayUrl(cid, img.dataset.ipfsPath || '', next);
  }, true);

  const scan = (root = document) => root.querySelectorAll?.('.prize-media img').forEach(prepare);
  scan();

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('.prize-media img')) prepare(node);
        scan(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();

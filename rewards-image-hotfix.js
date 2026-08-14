(() => {
  const gateways = [
    'https://dweb.link/ipfs',
    'https://gateway.pinata.cloud/ipfs',
    'https://ipfs.io/ipfs'
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

  const gatewayUrl = (cid, path, base) => `${base}/${cid}${path ? `/${path}` : ''}`;

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

    const media = img.closest('.prize-media');
    img.style.visibility = 'hidden';
    let settled = false;
    let failed = 0;

    const win = (url) => {
      if (settled) return;
      settled = true;
      img.onload = () => { img.style.visibility = 'visible'; };
      img.onerror = () => { img.style.display = 'none'; addPlaceholder(img); };
      img.src = url;
      if (media) media.dataset.imageReady = '1';
    };

    gateways.forEach((base) => {
      const url = gatewayUrl(parsed.cid, parsed.path || '', base);
      const probe = new Image();
      probe.referrerPolicy = 'no-referrer';
      probe.decoding = 'async';
      probe.onload = () => win(url);
      probe.onerror = () => {
        failed += 1;
        if (!settled && failed === gateways.length) {
          settled = true;
          img.style.display = 'none';
          addPlaceholder(img);
        }
      };
      probe.src = url;
    });

    setTimeout(() => {
      if (!settled) {
        settled = true;
        img.style.display = 'none';
        addPlaceholder(img);
      }
    }, 8000);
  }

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

(() => {
  if (document.querySelector('script[data-totz-ui-brand]')) return;
  const script = document.createElement('script');
  script.src = 'totz-ui-brand.js';
  script.dataset.totzUiBrand = '1';
  document.head.appendChild(script);
})();

let cachedOpenSeaKey = null;

const OPENSEA = 'https://api.opensea.io/api/v2';
const MAX_EVENTS = 200;
const MAX_ACTIVE = 100;
const ALLOWED_HOURS = new Set([1, 6, 24, 72, 168]);

function safeSlug(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let slug = raw;
  try {
    const url = new URL(raw);
    if (url.hostname === 'opensea.io' || url.hostname.endsWith('.opensea.io')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const index = parts.findIndex((part) => part.toLowerCase() === 'collection');
      if (index >= 0 && parts[index + 1]) slug = parts[index + 1];
    }
  } catch (_) {}
  slug = String(slug).replace(/^collection\//i, '').split(/[?#/]/)[0].trim();
  return /^[a-zA-Z0-9_-]{1,120}$/.test(slug) ? slug : '';
}

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ''));
}

function lowerAddress(value) {
  const text = String(value || '').toLowerCase();
  return isAddress(text) ? text : '';
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getPath(object, paths) {
  for (const path of paths) {
    const value = path.split('.').reduce((node, key) => node?.[key], object);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function normalizePrice(value, decimals) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value);
  if (/^\d+$/.test(text)) {
    const dec = Number.isInteger(Number(decimals)) ? Number(decimals) : 18;
    try {
      const integer = BigInt(text);
      const base = 10n ** BigInt(Math.max(0, dec));
      const whole = integer / base;
      const fraction = integer % base;
      const fractionText = fraction.toString().padStart(dec, '0').slice(0, 8).replace(/0+$/, '');
      return Number(`${whole.toString()}${fractionText ? `.${fractionText}` : ''}`);
    } catch (_) {}
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function paymentMeta(node) {
  const decimals = getPath(node, [
    'payment_token.decimals', 'payment.decimals', 'price.current.decimals', 'price.decimals',
    'protocol_data.parameters.consideration.0.decimals'
  ]);
  const symbol = String(getPath(node, [
    'payment_token.symbol', 'payment.symbol', 'price.current.currency', 'price.currency',
    'protocol_data.parameters.consideration.0.symbol'
  ]) || 'ETH').toUpperCase();
  return { decimals: asNumber(decimals) ?? 18, symbol };
}

function listingPrice(node) {
  const meta = paymentMeta(node);
  const raw = getPath(node, [
    'base_price', 'price.current.value', 'price.value', 'payment.quantity', 'payment.value',
    'protocol_data.parameters.consideration.0.startAmount', 'protocol_data.parameters.consideration.0.endAmount'
  ]);
  const price = normalizePrice(raw, meta.decimals);
  return price !== null && price >= 0 ? { price, symbol: meta.symbol } : null;
}

function eventArray(data) {
  if (Array.isArray(data?.asset_events)) return data.asset_events;
  if (Array.isArray(data?.events)) return data.events;
  if (Array.isArray(data)) return data;
  return [];
}

function listingArray(data) {
  if (Array.isArray(data?.listings)) return data.listings;
  if (Array.isArray(data?.orders)) return data.orders;
  if (Array.isArray(data)) return data;
  return [];
}

function parseTimestamp(node) {
  const raw = getPath(node, ['event_timestamp', 'payload.event_timestamp', 'created_date', 'created_at', 'sent_at']);
  if (!raw) return null;
  const value = typeof raw === 'number' ? raw * 1000 : Date.parse(String(raw));
  return Number.isFinite(value) ? value : null;
}

function parseTokenId(node) {
  const direct = getPath(node, [
    'nft.identifier', 'payload.nft.identifier', 'payload.item.token_id', 'item.token_id',
    'protocol_data.parameters.offer.0.identifierOrCriteria'
  ]);
  if (direct !== null && direct !== undefined && String(direct) !== '') return String(direct);
  const nftId = getPath(node, ['payload.item.nft_id', 'item.nft_id']);
  if (nftId) return String(nftId).split('/').filter(Boolean).pop() || '';
  return '';
}

function parseMaker(node) {
  return lowerAddress(getPath(node, [
    'maker.address', 'payload.maker.address', 'seller.address', 'payload.seller.address',
    'from_address', 'payload.from_address', 'protocol_data.parameters.offerer'
  ]));
}

function parseListingEvent(event) {
  const payload = event?.payload || event || {};
  const maker = parseMaker(payload) || parseMaker(event);
  const priceInfo = listingPrice(payload) || listingPrice(event);
  if (!maker || !priceInfo) return null;
  return {
    maker,
    price: priceInfo.price,
    symbol: priceInfo.symbol,
    tokenId: parseTokenId(payload) || parseTokenId(event),
    timestamp: parseTimestamp(payload) || parseTimestamp(event)
  };
}

function parseSaleEvent(event) {
  const payload = event?.payload || event || {};
  const seller = lowerAddress(getPath(payload, [
    'seller.address', 'maker.address', 'from_address'
  ])) || parseMaker(event);
  const priceInfo = listingPrice(payload) || listingPrice(event);
  if (!seller) return null;
  return {
    seller,
    price: priceInfo?.price ?? null,
    symbol: priceInfo?.symbol || 'ETH',
    tokenId: parseTokenId(payload) || parseTokenId(event),
    timestamp: parseTimestamp(payload) || parseTimestamp(event)
  };
}

function parseActiveListing(order) {
  const maker = parseMaker(order);
  const priceInfo = listingPrice(order);
  if (!maker || !priceInfo) return null;
  return {
    maker,
    price: priceInfo.price,
    symbol: priceInfo.symbol,
    tokenId: parseTokenId(order),
    timestamp: parseTimestamp(order)
  };
}

async function fetchJson(url, options = {}, timeoutMs = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.detail || data?.error || data?.message || `HTTP ${response.status}`;
      const error = new Error(String(message));
      error.status = response.status;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function openSeaKey() {
  if (process.env.OPENSEA_API_KEY) return process.env.OPENSEA_API_KEY;
  if (cachedOpenSeaKey?.key && cachedOpenSeaKey.expiresAt > Date.now() + 300000) return cachedOpenSeaKey.key;
  const data = await fetchJson(`${OPENSEA}/auth/keys`, {
    method: 'POST',
    headers: { accept: 'application/json', 'user-agent': 'TOTZ-FORGE-FLOOR-GUARD/1.0' }
  }, 12000);
  const key = String(data?.api_key || '');
  if (!key) throw new Error('OpenSea did not return a usable data key.');
  const expires = Date.parse(String(data?.expires_at || ''));
  cachedOpenSeaKey = { key, expiresAt: Number.isFinite(expires) ? expires : Date.now() + 6 * 86400000 };
  return key;
}

async function openSeaGet(path, key) {
  return fetchJson(`${OPENSEA}${path}`, {
    headers: {
      accept: 'application/json',
      'x-api-key': key,
      'user-agent': 'TOTZ-FORGE-FLOOR-GUARD/1.0'
    }
  });
}

function scoreWallet(wallet, floor, active, listings, sales) {
  const activeRows = active.filter((row) => row.maker === wallet);
  const listingRows = listings.filter((row) => row.maker === wallet);
  const saleRows = sales.filter((row) => row.seller === wallet);
  const floorZone = floor > 0 ? activeRows.filter((row) => row.price <= floor * 1.05) : [];
  const atFloor = floor > 0 && activeRows.some((row) => row.price <= floor * 1.001);

  const timestamps = listingRows.map((row) => row.timestamp).filter(Number.isFinite).sort((a, b) => a - b);
  let burstPairs = 0;
  for (let i = 1; i < timestamps.length; i++) {
    if (timestamps[i] - timestamps[i - 1] <= 10 * 60 * 1000) burstPairs++;
  }

  const byToken = new Map();
  listingRows.forEach((row) => {
    if (!row.tokenId || !Number.isFinite(row.timestamp)) return;
    const list = byToken.get(row.tokenId) || [];
    list.push(row);
    byToken.set(row.tokenId, list);
  });
  let priceCuts = 0;
  byToken.forEach((rows) => {
    rows.sort((a, b) => a.timestamp - b.timestamp);
    for (let i = 1; i < rows.length; i++) {
      if (rows[i - 1].price > 0 && rows[i].price < rows[i - 1].price * 0.99) priceCuts++;
    }
  });

  let score = 0;
  if (atFloor) score += 25;
  score += Math.min(25, floorZone.length * 8);
  score += Math.min(20, Math.max(0, listingRows.length - 1) * 4);
  score += Math.min(15, burstPairs * 5);
  score += Math.min(15, priceCuts * 7);
  score += Math.min(10, saleRows.length * 3);
  score = Math.min(100, score);

  const reasons = [];
  if (atFloor) reasons.push('holds current floor');
  if (floorZone.length >= 2) reasons.push(`${floorZone.length} listings within 5% of floor`);
  if (listingRows.length >= 3) reasons.push(`${listingRows.length} recent listings`);
  if (burstPairs >= 1) reasons.push(`burst listing pattern ×${burstPairs}`);
  if (priceCuts >= 1) reasons.push(`repeated price cuts ×${priceCuts}`);
  if (saleRows.length >= 2) reasons.push(`${saleRows.length} recent sales`);
  if (!reasons.length && activeRows.length) reasons.push(`${activeRows.length} active low-price listing${activeRows.length === 1 ? '' : 's'}`);

  let signal = 'LOW SIGNAL';
  if (score >= 65) signal = 'HIGH FLOOR PRESSURE';
  else if (score >= 40) signal = 'WATCH';

  return {
    wallet,
    score,
    signal,
    highPressure: score >= 65,
    activeLowListings: activeRows.length,
    floorZoneListings: floorZone.length,
    recentListings: listingRows.length,
    recentSales: saleRows.length,
    burstPairs,
    priceCuts,
    minActivePrice: activeRows.length ? Math.min(...activeRows.map((row) => row.price)) : null,
    reasons
  };
}

function collectionName(data, slug) {
  return String(data?.name || data?.collection?.name || data?.collection_name || slug);
}

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const slug = safeSlug(req.query?.collection || req.query?.slug);
  const hoursCandidate = Number(req.query?.hours || 24);
  const hours = ALLOWED_HOURS.has(hoursCandidate) ? hoursCandidate : 24;
  if (!slug) return res.status(400).json({ error: 'Paste a valid OpenSea collection URL or collection slug.' });

  try {
    const key = await openSeaKey();
    const after = Math.floor((Date.now() - hours * 3600000) / 1000);
    const encoded = encodeURIComponent(slug);
    const headers = { 'Cache-Control': 's-maxage=30, stale-while-revalidate=90' };
    Object.entries(headers).forEach(([name, value]) => res.setHeader(name, value));

    const [collectionData, activeData, listingData, saleData] = await Promise.all([
      openSeaGet(`/collections/${encoded}`, key),
      openSeaGet(`/listings/collection/${encoded}/best?limit=${MAX_ACTIVE}`, key),
      openSeaGet(`/events/collection/${encoded}?event_type=listing&after=${after}&limit=${MAX_EVENTS}`, key),
      openSeaGet(`/events/collection/${encoded}?event_type=sale&after=${after}&limit=${MAX_EVENTS}`, key)
    ]);

    const active = listingArray(activeData).map(parseActiveListing).filter(Boolean).sort((a, b) => a.price - b.price);
    const listings = eventArray(listingData).map(parseListingEvent).filter(Boolean);
    const sales = eventArray(saleData).map(parseSaleEvent).filter(Boolean);
    const symbol = active[0]?.symbol || listings[0]?.symbol || sales.find((row) => row.price !== null)?.symbol || 'ETH';
    const sameCurrencyActive = active.filter((row) => row.symbol === symbol && Number.isFinite(row.price) && row.price > 0);
    const floor = sameCurrencyActive.length ? sameCurrencyActive[0].price : null;

    const wallets = new Set();
    sameCurrencyActive.slice(0, 50).forEach((row) => wallets.add(row.maker));
    listings.forEach((row) => wallets.add(row.maker));
    sales.forEach((row) => wallets.add(row.seller));

    const ranked = [...wallets]
      .map((wallet) => scoreWallet(wallet, floor || 0, sameCurrencyActive.slice(0, 50), listings, sales))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || b.floorZoneListings - a.floorZoneListings || b.recentListings - a.recentListings)
      .slice(0, 40);

    const highPressure = ranked.filter((row) => row.highPressure).length;
    const watch = ranked.filter((row) => row.signal === 'WATCH').length;

    return res.status(200).json({
      source: 'OpenSea',
      methodology: 'heuristic-v1',
      collection: { slug, name: collectionName(collectionData, slug), url: `https://opensea.io/collection/${slug}` },
      windowHours: hours,
      floor,
      currency: symbol,
      activeListingsScanned: sameCurrencyActive.length,
      listingEventsScanned: listings.length,
      saleEventsScanned: sales.length,
      walletsScored: ranked.length,
      highPressure,
      watch,
      rows: ranked,
      generatedAt: new Date().toISOString(),
      disclaimer: 'FLOOR GUARD detects bot-like or automated listing pressure from public marketplace behavior. A score is a heuristic signal, not proof that a wallet is a bot or acted maliciously.'
    });
  } catch (error) {
    const status = Number(error?.status) === 404 ? 404 : 502;
    return res.status(status).json({
      error: status === 404 ? 'OpenSea could not find that collection.' : 'Could not read OpenSea marketplace data right now.',
      detail: String(error?.message || 'Unknown upstream error').slice(0, 220)
    });
  }
}

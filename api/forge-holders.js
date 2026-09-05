const BLOCKSCOUT = 'https://robinhoodchain.blockscout.com';
const MAX_HOLDERS = 10000;

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ''));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, timeoutMs = 12000, retries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'accept': 'application/json', 'user-agent': 'TOTZ-FORGE/1.0' }
      });
      if (!response.ok) throw new Error(`Upstream ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(250 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('Upstream request failed');
}

function holderAddress(item) {
  return String(
    item?.address_hash?.hash ||
    item?.address?.hash ||
    item?.address_hash ||
    item?.address ||
    item?.holder?.hash ||
    item?.holder ||
    ''
  ).toLowerCase();
}

function holderBalance(item) {
  const raw = item?.value ?? item?.balance ?? item?.token_balance ?? item?.quantity ?? 1;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function aggregate(items) {
  const map = new Map();
  for (const item of items || []) {
    const address = holderAddress(item);
    const balance = holderBalance(item);
    if (!isAddress(address) || balance <= 0) continue;
    map.set(address, (map.get(address) || 0) + balance);
  }
  return [...map.entries()]
    .map(([address, balance]) => ({ address, balance }))
    .sort((a, b) => b.balance - a.balance || a.address.localeCompare(b.address));
}

async function tokenInfo(contract) {
  try {
    const data = await fetchJson(`${BLOCKSCOUT}/api/v2/tokens/${contract}`, 9000, 1);
    return {
      name: data?.name || data?.symbol || 'NFT Collection',
      symbol: data?.symbol || '',
      totalSupply: Number(data?.total_supply ?? data?.totalSupply ?? 0) || 0,
      holdersCount: Number(data?.holders_count ?? data?.holders ?? 0) || 0,
      type: data?.type || ''
    };
  } catch (_) {
    return { name: 'NFT Collection', symbol: '', totalSupply: 0, holdersCount: 0, type: '' };
  }
}

async function legacyHolders(contract) {
  const url = `${BLOCKSCOUT}/api?module=token&action=getTokenHolders&contractaddress=${contract}&page=1&offset=${MAX_HOLDERS}`;
  const data = await fetchJson(url, 15000, 2);
  if (!Array.isArray(data?.result)) throw new Error(data?.message || 'Legacy holder endpoint unavailable');
  const holders = aggregate(data.result);
  if (!holders.length) throw new Error('Legacy endpoint returned no holders');
  return { holders, source: 'legacy' };
}

async function v2Holders(contract) {
  const all = [];
  let url = `${BLOCKSCOUT}/api/v2/tokens/${contract}/holders`;
  const seen = new Set();
  let page = 0;

  while (url && page < 220 && all.length < MAX_HOLDERS) {
    if (seen.has(url)) break;
    seen.add(url);
    const data = await fetchJson(url, 10000, 2);
    const items = Array.isArray(data?.items) ? data.items : [];
    all.push(...items);

    const next = data?.next_page_params;
    if (!next || !Object.keys(next).length || !items.length) break;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value !== null && value !== undefined) params.set(key, String(value));
    }
    url = `${BLOCKSCOUT}/api/v2/tokens/${contract}/holders?${params.toString()}`;
    page += 1;
  }

  const holders = aggregate(all);
  if (!holders.length) throw new Error('V2 endpoint returned no holders');
  return { holders, source: 'v2', partial: all.length >= MAX_HOLDERS };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const contract = String(req.query?.contract || '').trim().toLowerCase();
  if (!isAddress(contract)) return res.status(400).json({ error: 'Invalid contract address' });

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');

  try {
    const infoPromise = tokenInfo(contract);
    let holderResult;
    try {
      holderResult = await legacyHolders(contract);
    } catch (_) {
      holderResult = await v2Holders(contract);
    }

    const info = await infoPromise;
    const inferredSupply = holderResult.holders.reduce((sum, holder) => sum + Number(holder.balance || 0), 0);

    return res.status(200).json({
      contract,
      info: {
        ...info,
        totalSupply: Number(info.totalSupply || inferredSupply || 0),
        holdersCount: Number(info.holdersCount || holderResult.holders.length || 0)
      },
      holders: holderResult.holders,
      source: holderResult.source,
      partial: Boolean(holderResult.partial),
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('FORGE holders error', contract, error);
    return res.status(502).json({ error: 'Could not load holder data from Robinhood Chain right now. Please retry.' });
  }
}

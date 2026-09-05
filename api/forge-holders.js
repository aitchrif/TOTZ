const RPC = 'https://rpc.mainnet.chain.robinhood.com';
const MAX_SUPPLY = 20000;
const BATCH_SIZE = 180;
const CONCURRENCY = 3;

const SELECTORS = {
  totalSupply: '0x18160ddd',
  name: '0x06fdde03',
  symbol: '0x95d89b41',
  ownerOf: '0x6352211e',
  tokenByIndex: '0x4f6ccce7'
};

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ''));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uint256(value) {
  return BigInt(value).toString(16).padStart(64, '0');
}

function parseUint(hex) {
  if (!hex || hex === '0x') return null;
  try { return Number(BigInt(hex)); } catch (_) { return null; }
}

function parseAddress(hex) {
  if (!hex || hex.length < 42) return null;
  const address = `0x${hex.slice(-40)}`.toLowerCase();
  return isAddress(address) && address !== '0x0000000000000000000000000000000000000000' ? address : null;
}

function decodeString(hex) {
  if (!hex || hex === '0x') return '';
  try {
    const raw = hex.slice(2);
    if (raw.length >= 128) {
      const offset = Number(BigInt(`0x${raw.slice(0, 64)}`));
      const lenPos = offset * 2;
      if (raw.length >= lenPos + 64) {
        const len = Number(BigInt(`0x${raw.slice(lenPos, lenPos + 64)}`));
        const start = lenPos + 64;
        const end = start + len * 2;
        if (len >= 0 && raw.length >= end) return Buffer.from(raw.slice(start, end), 'hex').toString('utf8').replace(/\0/g, '').trim();
      }
    }
    return Buffer.from(raw.slice(0, 64).replace(/(00)+$/, ''), 'hex').toString('utf8').replace(/\0/g, '').trim();
  } catch (_) {
    return '';
  }
}

async function rpc(payload, timeoutMs = 15000, retries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(RPC, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', 'accept': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(250 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('RPC request failed');
}

async function singleCall(contract, data) {
  const response = await rpc({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: contract, data }, 'latest'] });
  if (response?.error) return { ok: false, error: response.error };
  return { ok: true, result: response?.result || '0x' };
}

async function batchEthCalls(contract, datas) {
  const payload = datas.map((data, index) => ({ jsonrpc: '2.0', id: index + 1, method: 'eth_call', params: [{ to: contract, data }, 'latest'] }));
  const response = await rpc(payload, 18000, 2);
  if (!Array.isArray(response)) throw new Error('RPC batch response was not an array');
  const byId = new Map(response.map((item) => [Number(item.id), item]));
  return datas.map((_, index) => {
    const item = byId.get(index + 1);
    if (!item || item.error) return { ok: false, error: item?.error || null };
    return { ok: true, result: item.result || '0x' };
  });
}

async function mapBatches(items, worker) {
  const groups = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) groups.push(items.slice(i, i + BATCH_SIZE));
  const results = new Array(groups.length);
  let cursor = 0;

  async function run() {
    while (true) {
      const index = cursor++;
      if (index >= groups.length) return;
      results[index] = await worker(groups[index], index);
    }
  }

  const runners = Array.from({ length: Math.min(CONCURRENCY, groups.length) }, () => run());
  await Promise.all(runners);
  return results.flat();
}

async function metadata(contract) {
  const [supplyCall, nameCall, symbolCall] = await Promise.all([
    singleCall(contract, SELECTORS.totalSupply),
    singleCall(contract, SELECTORS.name),
    singleCall(contract, SELECTORS.symbol)
  ]);

  const totalSupply = supplyCall.ok ? parseUint(supplyCall.result) : null;
  if (!Number.isInteger(totalSupply) || totalSupply <= 0) throw new Error('This contract does not expose a usable ERC-721 totalSupply().');
  if (totalSupply > MAX_SUPPLY) throw new Error(`Collection is larger than the current FORGE V1 limit of ${MAX_SUPPLY.toLocaleString()} NFTs.`);

  return {
    totalSupply,
    name: nameCall.ok ? decodeString(nameCall.result) : '',
    symbol: symbolCall.ok ? decodeString(symbolCall.result) : '',
    type: 'ERC-721'
  };
}

function aggregateOwners(owners) {
  const map = new Map();
  for (const owner of owners) {
    if (!owner || !isAddress(owner)) continue;
    map.set(owner, (map.get(owner) || 0) + 1);
  }
  return [...map.entries()]
    .map(([address, balance]) => ({ address, balance }))
    .sort((a, b) => b.balance - a.balance || a.address.localeCompare(b.address));
}

async function enumerableOwners(contract, totalSupply) {
  const probe = await singleCall(contract, `${SELECTORS.tokenByIndex}${uint256(0)}`);
  if (!probe.ok) return null;

  const indexes = Array.from({ length: totalSupply }, (_, i) => i);
  const tokenResults = await mapBatches(indexes, async (group) => {
    const calls = group.map((index) => `${SELECTORS.tokenByIndex}${uint256(index)}`);
    const results = await batchEthCalls(contract, calls);
    return results.map((result) => result.ok ? parseUint(result.result) : null);
  });

  const tokenIds = tokenResults.filter((value) => Number.isInteger(value) && value >= 0);
  if (tokenIds.length < totalSupply) return null;

  const ownerResults = await mapBatches(tokenIds, async (group) => {
    const calls = group.map((tokenId) => `${SELECTORS.ownerOf}${uint256(tokenId)}`);
    const results = await batchEthCalls(contract, calls);
    return results.map((result) => result.ok ? parseAddress(result.result) : null);
  });

  const owners = ownerResults.filter(Boolean);
  return owners.length === totalSupply ? owners : null;
}

async function sequentialOwners(contract, totalSupply) {
  const extra = Math.min(10000, Math.max(2000, Math.ceil(totalSupply * 0.6)));
  const maxId = totalSupply + extra;
  const ids = Array.from({ length: maxId + 1 }, (_, i) => i);
  const owners = [];

  const groups = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) groups.push(ids.slice(i, i + BATCH_SIZE));

  for (let start = 0; start < groups.length && owners.length < totalSupply; start += CONCURRENCY) {
    const wave = groups.slice(start, start + CONCURRENCY);
    const waveResults = await Promise.all(wave.map(async (group) => {
      const calls = group.map((tokenId) => `${SELECTORS.ownerOf}${uint256(tokenId)}`);
      const results = await batchEthCalls(contract, calls);
      return results.map((result) => result.ok ? parseAddress(result.result) : null).filter(Boolean);
    }));
    for (const result of waveResults) owners.push(...result);
  }

  if (owners.length < totalSupply) {
    throw new Error(`FORGE found ${owners.length.toLocaleString()} live ERC-721 tokens but expected ${totalSupply.toLocaleString()}. This collection may use non-sequential token IDs.`);
  }

  return owners.slice(0, totalSupply);
}

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const contract = String(req.query?.contract || '').trim().toLowerCase();
  if (!isAddress(contract)) return res.status(400).json({ error: 'Invalid contract address' });

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  try {
    const info = await metadata(contract);
    let owners = await enumerableOwners(contract, info.totalSupply);
    let source = 'rpc-enumerable';

    if (!owners) {
      owners = await sequentialOwners(contract, info.totalSupply);
      source = 'rpc-ownerof';
    }

    const holders = aggregateOwners(owners);
    if (!holders.length) throw new Error('No current holders found.');

    return res.status(200).json({
      contract,
      info: {
        name: info.name || 'NFT Collection',
        symbol: info.symbol || '',
        totalSupply: info.totalSupply,
        holdersCount: holders.length,
        type: info.type
      },
      holders,
      source,
      partial: false,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('FORGE RPC holders error', contract, error);
    const message = String(error?.message || 'Could not load holder data from Robinhood Chain right now.');
    const status = /does not expose|larger than|non-sequential/i.test(message) ? 422 : 502;
    return res.status(status).json({ error: message });
  }
}

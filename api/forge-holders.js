import { Interface } from 'ethers';

const RPC = 'https://rpc.mainnet.chain.robinhood.com';
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
const MAX_SUPPLY = 20000;
const MULTICALL_SIZE = 300;

const erc721 = new Interface([
  'function totalSupply() view returns (uint256)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function tokenByIndex(uint256) view returns (uint256)',
  'function ownerOf(uint256) view returns (address)'
]);

const multicall = new Interface([
  'function aggregate3((address target,bool allowFailure,bytes callData)[] calls) payable returns ((bool success,bytes returnData)[] returnData)'
]);

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ''));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rpc(method, params, timeoutMs = 18000, retries = 4) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(RPC, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
      });

      if (response.status === 429) {
        throw new Error('RPC_RATE_LIMIT');
      }
      if (!response.ok) {
        throw new Error(`RPC HTTP ${response.status}`);
      }

      const json = await response.json();
      if (json?.error) throw new Error(json.error.message || 'RPC error');
      return json?.result;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        const base = String(error?.message || '').includes('RATE_LIMIT') ? 1100 : 500;
        await sleep(base * Math.pow(1.8, attempt));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('RPC request failed');
}

async function multicallRead(contract, callDatas) {
  if (!callDatas.length) return [];
  const calls = callDatas.map((callData) => ({
    target: contract,
    allowFailure: true,
    callData
  }));
  const data = multicall.encodeFunctionData('aggregate3', [calls]);
  const result = await rpc('eth_call', [{ to: MULTICALL3, data }, 'latest'], 22000, 4);
  const decoded = multicall.decodeFunctionResult('aggregate3', result)[0];
  return decoded.map((item) => ({ success: Boolean(item.success), returnData: item.returnData }));
}

async function readChunks(contract, callDatas, decoder) {
  const out = [];
  for (let i = 0; i < callDatas.length; i += MULTICALL_SIZE) {
    const chunk = callDatas.slice(i, i + MULTICALL_SIZE);
    const results = await multicallRead(contract, chunk);
    for (const result of results) {
      if (!result.success) {
        out.push(null);
        continue;
      }
      try {
        out.push(decoder(result.returnData));
      } catch (_) {
        out.push(null);
      }
    }
    if (i + MULTICALL_SIZE < callDatas.length) await sleep(120);
  }
  return out;
}

async function metadata(contract) {
  const calls = [
    erc721.encodeFunctionData('totalSupply', []),
    erc721.encodeFunctionData('name', []),
    erc721.encodeFunctionData('symbol', [])
  ];
  const results = await multicallRead(contract, calls);

  let totalSupply = null;
  let name = '';
  let symbol = '';

  if (results[0]?.success) {
    try { totalSupply = Number(erc721.decodeFunctionResult('totalSupply', results[0].returnData)[0]); } catch (_) {}
  }
  if (results[1]?.success) {
    try { name = String(erc721.decodeFunctionResult('name', results[1].returnData)[0] || ''); } catch (_) {}
  }
  if (results[2]?.success) {
    try { symbol = String(erc721.decodeFunctionResult('symbol', results[2].returnData)[0] || ''); } catch (_) {}
  }

  if (!Number.isInteger(totalSupply) || totalSupply <= 0) {
    throw new Error('This contract does not expose a usable ERC-721 totalSupply().');
  }
  if (totalSupply > MAX_SUPPLY) {
    throw new Error(`Collection is larger than the current FORGE V1 limit of ${MAX_SUPPLY.toLocaleString()} NFTs.`);
  }

  return { totalSupply, name, symbol, type: 'ERC-721' };
}

function aggregateOwners(owners) {
  const map = new Map();
  for (const owner of owners) {
    const address = String(owner || '').toLowerCase();
    if (!isAddress(address) || address === '0x0000000000000000000000000000000000000000') continue;
    map.set(address, (map.get(address) || 0) + 1);
  }
  return [...map.entries()]
    .map(([address, balance]) => ({ address, balance }))
    .sort((a, b) => b.balance - a.balance || a.address.localeCompare(b.address));
}

async function enumerableOwners(contract, totalSupply) {
  const probeCall = erc721.encodeFunctionData('tokenByIndex', [0]);
  const probe = await multicallRead(contract, [probeCall]);
  if (!probe[0]?.success) return null;

  const indexCalls = Array.from({ length: totalSupply }, (_, i) => erc721.encodeFunctionData('tokenByIndex', [i]));
  const tokenIds = await readChunks(contract, indexCalls, (data) => Number(erc721.decodeFunctionResult('tokenByIndex', data)[0]));
  if (tokenIds.filter((x) => Number.isInteger(x) && x >= 0).length !== totalSupply) return null;

  const ownerCalls = tokenIds.map((tokenId) => erc721.encodeFunctionData('ownerOf', [tokenId]));
  const owners = await readChunks(contract, ownerCalls, (data) => String(erc721.decodeFunctionResult('ownerOf', data)[0]).toLowerCase());
  if (owners.filter(Boolean).length !== totalSupply) return null;
  return owners;
}

async function sequentialOwners(contract, totalSupply) {
  const extra = Math.min(12000, Math.max(2500, Math.ceil(totalSupply * 0.8)));
  const maxId = totalSupply + extra;
  const calls = Array.from({ length: maxId + 1 }, (_, tokenId) => erc721.encodeFunctionData('ownerOf', [tokenId]));
  const owners = await readChunks(contract, calls, (data) => String(erc721.decodeFunctionResult('ownerOf', data)[0]).toLowerCase());
  const liveOwners = owners.filter(Boolean);
  if (liveOwners.length < totalSupply) {
    throw new Error(`FORGE found ${liveOwners.length.toLocaleString()} live ERC-721 tokens but expected ${totalSupply.toLocaleString()}. This collection may use sparse or custom token IDs.`);
  }
  return liveOwners.slice(0, totalSupply);
}

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const contract = String(req.query?.contract || '').trim().toLowerCase();
  if (!isAddress(contract)) return res.status(400).json({ error: 'Invalid contract address' });

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');

  try {
    const info = await metadata(contract);
    let owners = await enumerableOwners(contract, info.totalSupply);
    let source = 'multicall-enumerable';

    if (!owners) {
      owners = await sequentialOwners(contract, info.totalSupply);
      source = 'multicall-ownerof';
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
    console.error('FORGE holders error', contract, error);
    const message = String(error?.message || 'Could not load holder data from Robinhood Chain right now.');
    let status = /does not expose|larger than|sparse|custom token IDs/i.test(message) ? 422 : 502;
    let publicMessage = message;
    if (/RPC_RATE_LIMIT|RPC HTTP 429/i.test(message)) {
      status = 503;
      publicMessage = 'Robinhood public RPC is rate-limiting this scan. Please retry in a moment.';
    }
    return res.status(status).json({ error: publicMessage });
  }
}

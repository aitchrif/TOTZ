import { Interface } from 'ethers';

const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
const MAX_SUPPLY = 20000;
const MULTICALL_SIZE = 500;
const DISCOVERY_EMPTY_STOP = 1000;
const REQUEST_BUDGET_MS = 52000;
const MIN_REMAINING_MS = 700;

const CHAINS = {
  robinhood: {
    key: 'robinhood', name: 'Robinhood Chain', chainId: 4663, confirmations: 2,
    rpcs: [process.env.ROBINHOOD_RPC_URL, 'https://rpc.mainnet.chain.robinhood.com'].filter(Boolean)
  },
  ink: {
    key: 'ink', name: 'Ink', chainId: 57073, confirmations: 2,
    rpcs: [process.env.INK_RPC_URL, 'https://rpc-gel.inkonchain.com', 'https://rpc-qnd.inkonchain.com'].filter(Boolean)
  },
  ethereum: {
    key: 'ethereum', name: 'Ethereum', chainId: 1, confirmations: 3,
    rpcs: [
      process.env.ETHEREUM_RPC_URL,
      'https://public.1rpc.io/eth',
      'https://eth.drpc.org',
      'https://ethereum-rpc.publicnode.com',
      'https://cloudflare-eth.com'
    ].filter(Boolean)
  }
};

const erc721 = new Interface([
  'function totalSupply() view returns (uint256)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function tokenByIndex(uint256) view returns (uint256)',
  'function ownerOf(uint256) view returns (address)',
  'function balanceOf(address) view returns (uint256)'
]);

const multicall = new Interface([
  'function aggregate3((address target,bool allowFailure,bytes callData)[] calls) payable returns ((bool success,bytes returnData)[] returnData)'
]);

function isAddress(value) { return /^0x[a-fA-F0-9]{40}$/.test(String(value || '')); }
function isBytes32(value) { return /^0x[a-fA-F0-9]{64}$/.test(String(value || '')); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function toBlockTag(blockNumber) { return `0x${Math.max(0, Number(blockNumber || 0)).toString(16)}`; }
function remainingMs(chain) { return Math.max(0, Number(chain.deadlineAt || 0) - Date.now()); }
function deadlineGuard(chain) {
  if (remainingMs(chain) < MIN_REMAINING_MS) throw new Error('REQUEST_DEADLINE');
}

function requestChain(base) {
  return {
    ...base,
    rpcs: [...new Set(base.rpcs)],
    deadlineAt: Date.now() + REQUEST_BUDGET_MS,
    validatedEndpoints: new Set(),
    snapshotEndpointsUsed: new Set(),
    snapshotBlockTag: null,
    snapshotBlockHash: null
  };
}

async function rpcFetch(chain, endpoint, method, params, timeoutMs) {
  deadlineGuard(chain);
  const budget = remainingMs(chain);
  const attemptTimeout = Math.max(250, Math.min(Number(timeoutMs || 7000), budget - 250));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), attemptTimeout);
  try {
    const response = await fetch(endpoint, {
      method: 'POST', signal: controller.signal,
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
    });
    if (response.status === 429) throw new Error('RATE_LIMIT');
    if (!response.ok) throw new Error(`RPC_HTTP_${response.status}`);
    const json = await response.json();
    if (json?.error) {
      const detail = String(json.error.message || 'RPC error').replace(/https?:\/\/\S+/gi, '[endpoint]').slice(0, 180);
      throw new Error(`RPC_ERROR:${detail}`);
    }
    return json?.result;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('RPC_TIMEOUT');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function validateEndpointChain(chain, endpoint) {
  if (chain.validatedEndpoints.has(endpoint)) return;
  const result = await rpcFetch(chain, endpoint, 'eth_chainId', [], 4000);
  let actual;
  try { actual = Number(BigInt(result || '0x0')); } catch (_) { actual = 0; }
  if (actual !== Number(chain.chainId)) throw new Error('RPC_CHAIN_MISMATCH');
  chain.validatedEndpoints.add(endpoint);
}

function hashBoundParams(chain, method, params) {
  if (!chain.snapshotBlockHash) return { params, bound: false };
  if (method !== 'eth_call' && method !== 'eth_getCode') return { params, bound: false };
  if (!Array.isArray(params) || params.length < 2) return { params, bound: false };
  const expectedTag = String(chain.snapshotBlockTag || '').toLowerCase();
  const suppliedTag = String(params[params.length - 1] || '').toLowerCase();
  if (!expectedTag || suppliedTag !== expectedTag) return { params, bound: false };
  const next = params.slice();
  next[next.length - 1] = { blockHash: chain.snapshotBlockHash, requireCanonical: true };
  return { params: next, bound: true };
}

async function validateEndpointSnapshot(chain, endpoint) {
  if (!chain.snapshotBlockTag || !chain.snapshotBlockHash) return;
  const block = await rpcFetch(chain, endpoint, 'eth_getBlockByNumber', [chain.snapshotBlockTag, false], 5000);
  const hash = String(block?.hash || '').toLowerCase();
  if (!isBytes32(hash) || hash !== chain.snapshotBlockHash) throw new Error('RPC_SNAPSHOT_MISMATCH');
}

async function assertSnapshotCanonical(chain) {
  if (!chain.snapshotBlockTag || !chain.snapshotBlockHash) throw new Error('RPC_SNAPSHOT_UNAVAILABLE');
  const endpoints = chain.snapshotEndpointsUsed.size ? [...chain.snapshotEndpointsUsed] : chain.rpcs.slice(0, 1);
  if (!endpoints.length) throw new Error('RPC_UNAVAILABLE');
  for (const endpoint of endpoints) {
    deadlineGuard(chain);
    await validateEndpointChain(chain, endpoint);
    await validateEndpointSnapshot(chain, endpoint);
  }
}

async function rpc(chain, method, params, { timeoutMs = 7000, retries = 1, requireSnapshot = true } = {}) {
  let lastError;
  const endpoints = chain.rpcs;
  if (!endpoints.length) throw new Error('RPC_UNAVAILABLE');

  for (let attempt = 0; attempt <= retries; attempt++) {
    for (const endpoint of endpoints) {
      deadlineGuard(chain);
      try {
        if (method !== 'eth_chainId') await validateEndpointChain(chain, endpoint);
        const shouldBind = requireSnapshot && !['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getBlockByHash'].includes(method);
        let callParams = params;
        let bound = false;
        if (shouldBind) {
          await validateEndpointSnapshot(chain, endpoint);
          const binding = hashBoundParams(chain, method, params);
          callParams = binding.params;
          bound = binding.bound;
          if ((method === 'eth_call' || method === 'eth_getCode') && !bound) throw new Error('RPC_HASH_BINDING_REQUIRED');
        }
        const result = await rpcFetch(chain, endpoint, method, callParams, timeoutMs);
        if (bound) chain.snapshotEndpointsUsed.add(endpoint);
        return result;
      } catch (error) {
        lastError = error;
        if (String(error?.message || '').includes('REQUEST_DEADLINE')) throw error;
      }
    }
    if (attempt < retries) {
      deadlineGuard(chain);
      await sleep(Math.min(300 * (attempt + 1), Math.max(0, remainingMs(chain) - 500)));
    }
  }
  throw lastError || new Error('RPC_UNAVAILABLE');
}

async function snapshotBlock(chain) {
  const result = await rpc(chain, 'eth_blockNumber', [], { timeoutMs: 5000, retries: 1, requireSnapshot: false });
  const latest = Number(BigInt(result || '0x0'));
  const number = Math.max(0, latest - Number(chain.confirmations || 0));
  const tag = toBlockTag(number);
  const block = await rpc(chain, 'eth_getBlockByNumber', [tag, false], { timeoutMs: 5000, retries: 1, requireSnapshot: false });
  const hash = String(block?.hash || '').toLowerCase();
  if (!isBytes32(hash)) throw new Error('RPC_SNAPSHOT_UNAVAILABLE');
  chain.snapshotBlockTag = tag;
  chain.snapshotBlockHash = hash;
  chain.snapshotEndpointsUsed = new Set();
  return { number, tag, hash };
}

async function requestedSnapshot(chain, blockNumber, blockHash) {
  const number = Number(blockNumber);
  const hash = String(blockHash || '').toLowerCase();
  if (!Number.isSafeInteger(number) || number < 0 || !isBytes32(hash)) throw new Error('SNAPSHOT_PROVENANCE_INVALID');
  const tag = toBlockTag(number);
  const block = await rpc(chain, 'eth_getBlockByNumber', [tag, false], { timeoutMs: 5000, retries: 1, requireSnapshot: false });
  const canonicalHash = String(block?.hash || '').toLowerCase();
  if (canonicalHash !== hash) throw new Error('RPC_SNAPSHOT_MISMATCH');
  chain.snapshotBlockTag = tag;
  chain.snapshotBlockHash = hash;
  chain.snapshotEndpointsUsed = new Set();
  return { number, tag, hash };
}

async function resolveSnapshot(chain, query) {
  const requestedBlock = query?.snapshotBlock;
  const requestedHash = query?.snapshotBlockHash;
  const hasBlock = requestedBlock !== undefined && requestedBlock !== null && String(requestedBlock) !== '';
  const hasHash = requestedHash !== undefined && requestedHash !== null && String(requestedHash) !== '';
  if (hasBlock !== hasHash) throw new Error('SNAPSHOT_PROVENANCE_INVALID');
  return hasBlock ? requestedSnapshot(chain, requestedBlock, requestedHash) : snapshotBlock(chain);
}

async function assertContract(chain, contract, blockTag) {
  const code = await rpc(chain, 'eth_getCode', [contract, blockTag], { timeoutMs: 6000, retries: 1 });
  if (!code || code === '0x' || code === '0x0') throw new Error('No smart contract exists at this address on the selected network.');
}

async function multicallRead(chain, contract, callDatas, blockTag) {
  if (!callDatas.length) return [];
  deadlineGuard(chain);
  const calls = callDatas.map((callData) => ({ target: contract, allowFailure: true, callData }));
  const data = multicall.encodeFunctionData('aggregate3', [calls]);
  const result = await rpc(chain, 'eth_call', [{ to: MULTICALL3, data }, blockTag], { timeoutMs: 9000, retries: 1 });
  const decoded = multicall.decodeFunctionResult('aggregate3', result)[0];
  return decoded.map((item) => ({ success: Boolean(item.success), returnData: item.returnData }));
}

async function readChunks(chain, contract, callDatas, decoder, blockTag) {
  const out = [];
  for (let i = 0; i < callDatas.length; i += MULTICALL_SIZE) {
    deadlineGuard(chain);
    const chunk = callDatas.slice(i, i + MULTICALL_SIZE);
    const results = await multicallRead(chain, contract, chunk, blockTag);
    for (const result of results) {
      if (!result.success) { out.push(null); continue; }
      try { out.push(decoder(result.returnData)); } catch (_) { out.push(null); }
    }
    if (i + MULTICALL_SIZE < callDatas.length) await sleep(30);
  }
  return out;
}

async function metadata(chain, contract, blockTag) {
  const calls = [erc721.encodeFunctionData('totalSupply', []), erc721.encodeFunctionData('name', []), erc721.encodeFunctionData('symbol', [])];
  const results = await multicallRead(chain, contract, calls, blockTag);
  let totalSupply = null, name = '', symbol = '';
  if (results[0]?.success) { try { totalSupply = Number(erc721.decodeFunctionResult('totalSupply', results[0].returnData)[0]); } catch (_) {} }
  if (results[1]?.success) { try { name = String(erc721.decodeFunctionResult('name', results[1].returnData)[0] || ''); } catch (_) {} }
  if (results[2]?.success) { try { symbol = String(erc721.decodeFunctionResult('symbol', results[2].returnData)[0] || ''); } catch (_) {} }
  if (!Number.isInteger(totalSupply) || totalSupply <= 0) totalSupply = null;
  if (totalSupply && totalSupply > MAX_SUPPLY) throw new Error(`This collection has ${totalSupply.toLocaleString()} live NFTs. X-RAY V1 currently supports up to ${MAX_SUPPLY.toLocaleString()} per scan.`);
  return { totalSupply, name, symbol, type: 'ERC-721' };
}

function aggregateOwners(owners) {
  const map = new Map();
  for (const owner of owners) {
    const address = String(owner || '').toLowerCase();
    if (!isAddress(address) || address === '0x0000000000000000000000000000000000000000') continue;
    map.set(address, (map.get(address) || 0) + 1);
  }
  return [...map.entries()].map(([address, balance]) => ({ address, balance })).sort((a, b) => b.balance - a.balance || a.address.localeCompare(b.address));
}

async function enumerableOwners(chain, contract, totalSupply, blockTag) {
  const probe = await multicallRead(chain, contract, [erc721.encodeFunctionData('tokenByIndex', [0])], blockTag);
  if (!probe[0]?.success) return null;
  const indexCalls = Array.from({ length: totalSupply }, (_, index) => erc721.encodeFunctionData('tokenByIndex', [index]));
  const tokenIds = await readChunks(chain, contract, indexCalls, (data) => erc721.decodeFunctionResult('tokenByIndex', data)[0], blockTag);
  if (tokenIds.filter((value) => value !== null).length !== totalSupply) return null;
  const ownerCalls = tokenIds.map((tokenId) => erc721.encodeFunctionData('ownerOf', [tokenId]));
  const owners = await readChunks(chain, contract, ownerCalls, (data) => String(erc721.decodeFunctionResult('ownerOf', data)[0]).toLowerCase(), blockTag);
  if (owners.filter(Boolean).length !== totalSupply) return null;
  const numericIds = tokenIds.map((id) => { try { return Number(id); } catch (_) { return null; } }).filter((id) => Number.isSafeInteger(id));
  return {
    owners,
    complete: true,
    diagnostics: {
      enumeration: 'erc721-enumerable', firstTokenId: numericIds.length ? Math.min(...numericIds) : null,
      lastTokenId: numericIds.length ? Math.max(...numericIds) : null, tokenZeroExists: numericIds.includes(0), supplyMode: 'totalSupply'
    }
  };
}

async function probeOwner(chain, contract, tokenId, blockTag) {
  const result = await multicallRead(chain, contract, [erc721.encodeFunctionData('ownerOf', [tokenId])], blockTag);
  if (!result[0]?.success) return null;
  try { return String(erc721.decodeFunctionResult('ownerOf', result[0].returnData)[0]).toLowerCase(); } catch (_) { return null; }
}

async function sequentialOwners(chain, contract, totalSupply, blockTag) {
  const zeroOwner = await probeOwner(chain, contract, 0, blockTag);
  const oneOwner = await probeOwner(chain, contract, 1, blockTag);
  const start = zeroOwner ? 0 : (oneOwner ? 1 : 0);
  let end = start + totalSupply - 1;
  const maxEnd = end + Math.min(12000, Math.max(3000, Math.ceil(totalSupply * .8)));
  const owners = [];
  let scannedUntil = start - 1, firstLiveId = null, lastLiveId = null;

  while (owners.length < totalSupply && scannedUntil < maxEnd) {
    deadlineGuard(chain);
    const batchStart = scannedUntil + 1;
    const batchEnd = Math.min(maxEnd, Math.max(end, batchStart + 999));
    const tokenIds = [];
    for (let tokenId = batchStart; tokenId <= batchEnd; tokenId++) tokenIds.push(tokenId);
    const calls = tokenIds.map((tokenId) => erc721.encodeFunctionData('ownerOf', [tokenId]));
    const batchOwners = await readChunks(chain, contract, calls, (data) => String(erc721.decodeFunctionResult('ownerOf', data)[0]).toLowerCase(), blockTag);
    batchOwners.forEach((owner, index) => {
      if (!owner || owners.length >= totalSupply) return;
      const tokenId = tokenIds[index]; owners.push(owner);
      if (firstLiveId === null) firstLiveId = tokenId; lastLiveId = tokenId;
    });
    scannedUntil = batchEnd;
    end = Math.max(end, scannedUntil + 1000);
  }

  if (owners.length < totalSupply) throw new Error(`FORGE found ${owners.length.toLocaleString()} live ERC-721 tokens but expected ${totalSupply.toLocaleString()}. This collection likely uses sparse or custom token IDs and needs an indexed scan.`);
  return {
    owners,
    complete: true,
    diagnostics: {
      enumeration: 'ownerof-range', firstTokenId: firstLiveId, lastTokenId: lastLiveId,
      tokenZeroExists: Boolean(zeroOwner), supplyMode: 'totalSupply'
    }
  };
}

async function discoverSequentialOwners(chain, contract, blockTag) {
  const zeroOwner = await probeOwner(chain, contract, 0, blockTag);
  const oneOwner = await probeOwner(chain, contract, 1, blockTag);
  if (!zeroOwner && !oneOwner) throw new Error('This ERC-721 does not expose totalSupply() and FORGE could not discover a sequential token range. Sparse/custom-ID collections need an indexed scan.');

  const start = zeroOwner ? 0 : 1;
  const maxTokenId = start + MAX_SUPPLY - 1;
  const owners = [];
  let firstLiveId = null;
  let lastLiveId = null;
  let consecutiveEmpty = 0;
  let scannedUntil = start - 1;
  let stoppedOnEmptyGap = false;

  while (scannedUntil < maxTokenId) {
    deadlineGuard(chain);
    const batchStart = scannedUntil + 1;
    const batchEnd = Math.min(maxTokenId, batchStart + MULTICALL_SIZE - 1);
    const tokenIds = [];
    for (let tokenId = batchStart; tokenId <= batchEnd; tokenId++) tokenIds.push(tokenId);
    const calls = tokenIds.map((tokenId) => erc721.encodeFunctionData('ownerOf', [tokenId]));
    const batchOwners = await readChunks(chain, contract, calls, (data) => String(erc721.decodeFunctionResult('ownerOf', data)[0]).toLowerCase(), blockTag);

    for (let i = 0; i < batchOwners.length; i++) {
      const owner = batchOwners[i];
      const tokenId = tokenIds[i];
      if (owner && isAddress(owner) && owner !== '0x0000000000000000000000000000000000000000') {
        owners.push(owner);
        if (firstLiveId === null) firstLiveId = tokenId;
        lastLiveId = tokenId;
        consecutiveEmpty = 0;
      } else if (firstLiveId !== null) {
        consecutiveEmpty++;
      }
    }

    scannedUntil = batchEnd;
    if (firstLiveId !== null && consecutiveEmpty >= DISCOVERY_EMPTY_STOP) { stoppedOnEmptyGap = true; break; }
    if (batchEnd < maxTokenId) await sleep(25);
  }

  if (!owners.length) throw new Error('No live ERC-721 tokens were discovered in the supported token range.');

  return {
    owners,
    complete: false,
    diagnostics: {
      enumeration: 'ownerof-discovery', firstTokenId: firstLiveId, lastTokenId: lastLiveId,
      tokenZeroExists: Boolean(zeroOwner), supplyMode: 'discovered-partial', scannedUntil,
      emptyStop: DISCOVERY_EMPTY_STOP, stoppedOnEmptyGap,
      warning: 'totalSupply() is unavailable, so this ownerOf range discovery is best-effort and cannot prove collection completeness.'
    }
  };
}

async function walletBalance(chain, contract, wallet, blockTag) {
  const result = await multicallRead(chain, contract, [erc721.encodeFunctionData('balanceOf', [wallet])], blockTag);
  if (!result[0]?.success) throw new Error('Could not read this wallet balance from the contract.');
  return Number(erc721.decodeFunctionResult('balanceOf', result[0].returnData)[0]);
}

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  const chainKey = String(req.query?.chain || 'robinhood').trim().toLowerCase();
  const baseChain = CHAINS[chainKey];
  if (!baseChain) return res.status(400).json({ error: 'Unsupported network. Use robinhood, ink, or ethereum.' });
  const chain = requestChain(baseChain);
  const contract = String(req.query?.contract || '').trim().toLowerCase();
  if (!isAddress(contract)) return res.status(400).json({ error: 'Invalid contract address' });

  try {
    const snapshot = await resolveSnapshot(chain, req.query);
    const blockNumber = snapshot.number;
    const blockTag = snapshot.tag;
    await assertContract(chain, contract, blockTag);

    if (String(req.query?.mode || '').toLowerCase() === 'balance') {
      const wallet = String(req.query?.wallet || '').trim().toLowerCase();
      if (!isAddress(wallet)) return res.status(400).json({ error: 'Invalid wallet address' });
      res.setHeader('Cache-Control', 'no-store');
      const balance = await walletBalance(chain, contract, wallet, blockTag);
      await assertSnapshotCanonical(chain);
      return res.status(200).json({
        chain: chain.key, chainId: chain.chainId, contract, wallet, balance,
        snapshotBlock: blockNumber, snapshotBlockHash: snapshot.hash, complete: true, partial: false,
        fetchedAt: new Date().toISOString()
      });
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    const info = await metadata(chain, contract, blockTag);
    let ownership;
    let source;
    let complete = true;

    if (info.totalSupply) {
      ownership = await enumerableOwners(chain, contract, info.totalSupply, blockTag);
      source = 'multicall-enumerable';
      if (!ownership) { ownership = await sequentialOwners(chain, contract, info.totalSupply, blockTag); source = 'multicall-ownerof'; }
    } else {
      ownership = await discoverSequentialOwners(chain, contract, blockTag);
      source = 'multicall-ownerof-discovery';
      complete = false;
    }

    const holders = aggregateOwners(ownership.owners);
    if (!holders.length) throw new Error('No current holders found.');
    complete = complete && ownership.complete !== false;
    const discoveredTokens = ownership.owners.length;
    await assertSnapshotCanonical(chain);

    return res.status(200).json({
      chain: chain.key,
      chainId: chain.chainId,
      contract,
      snapshotBlock: blockNumber,
      snapshotBlockHash: snapshot.hash,
      info: {
        name: info.name || 'NFT Collection', symbol: info.symbol || '',
        totalSupply: complete ? info.totalSupply : null,
        discoveredTokens,
        holdersCount: holders.length,
        type: info.type
      },
      holders,
      source,
      diagnostics: ownership.diagnostics,
      complete,
      partial: !complete,
      provenance: {
        chainId: chain.chainId,
        blockNumber,
        blockHash: snapshot.hash,
        source,
        completeness: complete ? 'provable' : 'best-effort-partial',
        readBinding: 'eip-1898-blockhash-requireCanonical'
      },
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('FORGE holders error', chainKey, contract, error?.message || error);
    const message = String(error?.message || 'Could not load holder data right now.');
    let status = /not supported|custom token IDs|custom-ID|sparse|No smart contract|up to|discovery window|token-ID scan/i.test(message) ? 422 : 502;
    let publicMessage = message;

    if (/REQUEST_DEADLINE|RPC_TIMEOUT|aborted|timeout/i.test(message)) {
      status = 504;
      publicMessage = 'The on-chain scan reached its safe execution limit. Please retry; no partial allocation data was accepted.';
    } else if (/RATE_LIMIT|429/i.test(message)) {
      status = 503;
      publicMessage = `${chain.name} RPC is rate-limiting this scan. Please retry in a moment.`;
    } else if (/RPC_CHAIN_MISMATCH/i.test(message)) {
      status = 503;
      publicMessage = `A configured ${chain.name} RPC reported the wrong chain ID. The scan was rejected.`;
    } else if (/RPC_SNAPSHOT_MISMATCH|RPC_SNAPSHOT_UNAVAILABLE|SNAPSHOT_PROVENANCE_INVALID/i.test(message)) {
      status = 503;
      publicMessage = 'The requested snapshot block is not canonically available with the expected hash. The scan was rejected.';
    } else if (/RPC_HASH_BINDING_REQUIRED/i.test(message)) {
      status = 503;
      publicMessage = 'This RPC cannot safely bind reads to the pinned block hash. The scan was rejected.';
    } else if (/RPC_HTTP|RPC_ERROR|RPC_UNAVAILABLE/i.test(message)) {
      status = 503;
      publicMessage = `${chain.name} RPC could not complete this hash-bound read. Please retry in a moment.`;
    }

    return res.status(status).json({ error: publicMessage });
  }
}

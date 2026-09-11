import fs from 'node:fs';
import vm from 'node:vm';
import { Interface } from 'ethers';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

process.env.ROBINHOOD_RPC_URL = 'https://mock.rpc.local';
const { default: handler } = await import('../api/forge-holders.js');

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

const CONTRACT = '0x1111111111111111111111111111111111111111';
const OWNER = '0x2222222222222222222222222222222222222222';
const MISSING_WALLET = '0x3333333333333333333333333333333333333333';
const HASH_A = `0x${'aa'.repeat(32)}`;
const HASH_B = `0x${'bb'.repeat(32)}`;

function jsonRpcResult(result) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

function encodeCallResult(callData, { partial = false } = {}) {
  const selector = String(callData || '').slice(0, 10).toLowerCase();
  if (selector === erc721.getFunction('totalSupply').selector.toLowerCase()) {
    return partial
      ? { success: false, returnData: '0x' }
      : { success: true, returnData: erc721.encodeFunctionResult('totalSupply', [1n]) };
  }
  if (selector === erc721.getFunction('name').selector.toLowerCase()) {
    return { success: true, returnData: erc721.encodeFunctionResult('name', ['Mock Collection']) };
  }
  if (selector === erc721.getFunction('symbol').selector.toLowerCase()) {
    return { success: true, returnData: erc721.encodeFunctionResult('symbol', ['MOCK']) };
  }
  if (selector === erc721.getFunction('tokenByIndex').selector.toLowerCase()) {
    if (partial) return { success: false, returnData: '0x' };
    const [index] = erc721.decodeFunctionData('tokenByIndex', callData);
    return Number(index) === 0
      ? { success: true, returnData: erc721.encodeFunctionResult('tokenByIndex', [1n]) }
      : { success: false, returnData: '0x' };
  }
  if (selector === erc721.getFunction('ownerOf').selector.toLowerCase()) {
    const [tokenId] = erc721.decodeFunctionData('ownerOf', callData);
    return Number(tokenId) === 1
      ? { success: true, returnData: erc721.encodeFunctionResult('ownerOf', [OWNER]) }
      : { success: false, returnData: '0x' };
  }
  if (selector === erc721.getFunction('balanceOf').selector.toLowerCase()) {
    return { success: true, returnData: erc721.encodeFunctionResult('balanceOf', [1n]) };
  }
  return { success: false, returnData: '0x' };
}

function makeRpcMock({ partial = false, reorgAfterEthCall = null } = {}) {
  let ethCallCount = 0;
  let reorged = false;
  const observedSelectors = [];

  const fetchMock = async (_url, options = {}) => {
    const body = JSON.parse(options.body || '{}');
    const { method, params = [] } = body;

    if (method === 'eth_chainId') return jsonRpcResult('0x1237');
    if (method === 'eth_blockNumber') return jsonRpcResult('0x66');
    if (method === 'eth_getBlockByNumber') {
      return jsonRpcResult({ number: '0x64', hash: reorged ? HASH_B : HASH_A });
    }
    if (method === 'eth_getCode') {
      const selector = params[1];
      assert(selector && selector.blockHash === HASH_A && selector.requireCanonical === true,
        'eth_getCode must be bound to the pinned block hash with requireCanonical=true');
      observedSelectors.push(selector);
      return jsonRpcResult('0x6001');
    }
    if (method === 'eth_call') {
      const selector = params[1];
      assert(selector && selector.blockHash === HASH_A && selector.requireCanonical === true,
        'eth_call must be bound to the pinned block hash with requireCanonical=true');
      observedSelectors.push(selector);
      const [calls] = multicall.decodeFunctionData('aggregate3', params[0].data);
      const results = calls.map((call) => encodeCallResult(call.callData, { partial }));
      ethCallCount++;
      const encoded = multicall.encodeFunctionResult('aggregate3', [results]);
      if (reorgAfterEthCall !== null && ethCallCount >= reorgAfterEthCall) reorged = true;
      return jsonRpcResult(encoded);
    }
    throw new Error(`Unexpected RPC method in test: ${method}`);
  };

  return { fetchMock, observedSelectors };
}

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

async function invoke(query, mock) {
  const originalFetch = global.fetch;
  global.fetch = mock;
  try {
    const req = { method: 'GET', query };
    const res = makeRes();
    await handler(req, res);
    return res;
  } finally {
    global.fetch = originalFetch;
  }
}

{
  const { fetchMock, observedSelectors } = makeRpcMock();
  const res = await invoke({ chain: 'robinhood', contract: CONTRACT }, fetchMock);
  assert(res.statusCode === 200, `Stable complete snapshot should succeed, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  assert(res.body?.complete === true && res.body?.partial === false, 'Stable enumerable snapshot must be complete.');
  assert(res.body?.snapshotBlockHash === HASH_A, 'Stable snapshot must retain the exact pinned block hash.');
  assert(res.body?.provenance?.readBinding === 'eip-1898-blockhash-requireCanonical', 'Snapshot must declare hash-bound read provenance.');
  assert(observedSelectors.length >= 3, 'Expected multiple block-hash-bound contract reads.');
  assert(String(res.headers['cache-control'] || '').includes('s-maxage=60'), 'Ordinary discovery scans may retain short shared caching.');
}

{
  const { fetchMock } = makeRpcMock({ reorgAfterEthCall: 1 });
  const res = await invoke({ chain: 'robinhood', contract: CONTRACT }, fetchMock);
  assert(res.statusCode === 503, `Mid-scan canonical hash change must fail closed, got ${res.statusCode}.`);
  assert(/snapshot block|canonically available|hash/i.test(String(res.body?.error || '')), 'Mid-scan reorg rejection should return a safe snapshot error.');
}

{
  const { fetchMock } = makeRpcMock({ partial: true });
  const res = await invoke({ chain: 'robinhood', contract: CONTRACT }, fetchMock);
  assert(res.statusCode === 200, `Partial discovery preview should return safely, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  assert(res.body?.partial === true && res.body?.complete === false, 'Discovery without totalSupply must remain explicitly partial.');
  assert(res.body?.info?.totalSupply === null, 'Partial discovery must not substitute discovered count as total supply.');
  assert(res.body?.info?.discoveredTokens === 1, 'Partial discovery should report discovered token count separately.');
}

{
  const { fetchMock } = makeRpcMock();
  const res = await invoke({
    chain: 'robinhood', contract: CONTRACT,
    snapshotBlock: '100', snapshotBlockHash: HASH_A
  }, fetchMock);
  assert(res.statusCode === 200, `Exact provenance revalidation should succeed, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  assert(String(res.headers['cache-control'] || '').startsWith('no-store'), 'Exact provenance success responses must be uncached.');
  assert(String(res.headers['cdn-cache-control'] || '') === 'no-store', 'Exact provenance must disable shared CDN caching.');
  assert(String(res.headers['vercel-cdn-cache-control'] || '') === 'no-store', 'Exact provenance must disable Vercel CDN caching.');
}

{
  const { fetchMock } = makeRpcMock();
  const wrongHash = `0x${'cc'.repeat(32)}`;
  const res = await invoke({
    chain: 'robinhood', contract: CONTRACT,
    snapshotBlock: '100', snapshotBlockHash: wrongHash
  }, fetchMock);
  assert(res.statusCode === 503, 'Requested snapshot provenance with the wrong block hash must fail closed.');
  assert(String(res.headers['cache-control'] || '').startsWith('no-store'), 'Exact provenance error responses must also be uncached.');
}

const forgeJs = fs.readFileSync('forge.js', 'utf8');
assert(forgeJs.includes('Partial discovery'), 'X-RAY must visibly label partial discovery.');
assert(forgeJs.includes('PARTIAL / BEST-EFFORT'), 'X-RAY CSV must preserve partial completeness metadata.');
assert(forgeJs.includes("current.complete ? 'Supply %' : 'Discovered %'"), 'X-RAY table/export must distinguish discovered share from supply share.');
assert(!/showStatus\(`Snapshot complete[^`]*`[^\n]*\);/.test(forgeJs) || forgeJs.includes('data.complete === true'), 'X-RAY completion copy must be conditional on API completeness.');

{
  const start = forgeJs.indexOf('function lookupWallet');
  const end = forgeJs.indexOf('\n  function updateCoverageLabels', start);
  assert(start >= 0 && end > start, 'Could not isolate the real X-RAY lookupWallet implementation for behavioral testing.');
  const lookupSource = forgeJs.slice(start, end);

  function runLookup(complete) {
    const elements = {
      lookupInput: { value: MISSING_WALLET }, lookupBalance: { textContent: '' }, lookupRank: { textContent: '' },
      lookupPercentile: { textContent: '' }, lookupMessage: { textContent: '' }
    };
    const sandbox = {
      elements,
      current: { complete, holderByAddress: {}, snapshotBlock: 100, holders: [], supply: 1 },
      $: (id) => elements[id],
      isAddress: (value) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '')),
      shortAddress: (address) => `${address.slice(0, 6)}…${address.slice(-4)}`,
      fmt: (n) => String(n),
      result: null
    };
    vm.runInNewContext(`${lookupSource}\nlookupWallet();\nresult = { balance: elements.lookupBalance.textContent, message: elements.lookupMessage.textContent };`, sandbox);
    return sandbox.result;
  }

  const partialMiss = runLookup(false);
  assert(partialMiss.balance === '—', `Partial wallet miss must display unknown/—, got ${JSON.stringify(partialMiss.balance)}.`);
  assert(/cannot prove.*zero/i.test(partialMiss.message), 'Partial wallet miss must explain that zero ownership is unproven.');
  const completeMiss = runLookup(true);
  assert(completeMiss.balance === '0', 'Provably complete wallet miss should still display 0.');
}

const launcher = fs.readFileSync('forge-claim-launcher.js', 'utf8');
assert(launcher.includes('assertSnapshotProvenance'), 'Claim launcher must independently revalidate source snapshot provenance.');
assert(launcher.includes('snapshotBlockHash'), 'Claim launcher must forward snapshot block hash metadata.');
assert(launcher.includes('publicationFingerprint'), 'Publication authorization must bind a provenance-aware package fingerprint.');
assert(launcher.includes('TOTZ_FORGE_PACKAGE_PROVENANCE_V1'), 'Publication package fingerprint must use the provenance-bound schema.');

console.log('FORGE SECURITY REGRESSION: PASS · hash-bound reads · uncached exact provenance · mid-scan reorg rejection · partial wallet lookup behavior · exact provenance revalidation');

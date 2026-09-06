import { Wallet, sha256, toUtf8Bytes } from 'ethers';

const SERVICE = process.env.FORGE_CLAIMS_URL || 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/forge-claims';
const KNOWN_WRONG_RUNTIME = '0x8eebc59eef9a42ee3897227b2cfb03895cf46545';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function request(route, { method = 'GET', body, headers = {}, query = '' } = {}) {
  const url = `${SERVICE}?route=${encodeURIComponent(route)}${query ? `&${query}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json', ...headers } : headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function expect(label, fn) {
  try {
    await fn();
    console.log(`PASS ${label}`);
  } catch (error) {
    console.error(`FAIL ${label}`);
    throw error;
  }
}

function publicationMessageV2(body) {
  const snapshotBlock = body.snapshotBlock == null ? '' : String(body.snapshotBlock);
  const fingerprint = String(body.packageFingerprint || '');
  return [
    'TOTZ FORGE CLAIM PUBLISH V2',
    `creator=${String(body.creatorWallet || '').toLowerCase()}`,
    `slug=${String(body.slug || '').toLowerCase()}`,
    `sourceChain=${String(body.sourceChain || '').toLowerCase()}`,
    `sourceChainId=${Number(body.sourceChainId || 0)}`,
    `sourceContract=${String(body.sourceContract || '').toLowerCase()}`,
    `snapshotBlock=${snapshotBlock}`,
    `rewardToken=${String(body.rewardToken || '').toLowerCase()}`,
    `rewardSymbol=${String(body.rewardSymbol || '')}`,
    `rewardDecimals=${Number(body.rewardDecimals)}`,
    `merkleRoot=${String(body.merkleRoot || '').toLowerCase()}`,
    `totalAllocatedUnits=${String(body.totalAllocatedUnits || '')}`,
    `eligibleWallets=${Number(body.eligibleWallets || 0)}`,
    `claimChainId=${Number(body.claimChainId || 0)}`,
    `claimContract=${String(body.claimContract || '').toLowerCase()}`,
    `deadline=${Number(body.deadline || 0)}`,
    `packageFingerprint=${fingerprint}`,
    `uploadTokenHash=${String(body.uploadTokenHash || '').toLowerCase()}`,
    `issuedAt=${Number(body.issuedAt || 0)}`,
  ].join('\n');
}

const creator = `0x${'11'.repeat(20)}`;
const sourceContract = `0x${'22'.repeat(20)}`;
const rewardToken = `0x${'33'.repeat(20)}`;
const claimContract = `0x${'44'.repeat(20)}`;
const root = `0x${'55'.repeat(32)}`;
const uploadToken = `0x${'ab'.repeat(32)}`;
const base = {
  slug: `security-probe-${Date.now().toString(36)}-abcdef`,
  uploadToken,
  uploadTokenHash: sha256(toUtf8Bytes(uploadToken)),
  creatorWallet: creator,
  sourceChain: 'robinhood-testnet',
  sourceChainId: 46630,
  sourceContract,
  sourceCollection: 'FORGE SECURITY PROBE',
  snapshotBlock: 0,
  rewardToken,
  rewardSymbol: 'tUSDG',
  rewardDecimals: 2,
  merkleRoot: root,
  totalAllocatedUnits: '1000',
  eligibleWallets: 1,
  claimChainId: 46630,
  claimContract,
  deadline: Math.floor(Date.now() / 1000) + 3600,
  packageFingerprint: 'security-probe',
  issuedAt: Math.floor(Date.now() / 1000),
};

await expect('invalid public slug is rejected', async () => {
  const r = await request('get', { query: 'slug=x' });
  assert(r.status === 400, `expected 400, got ${r.status}`);
});

await expect('unknown public claim returns 404', async () => {
  const r = await request('get', { query: 'slug=security-probe-does-not-exist' });
  assert(r.status === 404, `expected 404, got ${r.status}`);
});

await expect('create without upload token is rejected', async () => {
  const body = { ...base, uploadToken: '' };
  const r = await request('create', { method: 'POST', body });
  assert(r.status === 400, `expected 400, got ${r.status}`);
});

await expect('source-chain spoof is rejected before signature verification', async () => {
  const body = { ...base, sourceChain: 'ethereum', sourceChainId: 46630 };
  const r = await request('create', {
    method: 'POST', body,
    headers: { 'x-forge-upload-token': uploadToken },
  });
  assert(r.status === 400, `expected 400, got ${r.status}`);
  assert(String(r.json?.error || '').toLowerCase().includes('source chain'), `unexpected error: ${r.json?.error}`);
});

await expect('unsigned V2 publication is rejected', async () => {
  const r = await request('create', {
    method: 'POST', body: base,
    headers: { 'x-forge-upload-token': uploadToken },
  });
  assert(r.status === 403, `expected 403, got ${r.status}`);
  assert(String(r.json?.error || '').toLowerCase().includes('signature'), `unexpected error: ${r.json?.error}`);
});

await expect('malformed sponsor signature is rejected', async () => {
  const r = await request('create', {
    method: 'POST', body: { ...base, authSignature: '0x1234' },
    headers: { 'x-forge-upload-token': uploadToken },
  });
  assert(r.status === 403, `expected 403, got ${r.status}`);
});

await expect('V2 upload-token hash mismatch is rejected', async () => {
  const r = await request('create', {
    method: 'POST',
    body: { ...base, uploadTokenHash: `0x${'00'.repeat(32)}` },
    headers: { 'x-forge-upload-token': uploadToken },
  });
  assert(r.status === 403, `expected 403, got ${r.status}`);
  assert(String(r.json?.error || '').toLowerCase().includes('upload token hash'), `unexpected error: ${r.json?.error}`);
});

await expect('signed request with non-FORGE runtime is rejected', async () => {
  const signer = new Wallet(`0x${'01'.padStart(64, '0')}`);
  const signedToken = `0x${'cd'.repeat(32)}`;
  const body = {
    ...base,
    slug: `signed-runtime-probe-${Date.now().toString(36)}-abcdef`,
    uploadToken: signedToken,
    uploadTokenHash: sha256(toUtf8Bytes(signedToken)),
    creatorWallet: signer.address.toLowerCase(),
    rewardToken: KNOWN_WRONG_RUNTIME,
    claimContract: KNOWN_WRONG_RUNTIME,
    issuedAt: Math.floor(Date.now() / 1000),
    deadline: Math.floor(Date.now() / 1000) + 3600,
  };
  body.authSignature = await signer.signMessage(publicationMessageV2(body));
  const r = await request('create', {
    method: 'POST', body,
    headers: { 'x-forge-upload-token': signedToken },
  });
  assert(r.status === 409, `expected 409, got ${r.status}: ${r.json?.error || ''}`);
  assert(String(r.json?.error || '').toLowerCase().includes('approved totz forge build'), `unexpected error: ${r.json?.error}`);
});

await expect('upload to unknown session is rejected', async () => {
  const r = await request('upload', {
    method: 'POST',
    body: { slug: 'security-probe-does-not-exist', uploadToken, entries: [] },
    headers: { 'x-forge-upload-token': uploadToken },
  });
  assert(r.status === 404, `expected 404, got ${r.status}`);
});

await expect('publish to unknown session is rejected', async () => {
  const r = await request('publish', {
    method: 'POST',
    body: { slug: 'security-probe-does-not-exist', uploadToken },
    headers: { 'x-forge-upload-token': uploadToken },
  });
  assert(r.status === 404, `expected 404, got ${r.status}`);
});

console.log('FORGE live claims security probe passed.');

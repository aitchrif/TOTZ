import { readFile, appendFile } from 'node:fs/promises';
import {
  AbiCoder,
  Contract,
  ContractFactory,
  JsonRpcProvider,
  Wallet,
  formatEther,
  formatUnits,
  getAddress,
  hexlify,
  keccak256,
  randomBytes,
  sha256,
  toUtf8Bytes,
} from 'ethers';

const CHAIN_ID = 46630;
const RPC = process.env.FORGE_TESTNET_RPC_URL || 'https://rpc.testnet.chain.robinhood.com';
const SERVICE = process.env.FORGE_CLAIMS_URL || 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/forge-claims';
const PRIVATE_KEY = String(process.env.FORGE_TESTNET_OPERATOR_PRIVATE_KEY || '').trim();
const STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY || '';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function short(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function pairHash(a, b) {
  const ordered = BigInt(a) <= BigInt(b) ? [a, b] : [b, a];
  return keccak256(`0x${ordered[0].slice(2)}${ordered[1].slice(2)}`);
}

function claimLeaf(address, amount) {
  const inner = keccak256(AbiCoder.defaultAbiCoder().encode(
    ['address', 'uint256'],
    [getAddress(address), BigInt(amount)],
  ));
  return keccak256(inner);
}

function publicationMessageV2(body) {
  const snapshotBlock = body.snapshotBlock == null ? '' : String(body.snapshotBlock);
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
    `packageFingerprint=${String(body.packageFingerprint || '')}`,
    `uploadTokenHash=${String(body.uploadTokenHash || '').toLowerCase()}`,
    `issuedAt=${Number(body.issuedAt || 0)}`,
  ].join('\n');
}

async function request(route, { method = 'GET', body, query = '', uploadToken = '' } = {}) {
  const url = `${SERVICE}?route=${encodeURIComponent(route)}${query ? `&${query}` : ''}`;
  const headers = body ? { 'content-type': 'application/json' } : {};
  if (uploadToken) headers['x-forge-upload-token'] = uploadToken;
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const json = await response.json().catch(() => ({}));
  return { response, json };
}

async function expectRevert(label, action) {
  let reverted = false;
  try {
    await action();
  } catch {
    reverted = true;
  }
  assert(reverted, `${label} unexpectedly succeeded`);
  pass(`${label} is rejected`);
}

async function waitPastDeadline(provider, deadline) {
  for (;;) {
    const block = await provider.getBlock('latest');
    assert(block, 'Could not read latest Testnet block while waiting for recovery window');
    if (Number(block.timestamp) > Number(deadline)) return block;
    const remaining = Math.max(1, Number(deadline) - Number(block.timestamp) + 1);
    console.log(`Waiting for claim deadline: ~${remaining}s remaining on-chain…`);
    await new Promise((resolve) => setTimeout(resolve, Math.min(8000, Math.max(2500, remaining * 1000))));
  }
}

async function main() {
  assert(/^0x[a-fA-F0-9]{64}$/.test(PRIVATE_KEY), 'FORGE_TESTNET_OPERATOR_PRIVATE_KEY is missing or invalid. Use a dedicated Testnet-only wallet; never a Mainnet treasury key.');

  const [claimArtifact, tokenArtifact] = await Promise.all([
    readFile('artifacts/ForgeMerkleClaim.json', 'utf8').then(JSON.parse),
    readFile('artifacts/ForgeTestUSDG.json', 'utf8').then(JSON.parse),
  ]);
  assert(claimArtifact.compiler === '0.8.24', 'Unexpected ForgeMerkleClaim compiler');
  assert(tokenArtifact.compiler === '0.8.24', 'Unexpected ForgeTestUSDG compiler');

  const provider = new JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });
  const network = await provider.getNetwork();
  assert(Number(network.chainId) === CHAIN_ID, `Wrong RPC chain: ${network.chainId}`);

  const operator = new Wallet(PRIVATE_KEY, provider);
  const operatorAddress = operator.address.toLowerCase();
  const nativeBalance = await provider.getBalance(operator.address);
  assert(nativeBalance > 0n, `Testnet operator ${operator.address} has no ETH for gas`);
  pass(`Robinhood Testnet operator ready: ${short(operator.address)}`);

  const secondEligible = Wallet.createRandom();
  const nonEligible = Wallet.createRandom().connect(provider);
  const amountOperator = 1000n;
  const amountSecond = 2000n;
  const total = amountOperator + amountSecond;
  const leafOperator = claimLeaf(operator.address, amountOperator);
  const leafSecond = claimLeaf(secondEligible.address, amountSecond);
  const root = pairHash(leafOperator, leafSecond);
  const proofOperator = [leafSecond];
  const proofSecond = [leafOperator];

  const latest = await provider.getBlock('latest');
  assert(latest, 'Could not read latest Testnet block');
  // Long enough to satisfy backend publication freshness after two deployments,
  // short enough for a complete recovery rehearsal in one CI run.
  const deadline = Number(latest.timestamp) + 240;

  console.log('Deploying ForgeTestUSDG…');
  const tokenFactory = new ContractFactory(tokenArtifact.abi, tokenArtifact.bytecode, operator);
  const token = await tokenFactory.deploy(2);
  const tokenDeploy = token.deploymentTransaction();
  await token.waitForDeployment();
  const tokenAddress = (await token.getAddress()).toLowerCase();
  pass(`ForgeTestUSDG deployed: ${tokenAddress}`);

  console.log('Deploying ForgeMerkleClaim…');
  const claimFactory = new ContractFactory(claimArtifact.abi, claimArtifact.bytecode, operator);
  const claim = await claimFactory.deploy(tokenAddress, root, total, deadline, operator.address);
  const claimDeploy = claim.deploymentTransaction();
  await claim.waitForDeployment();
  const claimAddress = (await claim.getAddress()).toLowerCase();
  pass(`ForgeMerkleClaim deployed: ${claimAddress}`);

  const fundTx = await token.transfer(claimAddress, total);
  await fundTx.wait();
  assert(await claim.isFullyFunded(), 'Claim contract is not fully funded after transfer');
  assert(BigInt(await claim.contractBalance()) === total, 'Funded claim balance mismatch');
  pass('Exact reward pool funded');

  const slug = `forge-e2e-${Date.now().toString(36)}-${hexlify(randomBytes(3)).slice(2)}`.toLowerCase();
  const uploadToken = hexlify(randomBytes(32));
  const uploadTokenHash = sha256(toUtf8Bytes(uploadToken));
  const body = {
    slug,
    uploadToken,
    uploadTokenHash,
    creatorWallet: operatorAddress,
    sourceChain: 'robinhood-testnet',
    sourceChainId: CHAIN_ID,
    // The E2E fixture is testing the reward/claim pipeline rather than ERC-721 scanning;
    // a live Testnet contract address is sufficient for the protected publication record.
    sourceContract: tokenAddress,
    sourceCollection: 'FORGE TESTNET E2E',
    snapshotBlock: 0,
    rewardToken: tokenAddress,
    rewardSymbol: 'tUSDG',
    rewardDecimals: 2,
    merkleRoot: root,
    totalAllocatedUnits: total.toString(),
    eligibleWallets: 2,
    claimChainId: CHAIN_ID,
    claimContract: claimAddress,
    deadline,
    packageFingerprint: `testnet-e2e:${root}`,
    issuedAt: Math.floor(Date.now() / 1000),
  };
  body.authSignature = await operator.signMessage(publicationMessageV2(body));

  const create = await request('create', { method: 'POST', body, uploadToken });
  assert(create.response.status === 200, `Create failed (${create.response.status}): ${create.json?.error || 'unknown error'}`);
  assert(create.json?.onChainVerified === true && create.json?.runtimeAttested === true, 'Create did not attest the live claim contract');
  pass('Signed V2 publication session created and attested');

  const entries = [
    { wallet: operatorAddress, amountUnits: amountOperator.toString(), leaf: leafOperator, proof: proofOperator },
    { wallet: secondEligible.address.toLowerCase(), amountUnits: amountSecond.toString(), leaf: leafSecond, proof: proofSecond },
  ];
  const upload = await request('upload', {
    method: 'POST',
    body: { slug, uploadToken, entries },
    uploadToken,
  });
  assert(upload.response.status === 200, `Upload failed (${upload.response.status}): ${upload.json?.error || 'unknown error'}`);
  assert(Number(upload.json?.uploadedEntries) === 2, `Upload count mismatch: ${upload.json?.uploadedEntries}`);
  pass('Merkle entries uploaded and server-verified');

  const publish = await request('publish', {
    method: 'POST',
    body: { slug, uploadToken },
    uploadToken,
  });
  assert(publish.response.status === 200, `Publish failed (${publish.response.status}): ${publish.json?.error || 'unknown error'}`);
  assert(publish.json?.serverVerified === true && publish.json?.onChainVerified === true && publish.json?.runtimeAttested === true, 'Publish lost server/on-chain/runtime verification');
  pass('Epoch published transactionally');

  const publicGet = await request('get', { query: `slug=${encodeURIComponent(slug)}` });
  assert(publicGet.response.status === 200, `Published epoch GET failed (${publicGet.response.status})`);
  assert(String(publicGet.json?.epoch?.claim_contract || '').toLowerCase() === claimAddress, 'Public epoch claim contract mismatch');
  assert(Number(publicGet.json?.epoch?.uploaded_entries) === 2, 'Public epoch entry count mismatch');
  pass('Published epoch is publicly readable');

  // Holder UX pre-sign checks: the same live claim must have an estimable gas cost
  // and the signing wallet must be on the expected chain with enough native gas.
  const liveNetwork = await provider.getNetwork();
  assert(Number(liveNetwork.chainId) === CHAIN_ID, `Pre-sign chain guard expected ${CHAIN_ID}, got ${liveNetwork.chainId}`);
  const claimGas = BigInt(await claim.claim.estimateGas(amountOperator, proofOperator));
  assert(claimGas > 0n, 'Eligible claim gas estimate is zero');
  const feeData = await provider.getFeeData();
  const gasPrice = BigInt(feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n);
  assert(gasPrice > 0n, 'Testnet RPC returned no usable gas price');
  const estimatedFee = claimGas * gasPrice;
  const preClaimGasBalance = await provider.getBalance(operator.address);
  assert(preClaimGasBalance > estimatedFee, `Operator gas balance ${formatEther(preClaimGasBalance)} ETH is below estimated claim fee ${formatEther(estimatedFee)} ETH`);
  pass(`Pre-sign gas QA: ${claimGas} gas × ${formatUnits(gasPrice, 9)} gwei ≈ ${formatEther(estimatedFee)} ETH`);

  await claim.claim.staticCall(amountOperator, proofOperator);
  pass('Eligible claim simulates successfully before signing');

  const operatorBeforeClaim = BigInt(await token.balanceOf(operator.address));
  const claimTx = await claim.claim(amountOperator, proofOperator);
  const claimReceipt = await claimTx.wait();
  assert(Number(claimReceipt?.status ?? 0) === 1, 'Eligible claim transaction did not finish with status 1');
  const operatorAfterClaim = BigInt(await token.balanceOf(operator.address));
  assert(operatorAfterClaim - operatorBeforeClaim === amountOperator, 'Eligible wallet token delta does not match allocation');
  assert(await claim.claimed(operator.address), 'Eligible wallet is not marked claimed');
  assert(BigInt(await claim.totalClaimed()) === amountOperator, 'totalClaimed mismatch after claim');
  assert(BigInt(await claim.claimCount()) === 1n, 'claimCount mismatch after claim');
  pass('Eligible wallet claimed exact allocation');

  // Simulate a fresh page/RPC read after wallet UI interruption or reload. The contract,
  // not local pending state, is authoritative and must keep the Claim button fail-closed.
  const reloadedClaim = new Contract(claimAddress, claimArtifact.abi, provider);
  assert(await reloadedClaim.claimed(operator.address), 'Fresh on-chain reload did not preserve claimed=true');
  assert(BigInt(await reloadedClaim.totalClaimed()) === amountOperator, 'Fresh on-chain reload lost totalClaimed state');
  assert(BigInt(await reloadedClaim.claimCount()) === 1n, 'Fresh on-chain reload lost claimCount state');
  pass('Reload/on-chain reconciliation sees the completed claim immediately');

  await expectRevert('double claim', () => reloadedClaim.claim.staticCall(amountOperator, proofOperator, { from: operator.address }));
  const nonEligibleClaim = new Contract(claimAddress, claimArtifact.abi, nonEligible);
  await expectRevert('non-eligible claim', () => nonEligibleClaim.claim.staticCall(1n, []));

  const publicWalletGet = await request('get', {
    query: `slug=${encodeURIComponent(slug)}&wallet=${encodeURIComponent(operatorAddress)}`,
  });
  assert(publicWalletGet.response.status === 200, 'Published wallet proof GET failed');
  assert(String(publicWalletGet.json?.claim?.amount_units || '') === amountOperator.toString(), 'Published wallet allocation mismatch');
  assert(Array.isArray(publicWalletGet.json?.claim?.proof), 'Published wallet proof is malformed after claim');
  pass('Published wallet proof remains retrievable after claim/reload');

  await waitPastDeadline(provider, deadline);
  const balanceBeforeRecovery = BigInt(await claim.contractBalance());
  assert(balanceBeforeRecovery === amountSecond, `Unexpected unclaimed balance before recovery: ${balanceBeforeRecovery}`);
  const sponsorBeforeRecovery = BigInt(await token.balanceOf(operator.address));
  const recoverTx = await claim.recoverUnclaimed();
  await recoverTx.wait();
  const sponsorAfterRecovery = BigInt(await token.balanceOf(operator.address));
  assert(BigInt(await claim.contractBalance()) === 0n, 'Claim contract still holds tokens after recovery');
  assert(sponsorAfterRecovery - sponsorBeforeRecovery === balanceBeforeRecovery, 'Sponsor recovery delta mismatch');
  pass('Sponsor recovered the exact unclaimed balance after deadline');

  const summary = [
    '# TOTZ FORGE Testnet E2E — PASSED',
    '',
    `- Chain: Robinhood Testnet (${CHAIN_ID})`,
    `- Operator: \`${operator.address}\``,
    `- Epoch slug: \`${slug}\``,
    `- Test token: \`${tokenAddress}\``,
    `- Claim contract: \`${claimAddress}\``,
    `- Token deploy tx: \`${tokenDeploy?.hash || 'n/a'}\``,
    `- Claim deploy tx: \`${claimDeploy?.hash || 'n/a'}\``,
    `- Funding tx: \`${fundTx.hash}\``,
    `- Claim gas estimate: \`${claimGas}\``,
    `- Estimated claim fee at pre-sign gas price: \`${formatEther(estimatedFee)} ETH\``,
    `- Claim tx: \`${claimTx.hash}\``,
    `- Recovery tx: \`${recoverTx.hash}\``,
    '',
    'Verified: deploy → exact fund → V2 signed create → Merkle upload → publish → live gas estimate → eligible simulation → eligible claim → reload/on-chain reconcile → double-claim reject → non-eligible reject → deadline recovery.',
    '',
  ].join('\n');
  console.log(`\n${summary}`);
  if (STEP_SUMMARY) await appendFile(STEP_SUMMARY, summary, 'utf8');
}

main().catch((error) => {
  console.error('\nFORGE TESTNET WALLET E2E: FAILED');
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});

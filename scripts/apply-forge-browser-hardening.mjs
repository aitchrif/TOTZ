import fs from 'node:fs';

const CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/ethers/6.15.0/ethers.umd.min.js';
const SRI = 'sha512-UXYETj+vXKSURF1UlgVRLzWRS9ZiQTv3lcL4rbeLyqTXCPNZC6PTLF/Ik3uxm2Zo+E109cUpJPZfLxJsCgKSng==';
const CLAIM_CORE_HASH = '0xb90f55deac3bb7b4cc6743afb563abd27ac21e0df0ff02d7ce6ae289bb9b7e36';
const CLAIM_RUNTIME_HASH = '0x1623c3c1ef9fd939c30f02147c0b3d99e58ceaf86801717d1156bb58b8df376a';
const directTag = `<script src="${CDN_URL}" integrity="${SRI}" crossorigin="anonymous" referrerpolicy="no-referrer"></script>`;

const directFiles = ['forge-claim.html', 'forge-claim-launcher.html', 'forge-my-epochs.html', 'forge-floor-guard.html'];
for (const file of directFiles) {
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace(/<script\s+src="https:\/\/cdn\.jsdelivr\.net\/npm\/ethers@[^\"]+\/dist\/ethers\.umd\.min\.js"><\/script>/g, directTag);
  html = html.replace(/<script\s+src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/ethers\/6\.15\.0\/ethers\.umd\.min\.js"(?:\s+integrity="[^"]+")?(?:\s+crossorigin="[^"]+")?(?:\s+referrerpolicy="[^"]+")?><\/script>/g, directTag);
  fs.writeFileSync(file, html);
}

{
  const file = 'forge-epochs.html';
  let html = fs.readFileSync(file, 'utf8');
  const inlineBootstrap = /<script>\s*\(\(\) => \{\s*const loadRewardTokenFeature[\s\S]*?document\.body\.appendChild\(ethersScript\);\s*\}\)\(\);\s*<\/script>/;
  if (inlineBootstrap.test(html)) {
    html = html.replace(inlineBootstrap, '<script src="/forge-epochs-bootstrap.js?v=1"></script>');
  }
  if (!html.includes('/forge-epochs-bootstrap.js?v=1')) throw new Error('EPOCHS bootstrap replacement failed.');
  fs.writeFileSync(file, html);
}

{
  const file = 'forge-claim-launcher.js';
  let js = fs.readFileSync(file, 'utf8');
  const oldLoader = "async function loadArtifact(){if(artifact)return artifact;const r=await fetch('/artifacts/ForgeMerkleClaim.json',{cache:'no-store'});if(!r.ok)throw new Error('Claim contract artifact is unavailable.');artifact=await r.json();if(!artifact?.abi||!/^0x[0-9a-f]+$/i.test(artifact?.bytecode||''))throw new Error('Invalid claim contract artifact.');return artifact;}";
  const newLoader = `async function loadArtifact(){\n    if(artifact)return artifact;\n    const r=await fetch('/artifacts/ForgeMerkleClaim.release.json',{cache:'no-store'});\n    if(!r.ok)throw new Error('Source-controlled claim release artifact is unavailable.');\n    const next=await r.json();\n    if(next?.artifactFormat!=='TOTZ_FORGE_CLAIM_RELEASE_V1')throw new Error('Unexpected claim release artifact format.');\n    if(String(next?.normalizedCoreHash||'').toLowerCase()!=='${CLAIM_CORE_HASH}')throw new Error('Claim release artifact executable core is not approved.');\n    if(String(next?.normalizedRuntimeHash||'').toLowerCase()!=='${CLAIM_RUNTIME_HASH}')throw new Error('Claim release artifact runtime identity is not approved.');\n    if(next?.generatedFromSource!==true||!next?.abi||!/^0x[0-9a-f]+$/i.test(next?.bytecode||''))throw new Error('Invalid source-controlled claim release artifact.');\n    artifact=next;\n    return artifact;\n  }`;
  if (js.includes(oldLoader)) js = js.replace(oldLoader, newLoader);
  if (!js.includes('/artifacts/ForgeMerkleClaim.release.json')) throw new Error('Claim launcher artifact switch failed.');
  if (js.includes("fetch('/artifacts/ForgeMerkleClaim.json'")) throw new Error('Legacy claim artifact is still deployable from the launcher.');
  fs.writeFileSync(file, js);
}

{
  const file = 'vercel.json';
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  const forgeRule = (config.headers || []).find((rule) => rule.source === '/forge(.*)');
  if (!forgeRule) throw new Error('FORGE CSP header rule missing.');
  const cspHeader = (forgeRule.headers || []).find((header) => String(header.key).toLowerCase() === 'content-security-policy');
  if (!cspHeader) throw new Error('FORGE CSP value missing.');
  cspHeader.value = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://cdnjs.cloudflare.com; script-src-attr 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://yymwpnztjlyfxongwmsw.supabase.co https://rpc.mainnet.chain.robinhood.com https://rpc.testnet.chain.robinhood.com; frame-src 'none'; worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests";
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
}

const remaining = [];
for (const file of [...directFiles, 'forge-epochs.html']) {
  const html = fs.readFileSync(file, 'utf8');
  if (html.includes('cdn.jsdelivr.net/npm/ethers')) remaining.push(file);
}
if (remaining.length) throw new Error(`Unhardened ethers CDN references remain in: ${remaining.join(', ')}`);

console.log('FORGE browser and launcher release hardening patch applied.');

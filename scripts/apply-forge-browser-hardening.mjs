import fs from 'node:fs';

const CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/ethers/6.15.0/ethers.umd.min.js';
const SRI = 'sha512-UXYETj+vXKSURF1UlgVRLzWRS9ZiQTv3lcL4rbeLyqTXCPNZC6PTLF/Ik3uxm2Zo+E109cUpJPZfLxJsCgKSng==';
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

console.log('FORGE browser hardening patch applied.');

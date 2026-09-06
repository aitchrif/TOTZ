const SERVICE = process.env.FORGE_CLAIMS_URL || 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/forge-claims';
const SPONSOR = String(process.env.FORGE_CANARY_SPONSOR || '').trim().toLowerCase();
const HOURS = Number(process.env.FORGE_CANARY_HOURS || 4);
const MAX_WALLETS = Number(process.env.FORGE_CANARY_MAX_WALLETS || 10);
const STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY || '';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function writeSummary(text) {
  if (!STEP_SUMMARY) return;
  const { appendFile } = await import('node:fs/promises');
  await appendFile(STEP_SUMMARY, text, 'utf8');
}

async function main() {
  assert(/^0x[a-f0-9]{40}$/.test(SPONSOR), 'FORGE_CANARY_SPONSOR must be a valid 0x address.');
  assert(Number.isFinite(HOURS) && HOURS > 0 && HOURS <= 24, 'FORGE_CANARY_HOURS must be >0 and <=24.');
  assert(Number.isInteger(MAX_WALLETS) && MAX_WALLETS >= 1 && MAX_WALLETS <= 10, 'First FORGE Canary wallet cap must be 1-10.');

  const response = await fetch(`${SERVICE}?route=status`, { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  assert(response.status === 200, `FORGE release status failed (${response.status}).`);
  const mainnet = data?.mainnet || {};
  assert(Number(mainnet.chainId) === 4663, 'Release status is not Robinhood Mainnet.');
  assert(mainnet.masterEnabled === false, 'Mainnet master gate is already enabled. Lock it before preparing a Canary.');
  assert(mainnet.mode === 'locked', `Effective Mainnet mode is ${mainnet.mode || 'unknown'}, expected locked.`);
  assert(mainnet.canaryActive === false, 'A Canary is already active. Lock it before preparing another one.');
  assert(mainnet.rpcReady === true, 'Dedicated FORGE_MAINNET_RPC_URL is not ready. Configure and verify it before Canary preparation.');

  const expiresAt = new Date(Date.now() + HOURS * 60 * 60 * 1000).toISOString();
  const sql = `begin;\n\nupdate public.forge_release_config\nset value = ${sqlLiteral(SPONSOR)}, updated_at = now()\nwhere key = 'mainnet_canary_sponsor';\n\nupdate public.forge_release_config\nset value = ${sqlLiteral(String(MAX_WALLETS))}, updated_at = now()\nwhere key = 'mainnet_canary_max_wallets';\n\nupdate public.forge_release_config\nset value = ${sqlLiteral(expiresAt)}, updated_at = now()\nwhere key = 'mainnet_canary_expires_at';\n\nupdate public.forge_release_config\nset value = 'canary', updated_at = now()\nwhere key = 'mainnet_release_mode';\n\ncommit;`;

  console.log('FORGE CANARY PREPARATION: VALIDATED');
  console.log(`Sponsor: ${SPONSOR}`);
  console.log(`Wallet cap: ${MAX_WALLETS}`);
  console.log(`Authorization window: ${HOURS}h`);
  console.log(`Expires: ${expiresAt}`);
  console.log('\nSQL PREVIEW ONLY — NOT EXECUTED:\n');
  console.log(sql);

  await writeSummary([
    '# FORGE Mainnet Canary Preparation — VALIDATED',
    '',
    '- Mainnet master gate: **LOCKED**',
    '- Dedicated production RPC: **READY**',
    `- Sponsor: \`${SPONSOR}\``,
    `- Wallet cap: **${MAX_WALLETS}**`,
    `- Authorization window: **${HOURS}h**`,
    `- Expiry: \`${expiresAt}\``,
    '',
    '> This workflow does **not** modify Supabase or enable Mainnet. Review the SQL below and apply it only during the controlled Canary release procedure.',
    '',
    '```sql',
    sql,
    '```',
    '',
  ].join('\n'));
}

main().catch((error) => {
  console.error(`FORGE CANARY PREPARATION: BLOCKED — ${error?.message || error}`);
  process.exitCode = 1;
});

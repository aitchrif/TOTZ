const SERVICE = process.env.FORGE_CLAIMS_URL || 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/forge-claims';
const SPONSOR = String(process.env.FORGE_PILOT_SPONSOR || '').trim().toLowerCase();
const HOURS = Number(process.env.FORGE_PILOT_HOURS || 2);
const MAX_WALLETS = Number(process.env.FORGE_PILOT_MAX_WALLETS || 5);
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

async function readLockedReleaseState() {
  const response = await fetch(`${SERVICE}?route=status`, { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  assert(response.status === 200, `FORGE release status failed (${response.status}).`);
  const mainnet = data?.mainnet || {};
  assert(Number(mainnet.chainId) === 4663, 'Release status is not Robinhood Mainnet.');
  assert(mainnet.masterEnabled === false, 'Mainnet master gate is already enabled. Lock it before Pilot #2 preparation.');
  assert(mainnet.mode === 'locked', `Effective Mainnet mode is ${mainnet.mode || 'unknown'}, expected locked.`);
  assert(mainnet.canaryActive === false, 'A Mainnet release authorization is already active. Lock it before Pilot #2 preparation.');
  assert(mainnet.rpcReady === true, 'Dedicated FORGE_MAINNET_RPC_URL is not ready.');
  return mainnet;
}

async function main() {
  assert(/^0x[a-f0-9]{40}$/.test(SPONSOR), 'FORGE_PILOT_SPONSOR must be a valid lowercase 0x address.');
  assert(Number.isInteger(HOURS) && (HOURS === 1 || HOURS === 2), 'Pilot #2 authorization must be exactly 1 or 2 hours.');
  assert(Number.isInteger(MAX_WALLETS) && MAX_WALLETS === 5, 'FORGE Pilot #2 is locked to exactly 5 eligible wallets.');

  await readLockedReleaseState();

  const expiresAt = new Date(Date.now() + HOURS * 60 * 60 * 1000).toISOString();
  const sponsorSql = sqlLiteral(SPONSOR);
  const expirySql = sqlLiteral(expiresAt);

  const sql = `begin;\n\n-- Reassert fail-closed state inside the same transaction.\ninsert into public.forge_release_flags (key, enabled, updated_at)\nvalues ('mainnet_claims_enabled', false, now())\non conflict (key) do update\nset enabled = false, updated_at = excluded.updated_at;\n\n-- Stage Pilot #2: exact sponsor, five-wallet cap, short expiry.\ninsert into public.forge_release_config (key, value, updated_at)\nvalues\n  ('mainnet_canary_sponsor', ${sponsorSql}, now()),\n  ('mainnet_canary_max_wallets', '5', now()),\n  ('mainnet_canary_expires_at', ${expirySql}, now()),\n  ('mainnet_release_mode', 'canary', now())\non conflict (key) do update\nset value = excluded.value, updated_at = excluded.updated_at;\n\n-- Fail the whole transaction unless the staged policy is exactly Pilot #2.\ndo $$\ndeclare\n  v_mode text;\n  v_sponsor text;\n  v_max integer;\n  v_expiry timestamptz;\nbegin\n  select lower(trim(value)) into v_mode from public.forge_release_config where key='mainnet_release_mode';\n  select lower(trim(value)) into v_sponsor from public.forge_release_config where key='mainnet_canary_sponsor';\n  select trim(value)::integer into v_max from public.forge_release_config where key='mainnet_canary_max_wallets';\n  select trim(value)::timestamptz into v_expiry from public.forge_release_config where key='mainnet_canary_expires_at';\n\n  if v_mode <> 'canary' then raise exception 'FORGE Pilot #2 arm blocked: release mode mismatch.'; end if;\n  if v_sponsor <> ${sponsorSql} then raise exception 'FORGE Pilot #2 arm blocked: sponsor mismatch.'; end if;\n  if v_max <> 5 then raise exception 'FORGE Pilot #2 arm blocked: wallet cap must be exactly five.'; end if;\n  if v_expiry <= now() or v_expiry > now() + interval '2 hours' then raise exception 'FORGE Pilot #2 arm blocked: expiry must be within 2 hours.'; end if;\nend\n$$;\n\n-- Arm LAST. No half-configured release can be observed externally.\ninsert into public.forge_release_flags (key, enabled, updated_at)\nvalues ('mainnet_claims_enabled', true, now())\non conflict (key) do update\nset enabled = true, updated_at = excluded.updated_at;\n\ncommit;`;

  console.log('FORGE MAINNET PILOT #2 ARM: VALIDATED');
  console.log(`Sponsor: ${SPONSOR}`);
  console.log('Eligible wallet cap: 5');
  console.log(`Authorization window: ${HOURS}h`);
  console.log(`Expires: ${expiresAt}`);
  console.log('\nSQL PREVIEW ONLY — NOT EXECUTED:\n');
  console.log(sql);

  await writeSummary([
    '# FORGE Mainnet Pilot #2 Arm — PREVIEW ONLY',
    '',
    '- Current live Mainnet state: **LOCKED**',
    '- Production RPC: **READY**',
    `- Sponsor: \`${SPONSOR}\``,
    '- Eligible wallet cap: **5**',
    '- Reward policy: **0.01 USDG per wallet / 0.05 USDG exact pool**',
    `- Authorization window: **${HOURS}h**`,
    `- Expiry: \`${expiresAt}\``,
    '- Master gate is enabled **last inside one SQL transaction**',
    '',
    '> This script never writes to Supabase. Execute generated SQL only after the real five-wallet package, locked preview, funding preflight, and explicit release decision are complete.',
    '',
    '```sql',
    sql,
    '```',
    '',
    'Emergency rollback: `supabase/sql/forge-mainnet-lockdown.sql`.',
    '',
  ].join('\n'));
}

main().catch(error => {
  console.error(`FORGE MAINNET PILOT #2 ARM: BLOCKED — ${error?.message || error}`);
  process.exitCode = 1;
});

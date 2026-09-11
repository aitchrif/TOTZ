import fs from 'node:fs';

function replaceOnce(text, from, to, label) {
  if (text.includes(to)) return text;
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return text.replace(from, to);
}

const corePath = 'supabase/functions/forge-claims/index.ts';
let core = fs.readFileSync(corePath, 'utf8');

core = replaceOnce(core,
`type ClaimWriteContext = {
  creator?: string;
  eligibleWallets?: number;
};`,
`type ClaimWriteContext = {
  creator?: string;
  eligibleWallets?: number;
  totalAllocatedUnits?: string;
  rewardDecimals?: number;
};`, 'claim context');

core = replaceOnce(core,
`  canarySponsor: string;
  canaryMaxWallets: number;
  canaryExpiresAt: string;`,
`  canarySponsor: string;
  canaryMaxWallets: number;
  canaryMaxTokenAmount: string;
  canaryExpiresAt: string;`, 'policy type');

core = replaceOnce(core,
`  const { data: rows, error: configError } = await supabase.from("forge_release_config").select("key,value").in("key", ["mainnet_release_mode", "mainnet_canary_sponsor", "mainnet_canary_max_wallets", "mainnet_canary_expires_at"]);`,
`  const { data: rows, error: configError } = await supabase.from("forge_release_config").select("key,value").in("key", ["mainnet_release_mode", "mainnet_canary_sponsor", "mainnet_canary_max_wallets", "mainnet_canary_max_token_amount", "mainnet_canary_expires_at"]);`, 'policy config keys');

core = replaceOnce(core,
`  const canaryMaxWallets = Number.isInteger(maxRaw) && maxRaw >= 1 && maxRaw <= 100 ? maxRaw : 0;
  const canaryExpiresAt = clean(values.get("mainnet_canary_expires_at") || "", 80);
  return { enabled: flag?.enabled === true, mode, canarySponsor, canaryMaxWallets, canaryExpiresAt };`,
`  const canaryMaxWallets = Number.isInteger(maxRaw) && maxRaw >= 1 && maxRaw <= 100 ? maxRaw : 0;
  const canaryMaxTokenAmount = clean(values.get("mainnet_canary_max_token_amount") || "", 80);
  const canaryExpiresAt = clean(values.get("mainnet_canary_expires_at") || "", 80);
  return { enabled: flag?.enabled === true, mode, canarySponsor, canaryMaxWallets, canaryMaxTokenAmount, canaryExpiresAt };`, 'policy return');

core = replaceOnce(core,
`function publicReleaseStatus(policy: MainnetReleasePolicy, wallet: string) {
  const checkedWallet = isAddr(wallet) ? wallet.toLowerCase() : "";
  const window = canaryWindow(policy);
  const effectiveMode: MainnetReleasePolicy["mode"] = !policy.enabled ? "locked" : policy.mode === "canary" && !window.valid ? "locked" : policy.mode;
  const sponsorMatch = checkedWallet ? (effectiveMode === "public" ? true : effectiveMode === "canary" ? checkedWallet === policy.canarySponsor : false) : null;
  return {
    chainId: 4663,
    masterEnabled: policy.enabled,
    mode: effectiveMode,
    rpcReady: Boolean(MAINNET_RPC_URL),
    canaryActive: policy.enabled && effectiveMode === "canary" && window.valid,
    canaryMaxWallets: policy.canaryMaxWallets,
    sponsorAllowed: sponsorMatch,
  };
}`,
`function canaryFundingConfigured(raw: string) {
  const value = String(raw || "").trim();
  return /^[0-9]+(\\.[0-9]{1,18})?$/.test(value) && /[1-9]/.test(value);
}

function decimalAmountToUnits(raw: string, decimals: number) {
  const value = String(raw || "").trim();
  if (!canaryFundingConfigured(value) || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error("FORGE mainnet Canary funding cap is invalid.");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw new Error("FORGE mainnet Canary funding cap has more precision than the reward token.");
  const scale = 10n ** BigInt(decimals);
  const fractionUnits = fraction ? BigInt(fraction.padEnd(decimals, "0")) : 0n;
  return BigInt(whole) * scale + fractionUnits;
}

function publicReleaseStatus(policy: MainnetReleasePolicy, wallet: string) {
  const checkedWallet = isAddr(wallet) ? wallet.toLowerCase() : "";
  const window = canaryWindow(policy);
  const fundingConfigured = canaryFundingConfigured(policy.canaryMaxTokenAmount);
  const effectiveMode: MainnetReleasePolicy["mode"] = !policy.enabled ? "locked" : policy.mode === "canary" && (!window.valid || !fundingConfigured) ? "locked" : policy.mode;
  const sponsorMatch = checkedWallet ? (effectiveMode === "public" ? true : effectiveMode === "canary" ? checkedWallet === policy.canarySponsor : false) : null;
  return {
    chainId: 4663,
    masterEnabled: policy.enabled,
    mode: effectiveMode,
    rpcReady: Boolean(MAINNET_RPC_URL),
    canaryActive: policy.enabled && effectiveMode === "canary" && window.valid && fundingConfigured,
    canaryMaxWallets: policy.canaryMaxWallets,
    canaryMaxTokenAmount: policy.canaryMaxTokenAmount,
    canaryFundingCapConfigured: fundingConfigured,
    sponsorAllowed: sponsorMatch,
  };
}`, 'public status');

core = replaceOnce(core,
`    if (!Number.isInteger(eligible) || eligible < 1 || eligible > policy.canaryMaxWallets) throw new Error(\`FORGE mainnet Canary is limited to \${policy.canaryMaxWallets || 0} eligible wallets.\`);
  }
  return network;`,
`    if (!Number.isInteger(eligible) || eligible < 1 || eligible > policy.canaryMaxWallets) throw new Error(\`FORGE mainnet Canary is limited to \${policy.canaryMaxWallets || 0} eligible wallets.\`);
    if (!canaryFundingConfigured(policy.canaryMaxTokenAmount)) throw new Error("FORGE mainnet Canary funding cap is not configured.");
    if (context.totalAllocatedUnits != null || context.rewardDecimals != null) {
      const total = clean(context.totalAllocatedUnits, 100);
      const decimals = Number(context.rewardDecimals);
      if (!validUnits(total) || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error("FORGE mainnet Canary allocation metadata is invalid.");
      const maxUnits = decimalAmountToUnits(policy.canaryMaxTokenAmount, decimals);
      if (BigInt(total) > maxUnits) throw new Error(\`FORGE mainnet Canary allocation exceeds the configured funding cap (\${policy.canaryMaxTokenAmount} tokens).\`);
    }
  }
  return network;`, 'canary cap enforcement');

core = replaceOnce(core,
`  await assertClaimWriteEnabled(supabase, expected.claimChainId, { creator: expected.creator, eligibleWallets: expected.eligibleWallets });`,
`  await assertClaimWriteEnabled(supabase, expected.claimChainId, { creator: expected.creator, eligibleWallets: expected.eligibleWallets, totalAllocatedUnits: expected.totalUnits, rewardDecimals: expected.rewardDecimals });`, 'on-chain cap context');

core = replaceOnce(core,
`        await assertClaimWriteEnabled(supabase, claimChainId, { creator, eligibleWallets: eligible });`,
`        await assertClaimWriteEnabled(supabase, claimChainId, { creator, eligibleWallets: eligible, totalAllocatedUnits: totalUnits, rewardDecimals: decimals });`, 'create cap context');

core = replaceOnce(core,
`    if (req.method === "GET" && route === "status") {
      const wallet = clean(url.searchParams.get("wallet"), 42).toLowerCase();
      const policy = await mainnetReleasePolicy(supabase);
      return json({ testnet: { chainId: 46630, launchEnabled: true }, mainnet: publicReleaseStatus(policy, wallet) });
    }`,
`    if (req.method === "GET" && route === "status") {
      const wallet = clean(url.searchParams.get("wallet"), 42).toLowerCase();
      const policy = await mainnetReleasePolicy(supabase);
      const mainnet: any = publicReleaseStatus(policy, wallet);
      if (mainnet.canaryActive) {
        const { count, error: activeError } = await supabase.from("forge_claim_epochs")
          .select("id", { count: "exact", head: true })
          .eq("claim_chain_id", 4663)
          .in("status", ["uploading", "published"])
          .gt("deadline", new Date().toISOString());
        if (activeError) throw new Error("Could not verify the FORGE Mainnet Canary epoch slot.");
        mainnet.canaryActiveEpochs = count || 0;
        mainnet.canarySlotAvailable = (count || 0) === 0;
      } else {
        mainnet.canaryActiveEpochs = null;
        mainnet.canarySlotAvailable = false;
      }
      return json({ testnet: { chainId: 46630, launchEnabled: true }, mainnet });
    }`, 'status epoch slot');

fs.writeFileSync(corePath, core);

const launcherPath = 'forge-claim-launcher.js';
let launcher = fs.readFileSync(launcherPath, 'utf8');
launcher = replaceOnce(launcher,
`      const max=Number(state.canaryMaxWallets||0),eligible=Number(pkg?.eligibleWallets||0);
      if(!Number.isInteger(max)||max<1||!Number.isInteger(eligible)||eligible<1||eligible>max)throw new Error(\`FORGE Mainnet Canary is limited to \${max||0} eligible wallets. No transaction was sent.\`);`,
`      const max=Number(state.canaryMaxWallets||0),eligible=Number(pkg?.eligibleWallets||0);
      if(!Number.isInteger(max)||max<1||!Number.isInteger(eligible)||eligible<1||eligible>max)throw new Error(\`FORGE Mainnet Canary is limited to \${max||0} eligible wallets. No transaction was sent.\`);
      if(state.canaryFundingCapConfigured!==true)throw new Error('FORGE Mainnet Canary funding cap is not configured. No transaction was sent.');
      const decimals=Number(pkg?.reward?.decimals),total=BigInt(pkg?.reward?.totalUnits||0);let maxUnits;
      try{maxUnits=ethers.parseUnits(String(state.canaryMaxTokenAmount||''),decimals);}catch{throw new Error('FORGE Mainnet Canary funding cap is invalid for this reward token. No transaction was sent.');}
      if(total>maxUnits)throw new Error(\`FORGE Mainnet Canary allocation exceeds the configured funding cap (\${state.canaryMaxTokenAmount} tokens). No transaction was sent.\`);
      if(state.canarySlotAvailable!==true)throw new Error('FORGE Mainnet Canary already has an active epoch. No transaction was sent.');`, 'launcher canary preflight');
fs.writeFileSync(launcherPath, launcher);

const testPath = 'tests/forge-canary-guardrails.mjs';
let test = fs.readFileSync(testPath, 'utf8');
if (!test.includes("const core = fs.readFileSync('supabase/functions/forge-claims/index.ts'")) {
  test = test.replace("const sql = fs.readFileSync('supabase/migrations/20260911_forge_canary_guardrails.sql', 'utf8');", "const sql = fs.readFileSync('supabase/migrations/20260911_forge_canary_guardrails.sql', 'utf8');\nconst core = fs.readFileSync('supabase/functions/forge-claims/index.ts', 'utf8');\nconst launcher = fs.readFileSync('forge-claim-launcher.js', 'utf8');");
  test = test.replace("console.log('FORGE CANARY GUARDRAILS: PASS · explicit token cap + serialized single active epoch');", `assert(core.includes('mainnet_canary_max_token_amount'), 'Backend status/policy must load the Canary funding cap.');\nassert(core.includes('decimalAmountToUnits'), 'Backend must normalize Canary cap to token units.');\nassert(core.includes('canarySlotAvailable'), 'Backend status must expose whether a Canary epoch slot is available.');\nassert(core.includes('totalAllocatedUnits: expected.totalUnits, rewardDecimals: expected.rewardDecimals'), 'On-chain verification must re-check the Canary allocation against the cap.');\nassert(launcher.includes('state.canaryFundingCapConfigured!==true'), 'Launcher must fail closed before Mainnet transactions when the Canary cap is unavailable.');\nassert(launcher.includes('total>maxUnits'), 'Launcher must block an oversized Canary package before deployment/funding.');\nassert(launcher.includes('state.canarySlotAvailable!==true'), 'Launcher must block when another Canary epoch is active.');\n\nconsole.log('FORGE CANARY GUARDRAILS: PASS · server/client token cap + serialized single active epoch');`);
}
fs.writeFileSync(testPath, test);

console.log('Applied FORGE Canary transaction preflight hardening.');

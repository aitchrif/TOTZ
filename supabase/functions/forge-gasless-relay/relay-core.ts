import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  Contract,
  Interface,
  JsonRpcProvider,
  Wallet,
  concat,
  getAddress,
  getBytes,
  hexlify,
  keccak256,
  toBeHex,
  toUtf8Bytes,
  zeroPadValue,
} from "https://esm.sh/ethers@6.15.0";

type NetworkConfig = {
  chainId: number;
  environment: "testnet" | "mainnet";
  rpc: string;
  alchemyRpc: string;
  policyId: string;
  ownerKey: string;
  entryPoint: string;
  smartAccount: string;
  flagKey: string;
};

type GaslessEpochPolicyContext = {
  slug?: string;
  creator_wallet?: string;
  eligible_wallets?: number;
  claim_chain_id?: number;
};

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") || "").trim();
const SERVICE_ROLE_KEY = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
const ENTRY_POINT_V08 = "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108";
const MAX_BODY_BYTES = 24_000;
const DEFAULT_TTL_SECONDS = 600;
const DEFAULT_RETRY_WINDOW_SECONDS = 900;
const DEFAULT_MAX_ATTEMPTS = 2;
const MAX_MAINNET_CANARY_WINDOW_MS = 24 * 60 * 60 * 1000;

const claimIface = new Interface([
  "function token() view returns (address)",
  "function sponsor() view returns (address)",
  "function merkleRoot() view returns (bytes32)",
  "function totalAllocated() view returns (uint256)",
  "function deadline() view returns (uint64)",
  "function claimed(address) view returns (bool)",
  "function authorizationNonces(address) view returns (uint256)",
  "function claimFor(address,uint256,bytes32[],uint256,uint256,bytes)",
]);
const accountIface = new Interface([
  "function owner() view returns (address)",
  "function entryPoint() view returns (address)",
  "function execute(address,uint256,bytes) returns (bytes)",
]);
const entryPointAbi = [
  "function getNonce(address sender,uint192 key) view returns (uint256)",
  "function getUserOpHash((address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature) userOp) view returns (bytes32)",
  "function handleOps((address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)[] ops,address payable beneficiary)",
];

function allowedOrigin(req: Request) {
  const origin = req.headers.get("origin") || "";
  if (!origin) return "*";
  if (origin === "https://www.wearetotz.xyz" || origin === "https://wearetotz.xyz") return origin;
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return origin;
  return "null";
}
function cors(req: Request) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(req),
    "Access-Control-Allow-Headers": "content-type, x-client-info, apikey",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Vary": "Origin",
  };
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
function isAddress(value: unknown) { return /^0x[a-fA-F0-9]{40}$/.test(String(value || "")); }
function isHexSignature(value: unknown) { return /^0x[a-fA-F0-9]{2,8192}$/.test(String(value || "")); }
function isSlug(value: unknown) { return /^[a-z0-9][a-z0-9-]{1,79}$/.test(String(value || "")); }
function normalizeAddress(value: string) { return getAddress(value).toLowerCase(); }
function uint128(value: bigint | string) { return zeroPadValue(toBeHex(BigInt(value)), 16); }
function packTwo128(high: bigint | string, low: bigint | string) { return hexlify(concat([uint128(high), uint128(low)])); }
function safeErrorCode(error: unknown) {
  const text = String((error as any)?.message || error || "relay_failed").toLowerCase();
  if (text.includes("already claimed")) return "already_claimed";
  if (text.includes("not eligible")) return "not_eligible";
  if (text.includes("authorization")) return "authorization_invalid";
  if (text.includes("retry limit")) return "retry_limited";
  if (text.includes("sponsor")) return "sponsorship_rejected";
  if (text.includes("simulation")) return "simulation_failed";
  return "relay_failed";
}

function supabase() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("relay service database is not configured");
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function releaseConfig(client: any) {
  const [{ data: flags, error: flagError }, { data: rows, error: configError }] = await Promise.all([
    client.from("forge_release_flags").select("key,enabled").in("key", ["gasless_testnet_enabled", "gasless_mainnet_enabled", "mainnet_claims_enabled"]),
    client.from("forge_release_config").select("key,value").in("key", [
      "mainnet_release_mode",
      "mainnet_canary_sponsor",
      "mainnet_canary_max_wallets",
      "mainnet_canary_expires_at",
      "gasless_authorization_ttl_seconds",
      "gasless_retry_window_seconds",
      "gasless_max_attempts_per_wallet",
      "gasless_entrypoint_testnet",
      "gasless_entrypoint_mainnet",
      "gasless_relayer_account_testnet",
      "gasless_relayer_account_mainnet",
    ]),
  ]);
  if (flagError || configError) throw new Error("could not read gasless release policy");
  const flag = new Map((flags || []).map((row: any) => [String(row.key), row.enabled === true]));
  const cfg = new Map((rows || []).map((row: any) => [String(row.key), String(row.value || "")]));
  const intCfg = (key: string, fallback: number, min: number, max: number) => {
    const n = Number(cfg.get(key) || fallback);
    return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
  };
  return {
    flag,
    cfg,
    ttlSeconds: intCfg("gasless_authorization_ttl_seconds", DEFAULT_TTL_SECONDS, 60, 1800),
    retryWindowSeconds: intCfg("gasless_retry_window_seconds", DEFAULT_RETRY_WINDOW_SECONDS, 60, 86400),
    maxAttempts: intCfg("gasless_max_attempts_per_wallet", DEFAULT_MAX_ATTEMPTS, 1, 10),
  };
}

function networkConfig(chainId: number, policy: any): NetworkConfig | null {
  if (chainId === 46630) {
    return {
      chainId,
      environment: "testnet",
      rpc: (Deno.env.get("FORGE_GASLESS_RPC_TESTNET") || "https://rpc.testnet.chain.robinhood.com").trim(),
      alchemyRpc: (Deno.env.get("FORGE_GASLESS_ALCHEMY_RPC_TESTNET") || "").trim(),
      policyId: (Deno.env.get("FORGE_GASLESS_POLICY_ID_TESTNET") || "").trim(),
      ownerKey: (Deno.env.get("FORGE_GASLESS_ACCOUNT_OWNER_KEY_TESTNET") || "").trim(),
      entryPoint: (policy.cfg.get("gasless_entrypoint_testnet") || ENTRY_POINT_V08).trim(),
      smartAccount: (policy.cfg.get("gasless_relayer_account_testnet") || "").trim(),
      flagKey: "gasless_testnet_enabled",
    };
  }
  if (chainId === 4663) {
    return {
      chainId,
      environment: "mainnet",
      rpc: (Deno.env.get("FORGE_GASLESS_RPC_MAINNET") || "").trim(),
      alchemyRpc: (Deno.env.get("FORGE_GASLESS_ALCHEMY_RPC_MAINNET") || "").trim(),
      policyId: (Deno.env.get("FORGE_GASLESS_POLICY_ID_MAINNET") || "").trim(),
      ownerKey: (Deno.env.get("FORGE_GASLESS_ACCOUNT_OWNER_KEY_MAINNET") || "").trim(),
      entryPoint: (policy.cfg.get("gasless_entrypoint_mainnet") || ENTRY_POINT_V08).trim(),
      smartAccount: (policy.cfg.get("gasless_relayer_account_mainnet") || "").trim(),
      flagKey: "gasless_mainnet_enabled",
    };
  }
  return null;
}

function mainnetCanaryPolicy(policy: any) {
  const sponsor = String(policy.cfg.get("mainnet_canary_sponsor") || "").trim().toLowerCase();
  const maxWallets = Number(policy.cfg.get("mainnet_canary_max_wallets") || 0);
  const expiresAt = String(policy.cfg.get("mainnet_canary_expires_at") || "").trim();
  const expiryMs = Date.parse(expiresAt);
  const remainingMs = expiryMs - Date.now();
  return {
    sponsor,
    maxWallets,
    expiresAt,
    valid: isAddress(sponsor) && Number.isInteger(maxWallets) && maxWallets >= 1 && maxWallets <= 100 &&
      Number.isFinite(expiryMs) && remainingMs > 0 && remainingMs <= MAX_MAINNET_CANARY_WINDOW_MS,
  };
}

function enabledForNetwork(net: NetworkConfig, policy: any, epoch: GaslessEpochPolicyContext | null = null) {
  if (policy.flag.get(net.flagKey) !== true) return false;
  if (net.environment !== "mainnet") return true;
  if (policy.flag.get("mainnet_claims_enabled") !== true) return false;

  const mode = String(policy.cfg.get("mainnet_release_mode") || "locked").toLowerCase();
  if (mode === "public") return true;
  if (mode !== "canary" || !epoch) return false;

  const canary = mainnetCanaryPolicy(policy);
  const creator = String(epoch.creator_wallet || "").trim().toLowerCase();
  const eligible = Number(epoch.eligible_wallets || 0);
  const epochChainId = Number(epoch.claim_chain_id || 0);
  return canary.valid && creator === canary.sponsor && epochChainId === net.chainId &&
    Number.isInteger(eligible) && eligible >= 1 && eligible <= canary.maxWallets;
}
function configured(net: NetworkConfig) {
  return Boolean(
    net.rpc && net.alchemyRpc && net.policyId &&
    /^0x[a-fA-F0-9]{64}$/.test(net.ownerKey) &&
    isAddress(net.entryPoint) && isAddress(net.smartAccount)
  );
}

async function alchemyRpc(url: string, method: string, params: unknown[]) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.error) throw new Error(body?.error?.message || `Alchemy RPC ${response.status}`);
    return body?.result;
  } finally {
    clearTimeout(timer);
  }
}

async function statusRoute(req: Request) {
  const client = supabase();
  const policy = await releaseConfig(client);
  const url = new URL(req.url);
  const chainId = Number(url.searchParams.get("chainId") || 46630);
  const net = networkConfig(chainId, policy);
  if (!net) return json(req, { enabled: false, configured: false, chainId, reason: "unsupported_chain" }, 400);

  const mode = net.environment === "mainnet"
    ? String(policy.cfg.get("mainnet_release_mode") || "locked").toLowerCase()
    : "testnet";
  let epoch: GaslessEpochPolicyContext | null = null;
  const slug = String(url.searchParams.get("slug") || "").trim().toLowerCase();
  if (net.environment === "mainnet" && mode === "canary" && isSlug(slug)) {
    const { data, error } = await client.from("forge_claim_epochs")
      .select("slug,creator_wallet,eligible_wallets,claim_chain_id")
      .eq("slug", slug).eq("status", "published").maybeSingle();
    if (error) throw new Error("could not read canary epoch policy context");
    if (data && Number(data.claim_chain_id) === net.chainId) epoch = data;
  }

  const ready = configured(net);
  const releaseEnabled = enabledForNetwork(net, policy, epoch);
  return json(req, {
    mode: "erc4337-paymaster",
    chainId,
    environment: net.environment,
    enabled: releaseEnabled && ready,
    releaseEnabled,
    configured: ready,
    releaseMode: mode,
    canaryScoped: net.environment === "mainnet" && mode === "canary",
    canaryEpochMatched: net.environment === "mainnet" && mode === "canary" ? releaseEnabled : null,
    authorizationTtlSeconds: policy.ttlSeconds,
    retryWindowSeconds: policy.retryWindowSeconds,
    maxAttemptsPerWallet: policy.maxAttempts,
    entryPoint: isAddress(net.entryPoint) ? getAddress(net.entryPoint) : null,
    smartAccount: isAddress(net.smartAccount) ? getAddress(net.smartAccount) : null,
  });
}

async function relayRoute(req: Request) {
  const length = Number(req.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) return json(req, { error: "Request too large." }, 413);
  const body = await req.json().catch(() => ({}));
  const slug = String(body?.slug || "").trim().toLowerCase();
  const walletRaw = String(body?.wallet || "").trim();
  const signature = String(body?.signature || "").trim();
  const authorizationDeadline = Number(body?.authorizationDeadline || 0);
  if (!isSlug(slug) || !isAddress(walletRaw) || !isHexSignature(signature) || !Number.isInteger(authorizationDeadline)) {
    return json(req, { error: "Malformed gasless claim authorization." }, 400);
  }
  const wallet = normalizeAddress(walletRaw);
  const client = supabase();
  const policy = await releaseConfig(client);

  const { data: epoch, error: epochError } = await client.from("forge_claim_epochs")
    .select("id,slug,status,creator_wallet,eligible_wallets,reward_token,merkle_root,total_allocated_units,claim_chain_id,claim_contract,deadline")
    .eq("slug", slug).eq("status", "published").maybeSingle();
  if (epochError) throw new Error("could not read published epoch");
  if (!epoch) return json(req, { error: "Published claim not found." }, 404);

  const chainId = Number(epoch.claim_chain_id);
  const net = networkConfig(chainId, policy);
  if (!net) return json(req, { error: "Gasless claims are unavailable on this chain." }, 400);
  if (!enabledForNetwork(net, policy, epoch)) return json(req, { error: "Gasless claiming is currently disabled.", code: "gasless_locked" }, 423);
  if (!configured(net)) return json(req, { error: "Gasless relay infrastructure is not fully configured.", code: "gasless_unconfigured" }, 503);

  const { data: entry, error: entryError } = await client.from("forge_claim_entries")
    .select("amount_units,proof").eq("epoch_id", epoch.id).eq("wallet", wallet).maybeSingle();
  if (entryError) throw new Error("could not read claim allocation");
  if (!entry) return json(req, { error: "Wallet is not eligible for this epoch.", code: "not_eligible" }, 403);
  if (!/^\d{1,100}$/.test(String(entry.amount_units || "")) || !Array.isArray(entry.proof) || entry.proof.some((p: unknown) => !/^0x[a-fA-F0-9]{64}$/.test(String(p)))) {
    throw new Error("published claim entry is malformed");
  }

  const provider = new JsonRpcProvider(net.rpc, chainId, { staticNetwork: true });
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== chainId) throw new Error("RPC chain mismatch");
  const latest = await provider.getBlock("latest");
  if (!latest) throw new Error("could not read latest block");
  const now = Number(latest.timestamp);
  const epochDeadline = Math.floor(new Date(epoch.deadline).getTime() / 1000);
  if (now > epochDeadline) return json(req, { error: "This claim epoch has ended.", code: "epoch_closed" }, 409);
  if (authorizationDeadline <= now + 15 || authorizationDeadline > now + policy.ttlSeconds) {
    return json(req, { error: "Authorization expiry is outside the allowed gasless window.", code: "authorization_invalid" }, 400);
  }

  const smartAccount = getAddress(net.smartAccount);
  const entryPointAddress = getAddress(net.entryPoint);
  const owner = new Wallet(net.ownerKey, provider);
  const account = new Contract(smartAccount, accountIface.fragments, provider);
  const [accountOwner, accountEntryPoint, accountCode] = await Promise.all([
    account.owner(),
    account.entryPoint(),
    provider.getCode(smartAccount),
  ]);
  if (accountCode === "0x" || normalizeAddress(accountOwner) !== owner.address.toLowerCase() || normalizeAddress(accountEntryPoint) !== entryPointAddress.toLowerCase()) {
    throw new Error("gasless smart account attestation failed");
  }

  const claimAddress = getAddress(epoch.claim_contract);
  const claim = new Contract(claimAddress, claimIface.fragments, provider);
  const [token, sponsor, root, totalAllocated, deadline, alreadyClaimed, authNonce] = await Promise.all([
    claim.token(), claim.sponsor(), claim.merkleRoot(), claim.totalAllocated(), claim.deadline(), claim.claimed(wallet), claim.authorizationNonces(wallet),
  ]);
  if (normalizeAddress(token) !== normalizeAddress(epoch.reward_token) ||
      normalizeAddress(sponsor) !== normalizeAddress(epoch.creator_wallet) ||
      String(root).toLowerCase() !== String(epoch.merkle_root).toLowerCase() ||
      BigInt(totalAllocated) !== BigInt(epoch.total_allocated_units) ||
      Number(deadline) !== epochDeadline) {
    throw new Error("published epoch does not match V2 claim contract");
  }
  if (alreadyClaimed) return json(req, { error: "Wallet already claimed this epoch.", code: "already_claimed" }, 409);

  const amount = BigInt(entry.amount_units);
  const proof = entry.proof.map((p: string) => String(p));
  const claimForData = claimIface.encodeFunctionData("claimFor", [wallet, amount, proof, BigInt(authNonce), authorizationDeadline, signature]);
  try {
    await provider.call({ from: smartAccount, to: claimAddress, data: claimForData });
  } catch {
    return json(req, { error: "Claim authorization or proof failed on-chain simulation.", code: "authorization_invalid" }, 400);
  }

  const requestHash = keccak256(toUtf8Bytes([
    "TOTZ_FORGE_GASLESS_V2",
    String(epoch.id), wallet, String(chainId), String(authNonce), String(authorizationDeadline), signature.toLowerCase(),
  ].join("|"))).toLowerCase();

  const { data: reserved, error: reserveError } = await client.rpc("forge_reserve_gasless_request", {
    p_epoch_id: epoch.id,
    p_wallet: wallet,
    p_chain_id: chainId,
    p_request_hash: requestHash,
    p_window_seconds: policy.retryWindowSeconds,
    p_max_attempts: policy.maxAttempts,
  });
  if (reserveError) {
    const code = String(reserveError.message || "").toLowerCase().includes("retry limit") ? "retry_limited" : "reservation_failed";
    return json(req, { error: code === "retry_limited" ? "Gasless retry limit reached for this wallet." : "Could not reserve gasless claim.", code }, code === "retry_limited" ? 429 : 409);
  }
  const reservation = Array.isArray(reserved) ? reserved[0] : reserved;
  const requestId = reservation?.request_id;
  if (!requestId) throw new Error("gasless reservation returned no request id");
  if (reservation?.existing === true) {
    const { data: prior } = await client.from("forge_gasless_requests").select("status,user_op_hash,tx_hash,updated_at,error_code").eq("id", requestId).maybeSingle();
    if (prior?.status === "confirmed") return json(req, { status: "confirmed", requestId, requestHash, userOpHash: prior.user_op_hash, txHash: prior.tx_hash, idempotent: true });
    if (prior?.status === "submitted") return json(req, { status: "submitted", requestId, requestHash, userOpHash: prior.user_op_hash, idempotent: true }, 202);
    if (prior?.status === "failed" || prior?.status === "rejected") return json(req, { error: "Previous gasless attempt failed. Sign a fresh authorization and retry.", code: prior.error_code || "previous_attempt_failed" }, 409);
    const ageMs = Date.now() - new Date(prior?.updated_at || Date.now()).getTime();
    if (ageMs < 30_000) return json(req, { status: "processing", requestId, requestHash, idempotent: true }, 202);
  }

  const finalize = async (status: string, userOpHash: string | null = null, txHash: string | null = null, errorCode: string | null = null) => {
    await client.rpc("forge_finalize_gasless_request", {
      p_request_id: requestId,
      p_status: status,
      p_user_op_hash: userOpHash,
      p_tx_hash: txHash,
      p_error_code: errorCode,
    });
  };

  try {
    const accountCallData = accountIface.encodeFunctionData("execute", [claimAddress, 0n, claimForData]);
    const entryPoint = new Contract(entryPointAddress, entryPointAbi, provider);
    const nonce = BigInt(await entryPoint.getNonce(smartAccount, 0));
    const dummySignature = `0x${"ff".repeat(65)}`;
    const sponsorship = await alchemyRpc(net.alchemyRpc, "alchemy_requestGasAndPaymasterAndData", [{
      policyId: net.policyId,
      entryPoint: entryPointAddress,
      dummySignature,
      userOperation: {
        sender: smartAccount,
        nonce: toBeHex(nonce),
        callData: accountCallData,
      },
    }]);
    if (!sponsorship?.paymaster || !sponsorship?.paymasterData) throw new Error("sponsorship rejected");

    const accountGasLimits = packTwo128(sponsorship.verificationGasLimit, sponsorship.callGasLimit);
    const gasFees = packTwo128(sponsorship.maxPriorityFeePerGas, sponsorship.maxFeePerGas);
    const paymasterAndData = hexlify(concat([
      getAddress(sponsorship.paymaster),
      uint128(sponsorship.paymasterVerificationGasLimit || "0x0"),
      uint128(sponsorship.paymasterPostOpGasLimit || "0x0"),
      sponsorship.paymasterData,
    ]));
    const unsignedPacked = [
      smartAccount,
      nonce,
      "0x",
      accountCallData,
      accountGasLimits,
      BigInt(sponsorship.preVerificationGas),
      gasFees,
      paymasterAndData,
      dummySignature,
    ];
    const localUserOpHash = String(await entryPoint.getUserOpHash(unsignedPacked)).toLowerCase();
    const accountSignature = await owner.signMessage(getBytes(localUserOpHash));
    const signedPacked = [...unsignedPacked.slice(0, 8), accountSignature];

    try {
      await entryPoint.handleOps.staticCall([signedPacked], owner.address);
    } catch {
      throw new Error("full EntryPoint simulation failed");
    }

    const userOperation = {
      sender: smartAccount,
      nonce: toBeHex(nonce),
      callData: accountCallData,
      callGasLimit: sponsorship.callGasLimit,
      verificationGasLimit: sponsorship.verificationGasLimit,
      preVerificationGas: sponsorship.preVerificationGas,
      maxFeePerGas: sponsorship.maxFeePerGas,
      maxPriorityFeePerGas: sponsorship.maxPriorityFeePerGas,
      paymaster: getAddress(sponsorship.paymaster),
      paymasterVerificationGasLimit: sponsorship.paymasterVerificationGasLimit || "0x0",
      paymasterPostOpGasLimit: sponsorship.paymasterPostOpGasLimit || "0x0",
      paymasterData: sponsorship.paymasterData,
      signature: accountSignature,
    };
    const sentHash = String(await alchemyRpc(net.alchemyRpc, "eth_sendUserOperation", [userOperation, entryPointAddress])).toLowerCase();
    if (sentHash !== localUserOpHash) throw new Error("bundler returned unexpected UserOperation hash");
    await finalize("submitted", sentHash, null, null);

    const stopAt = Date.now() + 25_000;
    while (Date.now() < stopAt) {
      const receipt = await alchemyRpc(net.alchemyRpc, "eth_getUserOperationReceipt", [sentHash]).catch(() => null);
      if (receipt?.receipt?.transactionHash) {
        const txHash = String(receipt.receipt.transactionHash).toLowerCase();
        if (receipt.success === false) {
          await finalize("failed", sentHash, txHash, "userop_failed");
          return json(req, { error: "Sponsored UserOperation failed on-chain.", code: "userop_failed", requestId, requestHash, userOpHash: sentHash, txHash }, 502);
        }
        const claimedNow = await claim.claimed(wallet);
        if (!claimedNow) throw new Error("sponsored transaction mined without claimed state");
        await finalize("confirmed", sentHash, txHash, null);
        return json(req, { status: "confirmed", requestId, requestHash, userOpHash: sentHash, txHash, sponsored: true });
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    return json(req, { status: "submitted", requestId, requestHash, userOpHash: sentHash, sponsored: true }, 202);
  } catch (error) {
    const code = safeErrorCode(error);
    await finalize("failed", null, null, code).catch(() => undefined);
    return json(req, { error: "Gasless relay could not complete.", code, requestId, requestHash }, 502);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  try {
    const route = (new URL(req.url).searchParams.get("route") || "status").toLowerCase();
    if (req.method === "GET" && route === "status") return await statusRoute(req);
    if (req.method === "POST" && route === "relay") return await relayRoute(req);
    return json(req, { error: "Not found." }, 404);
  } catch (error) {
    console.error("forge-gasless-relay", safeErrorCode(error));
    return json(req, { error: "Gasless relay service error.", code: safeErrorCode(error) }, 500);
  }
});

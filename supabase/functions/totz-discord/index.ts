import { createClient } from "npm:@supabase/supabase-js@2.55.0";
import {
  isFresh,
  linkMessage,
  normalizeWallet,
  randomToken,
  sha256Hex,
  verifyDiscordRequest,
  verifyWalletLink,
} from "../_shared/discord-security.ts";

const DISCORD_API = "https://discord.com/api/v10";
const MAX_BODY = 64 * 1024;
const EPHEMERAL = 64;
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const memoryRate = new Map<string, { count: number; reset: number }>();

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
};

function json(body: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extra },
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": env("TOTZ_SITE_ORIGIN"),
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "vary": "origin",
  };
}

function client() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function rateLimited(req: Request, limit = 30): boolean {
  const key = req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const current = memoryRate.get(key);
  if (!current || current.reset <= now) {
    memoryRate.set(key, { count: 1, reset: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > limit;
}

async function readBody(req: Request): Promise<Uint8Array> {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_BODY) throw new Response("Payload too large", { status: 413 });
  const body = new Uint8Array(await req.arrayBuffer());
  if (body.length > MAX_BODY) throw new Response("Payload too large", { status: 413 });
  return body;
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  const body = await readBody(req);
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new Response("Invalid JSON", { status: 400 });
  }
}

function interactionReply(content: string, components?: unknown[]) {
  return json({
    type: 4,
    data: {
      content,
      flags: EPHEMERAL,
      ...(components ? { components } : {}),
    },
  });
}

async function fetchPortfolio(wallet: string) {
  const endpoint = Deno.env.get("TOTZ_STAKING_API") ||
    "https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/totz-staking";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "portfolio", wallet }),
    signal: AbortSignal.timeout(12_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error("Portfolio unavailable");
  return data;
}

async function activeLink(discordUserId: string) {
  const { data, error } = await client()
    .from("totz_discord_links")
    .select("wallet")
    .eq("discord_user_id", discordUserId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  return data as { wallet: string } | null;
}

function shortWallet(wallet: string) {
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

async function handleInteraction(req: Request) {
  const body = await readBody(req);
  const signature = req.headers.get("x-signature-ed25519") || "";
  const timestamp = req.headers.get("x-signature-timestamp") || "";
  if (!verifyDiscordRequest(env("DISCORD_PUBLIC_KEY"), signature, timestamp, body)) {
    return json({ error: "invalid request signature" }, 401);
  }

  const payload = JSON.parse(new TextDecoder().decode(body));
  if (payload.type === 1) return json({ type: 1 });
  if (payload.type !== 2 || payload.data?.name !== "totz") {
    return interactionReply("Unsupported command.");
  }

  const discordUserId = String(payload.member?.user?.id || payload.user?.id || "");
  const subcommand = payload.data?.options?.[0]?.name;

  if (subcommand === "link") {
    const oauthUrl = new URL(env("SUPABASE_URL") + "/functions/v1/totz-discord");
    oauthUrl.searchParams.set("route", "oauth-start");
    return interactionReply(
      "☁️ Link your Discord account to the wallet you control. No transaction, gas, approval, or NFT transfer is required.",
      [{
        type: 1,
        components: [{ type: 2, style: 5, label: "LINK WALLET", url: oauthUrl.toString() }],
      }],
    );
  }

  if (subcommand === "unlink") {
    const { error } = await client().from("totz_discord_links")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("discord_user_id", discordUserId)
      .eq("active", true);
    if (error) throw error;
    return interactionReply("Your Discord link is inactive. Staking, earned $TOTZ, and reward history were not changed.");
  }

  const link = await activeLink(discordUserId);
  if (!link) return interactionReply("No wallet is linked. Run **/totz link** first.");

  try {
    const portfolio = await fetchPortfolio(link.wallet);
    const available = Number(portfolio.totalPoints || 0);
    if (subcommand === "balance") {
      return interactionReply(
        `☁️ **TOTZ BALANCE**\n\n${available.toLocaleString(undefined, { maximumFractionDigits: 3 })} $TOTZ\n\nWallet: ${shortWallet(link.wallet)}`,
      );
    }
    if (subcommand === "profile") {
      const owned = Number(portfolio.balanceDisplay ?? portfolio.balance ?? 0);
      const staked = Array.isArray(portfolio.activeTokenIds)
        ? portfolio.activeTokenIds.length
        : Array.isArray(portfolio.stakes)
        ? portfolio.stakes.filter((row: { active?: boolean }) => row.active).length
        : 0;
      const legendary = Number(portfolio.legendaryCount || 0);
      return interactionReply([
        "☁️ **TOTZ HOLDER**",
        "",
        `Wallet: ${shortWallet(link.wallet)}`,
        `TOTZ Owned: ${owned}`,
        `Soft Staked: ${staked}`,
        `$TOTZ Balance: ${available.toLocaleString(undefined, { maximumFractionDigits: 3 })}`,
        ...(legendary ? [`Legendary 1/1: ${legendary}`] : []),
      ].join("\n"));
    }
  } catch {
    return interactionReply("TOTZ portfolio data is temporarily unavailable. Please try again shortly.");
  }

  return interactionReply("Unsupported /totz subcommand.");
}

async function oauthStart() {
  const state = randomToken();
  const { error } = await client().from("totz_discord_link_nonces").insert({
    purpose: "oauth_state",
    token_hash: await sha256Hex(state),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) throw error;

  const url = new URL(DISCORD_API + "/oauth2/authorize");
  url.searchParams.set("client_id", env("DISCORD_APPLICATION_ID"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify");
  url.searchParams.set("redirect_uri", env("DISCORD_REDIRECT_URI"));
  url.searchParams.set("state", state);
  return Response.redirect(url, 302);
}

async function oauthCallback(url: URL) {
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const db = client();
  const tokenHash = await sha256Hex(state);
  const { data: stateRow } = await db.from("totz_discord_link_nonces")
    .select("id,expires_at,used_at")
    .eq("purpose", "oauth_state")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!stateRow || !isFresh(stateRow.expires_at, stateRow.used_at) || !code) {
    return Response.redirect(env("TOTZ_SITE_ORIGIN") + "/discord-link?error=oauth", 302);
  }
  await db.from("totz_discord_link_nonces")
    .update({ used_at: new Date().toISOString() }).eq("id", stateRow.id);

  const tokenResponse = await fetch(DISCORD_API + "/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("DISCORD_APPLICATION_ID"),
      client_secret: env("DISCORD_CLIENT_SECRET"),
      grant_type: "authorization_code",
      code,
      redirect_uri: env("DISCORD_REDIRECT_URI"),
    }),
  });
  const token = await tokenResponse.json();
  if (!tokenResponse.ok || !token.access_token) {
    return Response.redirect(env("TOTZ_SITE_ORIGIN") + "/discord-link?error=oauth", 302);
  }
  const userResponse = await fetch(DISCORD_API + "/users/@me", {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  const user = await userResponse.json();
  if (!userResponse.ok || !user.id) {
    return Response.redirect(env("TOTZ_SITE_ORIGIN") + "/discord-link?error=identity", 302);
  }

  const session = randomToken();
  const { error } = await db.from("totz_discord_link_nonces").insert({
    purpose: "link_challenge",
    token_hash: await sha256Hex(session),
    nonce: randomToken(),
    discord_user_id: String(user.id),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) throw error;
  const target = new URL("/discord-link", env("TOTZ_SITE_ORIGIN"));
  target.searchParams.set("session", session);
  target.searchParams.set("discord", String(user.username || user.id));
  return Response.redirect(target, 302);
}

async function linkChallenge(req: Request) {
  const { session, wallet } = await readJson(req);
  const normalized = normalizeWallet(String(wallet || ""));
  const tokenHash = await sha256Hex(String(session || ""));
  const db = client();
  const { data: row } = await db.from("totz_discord_link_nonces")
    .select("id,discord_user_id,nonce,expires_at,used_at")
    .eq("purpose", "link_challenge")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!row || !isFresh(row.expires_at, row.used_at)) return json({ error: "Link session expired" }, 400, corsHeaders());

  const timestamp = Date.now();
  const message = linkMessage({
    discordUserId: row.discord_user_id,
    wallet: normalized,
    nonce: row.nonce,
    timestamp,
  });
  const { error } = await db.from("totz_discord_link_nonces")
    .update({ wallet: normalized, issued_at_ms: timestamp }).eq("id", row.id);
  if (error) throw error;
  return json({ message, wallet: normalized }, 200, corsHeaders());
}

async function linkComplete(req: Request) {
  const { session, wallet, signature } = await readJson(req);
  const normalized = normalizeWallet(String(wallet || ""));
  const db = client();
  const { data: row } = await db.from("totz_discord_link_nonces")
    .select("id,discord_user_id,nonce,wallet,issued_at_ms,expires_at,used_at")
    .eq("purpose", "link_challenge")
    .eq("token_hash", await sha256Hex(String(session || "")))
    .maybeSingle();
  if (!row || !isFresh(row.expires_at, row.used_at) || row.wallet !== normalized || !row.issued_at_ms) {
    return json({ error: "Invalid or expired link challenge" }, 400, corsHeaders());
  }
  const message = linkMessage({
    discordUserId: row.discord_user_id,
    wallet: normalized,
    nonce: row.nonce,
    timestamp: Number(row.issued_at_ms),
  });
  if (!(await verifyWalletLink(normalized, message, String(signature || "")))) {
    return json({ error: "Wallet signature is invalid" }, 400, corsHeaders());
  }

  await db.from("totz_discord_links").update({ active: false, updated_at: new Date().toISOString() })
    .or(`discord_user_id.eq.${row.discord_user_id},wallet.eq.${normalized}`).eq("active", true);
  const { error: linkError } = await db.from("totz_discord_links").insert({
    discord_user_id: row.discord_user_id,
    wallet: normalized,
    active: true,
  });
  if (linkError) return json({ error: "Could not create a unique link" }, 409, corsHeaders());
  await db.from("totz_discord_link_nonces").update({ used_at: new Date().toISOString() }).eq("id", row.id);
  return json({ ok: true, wallet: normalized }, 200, corsHeaders());
}

Deno.serve(async (req) => {
  try {
    if (rateLimited(req)) return json({ error: "Too many requests" }, 429);
    const url = new URL(req.url);
    const route = url.searchParams.get("route");
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
    if (route === "oauth-start" && req.method === "GET") return await oauthStart();
    if (route === "oauth-callback" && req.method === "GET") return await oauthCallback(url);
    if (route === "challenge" && req.method === "POST") return await linkChallenge(req);
    if (route === "complete" && req.method === "POST") return await linkComplete(req);
    if (req.method === "POST") return await handleInteraction(req);
    return json({ error: "Not found" }, 404);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("totz-discord request failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "Request could not be completed" }, 500);
  }
});

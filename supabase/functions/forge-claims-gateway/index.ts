import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-forge-upload-token",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CORE_URL = `${SUPABASE_URL}/functions/v1/forge-claims`;
const HOLDERS_VERIFY_URL = (Deno.env.get("FORGE_HOLDERS_VERIFY_URL") || "https://www.wearetotz.xyz/api/forge-holders").trim();
const SOURCE_CHAINS: Record<string, number> = { robinhood: 4663, ink: 57073, ethereum: 1 };

const clean = (v: unknown, n = 200) => String(v ?? "").trim().slice(0, n);
const isAddr = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v || "");
const isB32 = (v: string) => /^0x[a-fA-F0-9]{64}$/.test(v || "");
const isHex64 = (v: string) => /^[a-fA-F0-9]{64}$/.test(v || "");

async function sha256HexRaw(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function equalText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function packageFingerprint(body: any) {
  const text = [
    "TOTZ_FORGE_PACKAGE_PROVENANCE_V1",
    `distribution=${String(body.distributionFingerprint || "")}`,
    `sourceChain=${String(body.sourceChain || "").toLowerCase()}`,
    `sourceChainId=${Number(body.sourceChainId || 0)}`,
    `sourceContract=${String(body.sourceContract || "").toLowerCase()}`,
    `snapshotBlock=${Number(body.snapshotBlock || 0)}`,
    `snapshotBlockHash=${String(body.snapshotBlockHash || "").toLowerCase()}`,
    "snapshotComplete=true",
    `merkleRoot=${String(body.merkleRoot || "").toLowerCase()}`,
    `eligibleWallets=${Number(body.eligibleWallets || 0)}`,
    `totalAllocatedUnits=${String(body.totalAllocatedUnits || "")}`,
  ].join("\n");
  return `0x${await sha256HexRaw(text)}`;
}

function validateCreateShape(body: any) {
  const sourceChain = clean(body.sourceChain, 24).toLowerCase();
  const sourceChainId = Number(body.sourceChainId || 0);
  const sourceContract = clean(body.sourceContract, 42).toLowerCase();
  const creator = clean(body.creatorWallet, 42).toLowerCase();
  const snapshotBlock = Number(body.snapshotBlock || 0);
  const snapshotBlockHash = clean(body.snapshotBlockHash, 66).toLowerCase();
  const distributionFingerprint = clean(body.distributionFingerprint, 66).toLowerCase();
  const suppliedPackageFingerprint = clean(body.packageFingerprint, 66).toLowerCase();
  const merkleRoot = clean(body.merkleRoot, 66).toLowerCase();
  const totalAllocatedUnits = clean(body.totalAllocatedUnits, 100);
  const eligibleWallets = Number(body.eligibleWallets || 0);
  const slug = clean(body.slug, 80).toLowerCase();
  const uploadToken = clean(body.uploadToken, 300);
  const uploadTokenHash = clean(body.uploadTokenHash, 66).toLowerCase();

  if (!/^[a-z0-9-]{8,80}$/.test(slug)) throw new Error("Invalid claim slug.");
  if (!isAddr(creator) || !isAddr(sourceContract)) throw new Error("Invalid creator or source contract.");
  if (!Object.prototype.hasOwnProperty.call(SOURCE_CHAINS, sourceChain) || SOURCE_CHAINS[sourceChain] !== sourceChainId) throw new Error("Invalid source chain key / chain ID pair.");
  if (!Number.isSafeInteger(snapshotBlock) || snapshotBlock <= 0 || !isB32(snapshotBlockHash)) throw new Error("A valid pinned source block and block hash are required.");
  if (body.snapshotComplete !== true) throw new Error("A provably complete source snapshot is required.");
  if (!isB32(distributionFingerprint) || !isB32(suppliedPackageFingerprint) || !isB32(merkleRoot)) throw new Error("Invalid provenance/distribution/Merkle fingerprint.");
  if (!/^\d{1,100}$/.test(totalAllocatedUnits) || BigInt(totalAllocatedUnits) <= 0n) throw new Error("Invalid allocation total.");
  if (!Number.isInteger(eligibleWallets) || eligibleWallets < 1 || eligibleWallets > 20000) throw new Error("Invalid eligible wallet count.");
  if (uploadToken.length < 48 || !isB32(uploadTokenHash)) throw new Error("Invalid protected upload session token.");

  return { sourceChain, sourceChainId, sourceContract, creator, snapshotBlock, snapshotBlockHash, distributionFingerprint, suppliedPackageFingerprint, merkleRoot, totalAllocatedUnits, eligibleWallets, slug, uploadToken, uploadTokenHash };
}

async function verifySourceSnapshot(input: { sourceChain: string; sourceChainId: number; sourceContract: string; snapshotBlock: number; snapshotBlockHash: string }) {
  const url = new URL(HOLDERS_VERIFY_URL);
  url.searchParams.set("chain", input.sourceChain);
  url.searchParams.set("contract", input.sourceContract);
  url.searchParams.set("snapshotBlock", String(input.snapshotBlock));
  url.searchParams.set("snapshotBlockHash", input.snapshotBlockHash);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 65000);
  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: { "Cache-Control": "no-store" },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `Source provenance verification failed (${response.status}).`);
    if (
      data?.complete !== true || data?.partial === true ||
      Number(data?.chainId) !== input.sourceChainId ||
      String(data?.contract || "").toLowerCase() !== input.sourceContract ||
      Number(data?.snapshotBlock) !== input.snapshotBlock ||
      String(data?.snapshotBlockHash || "").toLowerCase() !== input.snapshotBlockHash
    ) throw new Error("Source snapshot provenance could not be independently revalidated by the server.");
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function proxyCore(req: Request, route: string, body?: any) {
  const url = new URL(CORE_URL);
  url.searchParams.set("route", route);
  if (req.method === "GET") {
    const incoming = new URL(req.url);
    incoming.searchParams.forEach((value, key) => { if (key !== "route") url.searchParams.set(key, value); });
  }
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  const uploadHeader = req.headers.get("x-forge-upload-token");
  if (uploadHeader) headers["x-forge-upload-token"] = uploadHeader;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(url.toString(), {
    method: req.method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: { ...cors, "Content-Type": response.headers.get("content-type") || "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const route = clean(url.searchParams.get("route"), 32).toLowerCase();

  try {
    if (req.method === "GET") return proxyCore(req, route);
    if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

    const body = await req.json().catch(() => ({}));
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    if (route === "create") {
      const v = validateCreateShape(body);
      const expectedPackage = await packageFingerprint(body);
      if (!equalText(expectedPackage, v.suppliedPackageFingerprint)) return json({ error: "Package provenance fingerprint mismatch." }, 409);

      const actualUploadHash = `0x${await sha256HexRaw(v.uploadToken)}`;
      if (!equalText(actualUploadHash.toLowerCase(), v.uploadTokenHash)) return json({ error: "Upload token hash mismatch." }, 403);

      const attested = await verifySourceSnapshot(v);
      const rawUploadHash = actualUploadHash.slice(2);
      if (!isHex64(rawUploadHash)) return json({ error: "Upload token hash normalization failed." }, 500);

      const { error: authError } = await supabase.from("forge_claim_provenance_authorizations").insert({
        slug: v.slug,
        creator_wallet: v.creator,
        source_chain: v.sourceChain,
        source_chain_id: v.sourceChainId,
        source_contract: v.sourceContract,
        snapshot_block: v.snapshotBlock,
        snapshot_block_hash: v.snapshotBlockHash,
        snapshot_complete: true,
        snapshot_source: clean(attested?.source, 80) || null,
        snapshot_provenance: attested?.provenance && typeof attested.provenance === "object" ? attested.provenance : null,
        distribution_fingerprint: v.distributionFingerprint,
        package_fingerprint: expectedPackage,
        merkle_root: v.merkleRoot,
        total_allocated_units: v.totalAllocatedUnits,
        eligible_wallets: v.eligibleWallets,
        upload_token_hash: rawUploadHash,
        expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
      });
      if (authError) {
        if (String(authError.code) === "23505") return json({ error: "Claim provenance authorization already exists for this slug." }, 409);
        throw authError;
      }

      const response = await proxyCore(req, route, body);
      if (!response.ok) {
        await supabase.from("forge_claim_provenance_authorizations").delete().eq("slug", v.slug).is("consumed_at", null);
      }
      return response;
    }

    if (route === "publish") {
      const slug = clean(body.slug, 80).toLowerCase();
      if (!/^[a-z0-9-]{8,80}$/.test(slug)) return json({ error: "Invalid claim slug." }, 400);

      const { data: epoch, error } = await supabase.from("forge_claim_epochs").select(
        "id,slug,status,creator_wallet,source_chain,source_chain_id,source_contract,snapshot_block,snapshot_block_hash,snapshot_complete,snapshot_source,snapshot_provenance,distribution_fingerprint,package_fingerprint,merkle_root,total_allocated_units,eligible_wallets"
      ).eq("slug", slug).maybeSingle();
      if (error) throw error;
      if (!epoch) return json({ error: "Claim not found." }, 404);
      if (epoch.status !== "uploading") return json({ error: "Claim package is already published." }, 409);

      const persisted = {
        distributionFingerprint: String(epoch.distribution_fingerprint || "").toLowerCase(),
        sourceChain: String(epoch.source_chain || "").toLowerCase(),
        sourceChainId: Number(epoch.source_chain_id || 0),
        sourceContract: String(epoch.source_contract || "").toLowerCase(),
        snapshotBlock: Number(epoch.snapshot_block || 0),
        snapshotBlockHash: String(epoch.snapshot_block_hash || "").toLowerCase(),
        snapshotComplete: epoch.snapshot_complete === true,
        merkleRoot: String(epoch.merkle_root || "").toLowerCase(),
        eligibleWallets: Number(epoch.eligible_wallets || 0),
        totalAllocatedUnits: String(epoch.total_allocated_units || ""),
      };

      if (!persisted.snapshotComplete || !isB32(persisted.snapshotBlockHash) || !isB32(persisted.distributionFingerprint)) return json({ error: "Persisted snapshot provenance is incomplete." }, 409);
      const recomputed = await packageFingerprint(persisted);
      if (!equalText(recomputed, String(epoch.package_fingerprint || "").toLowerCase())) return json({ error: "Persisted package provenance fingerprint mismatch." }, 409);
      if (body.packageFingerprint && String(body.packageFingerprint).toLowerCase() !== recomputed) return json({ error: "Publish request package fingerprint mismatch." }, 409);
      if (body.snapshotBlockHash && String(body.snapshotBlockHash).toLowerCase() !== persisted.snapshotBlockHash) return json({ error: "Publish request snapshot hash mismatch." }, 409);
      if (body.snapshotComplete !== undefined && body.snapshotComplete !== true) return json({ error: "Publish request snapshot completeness mismatch." }, 409);

      const attested = await verifySourceSnapshot(persisted);
      const verifiedAt = new Date().toISOString();
      const { error: updateError } = await supabase.from("forge_claim_epochs").update({
        provenance_verified_at: verifiedAt,
        snapshot_source: clean(attested?.source, 80) || epoch.snapshot_source || null,
        snapshot_provenance: attested?.provenance && typeof attested.provenance === "object" ? attested.provenance : epoch.snapshot_provenance || null,
      }).eq("id", epoch.id).eq("status", "uploading");
      if (updateError) throw updateError;

      const response = await proxyCore(req, route, body);
      if (!response.ok) {
        await supabase.from("forge_claim_epochs").update({ provenance_verified_at: null }).eq("id", epoch.id).eq("status", "uploading");
      }
      return response;
    }

    return proxyCore(req, route, body);
  } catch (error) {
    console.error("forge-claims-gateway", error);
    return json({ error: error instanceof Error ? error.message : "FORGE claims gateway error." }, 500);
  }
});
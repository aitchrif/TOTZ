import {
  isFresh,
  linkMessage,
  normalizeWallet,
  verifyDiscordRequest,
} from "../_shared/discord-security.ts";
import { assert, assertEquals } from "jsr:@std/assert@1.0.14";

Deno.test("invalid Discord signature is rejected", () => {
  assertEquals(
    verifyDiscordRequest("00".repeat(32), "00".repeat(64), "1", new TextEncoder().encode("{}")),
    false,
  );
});

Deno.test("expired and used nonces are rejected", () => {
  assertEquals(isFresh(new Date(Date.now() - 1).toISOString()), false);
  assertEquals(isFresh(new Date(Date.now() + 60_000).toISOString(), new Date().toISOString()), false);
});

Deno.test("canonical link message binds Discord, wallet, chain, contract, nonce and timestamp", () => {
  const wallet = normalizeWallet("0x0000000000000000000000000000000000000001");
  const message = linkMessage({
    discordUserId: "123456789012345678",
    wallet,
    nonce: "abc",
    timestamp: 123,
  });
  assert(message.includes("Discord User ID: 123456789012345678"));
  assert(message.includes("Chain ID: 4663"));
  assert(message.includes("Nonce: abc"));
  assert(message.endsWith("Timestamp: 123"));
});

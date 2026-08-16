import nacl from "npm:tweetnacl@1.0.3";
import { getAddress, verifyMessage } from "npm:viem@2.33.3";

export const CHAIN_ID = 4663;
export const CONTRACT = "0x107c4e7cf931b18e022d40184d03d00b4ec99d5a";

export function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) throw new Error("Invalid hex");
  return Uint8Array.from(hex.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
}

export function verifyDiscordRequest(
  publicKey: string,
  signature: string,
  timestamp: string,
  body: Uint8Array,
): boolean {
  try {
    const prefix = new TextEncoder().encode(timestamp);
    const message = new Uint8Array(prefix.length + body.length);
    message.set(prefix);
    message.set(body, prefix.length);
    return nacl.sign.detached.verify(
      message,
      hexToBytes(signature),
      hexToBytes(publicKey),
    );
  } catch {
    return false;
  }
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 32): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return [...data].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeWallet(wallet: string): string {
  return getAddress(wallet).toLowerCase();
}

export function linkMessage(input: {
  discordUserId: string;
  wallet: string;
  nonce: string;
  timestamp: number;
}): string {
  return [
    "TOTZ Discord Link",
    `Discord User ID: ${input.discordUserId}`,
    `Wallet: ${input.wallet.toLowerCase()}`,
    `Chain ID: ${CHAIN_ID}`,
    `Contract: ${CONTRACT}`,
    `Nonce: ${input.nonce}`,
    `Timestamp: ${input.timestamp}`,
  ].join("\n");
}

export async function verifyWalletLink(
  wallet: string,
  message: string,
  signature: string,
): Promise<boolean> {
  try {
    return await verifyMessage({
      address: getAddress(wallet),
      message,
      signature: signature as `0x${string}`,
    });
  } catch {
    return false;
  }
}

export function isFresh(expiry: string, usedAt?: string | null): boolean {
  return !usedAt && Date.parse(expiry) > Date.now();
}

# GROWN full snapshot audit — 2026-10-31

**Status: BLOCKED / NOT A VERIFIED SNAPSHOT. DO NOT USE FOR FINAL SUPPLY ANNOUNCEMENT.**

## Verified on-chain reads (Robinhood mainnet via dedicated TOTZ FORGE Alchemy app)
- Chain ID: 4663
- Collection TOTZ: 0x107C4e7cF931B18e022d40184D03d00b4eC99D5a
- Observed current block: **102565777** (hex 0x61d0791), during check on 2026-10-31; use as reference candidate snapshot block, not a completed snapshot.
- On-chain TOTZ ERC721 totalSupply() returned 0xFA0 = **4,000**.

## Collection WIF Outlaws
- Contract verified via OpenSea NFT contract page: **0x12A4c7659A4B7C4a2870B5167C4f8b014C7fa690**.
- Historical OpenSea live unique-owners figures **1011** WIF and **765** TOTZ are NOT complete wallet balance exports at a fixed block.

## Why no wallet-by-wallet result
- OpenSea overview exposes aggregate unique owner counts but not a full freeze/export at an exact block.
- Blockscout full token holder API is blocked in this MCP session by an explicit PRO API key requirement. The API returned a non-retryable error requiring connection configuration and new session.
- Container network requests were not available.
- No complete NFT transfer-log replay and ownerOf()/balanceOf() verification was performed for both contracts.

## Rules for eventual reproducible accurate snapshot
1. At a fixed reference block (e.g. **102565777**, if chain indexers allow historical snapshots) enumerate all minted TOTZ tokenIDs / token-transfer ledger and verify current owner and balances at that block, including vault/listing contracts, burns, zero addresses, escrow and team treasury.
2. Enumerate WIF Outlaws owners at *the same block*, grouping unique wallet addresses and applying explicitly stated eligibility criteria.
3. For TOTZ apply publicly announced entitlements: 1 ->1, 2–4 ->2, 5–9 ->4, 10–14 ->6, 15–24 ->8, 25–49 ->10, 50+ ->15, plus **+20 for each of the Top 10 by holdings at the official snapshot**.
4. Make explicit any balance ties at #10 and whether marketplace escrow/contract wallets qualify. Do not silently remove rights from a holder owning both collections.
5. Export original balances and entitlements (wallet, totz_balance, tier_claim, top10_bonus, wif_balance, wif_claim, total_grown_claim) with snapshot block/hash/UTC time and hash of data.
6. Confirm each ERC721 owner count, contract supply, no unknown tokenIDs and total allocation.
7. Test **H+W+other prior public commitments+free/paid GTD+giveaways+team <= 3333**. Previously announced supply 6666 and rights may require amended public announcement.

## Publication status
**No exact total of required GROWN free mints has been obtained. It would be misleading to claim 3333 is confirmed.**

# TOTZ: GROWN — Holder CSV allocation audit (2026-10-31)

## Source and integrity warning
User uploaded `robinhood_chain_token_holders_0x107C4e7cF931B18e022d40184D03d00b4eC99D5a (1).csv`, with 2 columns: `HolderAddress`, `Balance`.
- Rows: **766**
- Distinct addresses case-insensitive: **766** (all 0x+40 chars)
- Positive integer balances: **766**
- No duplicates / nulls.
- Sum of balances: **4,009**.
- This **does not reconcile** with on-chain `totalSupply() = 4,000` checked via Alchemy Robinhood mainnet on 2026-10-31 (block observed 102565777); mismatch **+9**. Cannot call this a verified single-block snapshot. Verify export block, contract, ERC-721 vs multi-token counting and stale indexer state before freezing allowlist.

## Announced TOTZ tiers applied as-is
| TOTZ count | Wallet count | GROWN tier entitlements |
| --- | ---: | ---: |
| 1 | 390 | 390 |
| 2–4 | 217 | 434 |
| 5–9 | 78 | 312 |
| 10–14 | 35 | 210 |
| 15–24 | 21 | 168 |
| 25–49 | 12 | 120 |
| 50+ | 13 | 195 |
| **Total tier allocation** | **766** | **1,829** |

Top 10 extra bonuses (+20 EACH) = **200**.
**TOTAL conditional original TOTZ free GROWN = 2,029**.
Top 10 balances: 252, 186, 179, 132, 107, 100, 82, 69, 61, 55; their combined GROWN entitlement = 350 (150 tier + 200 bonus).

## Budget if WIF Outlaws = 1,011 eligible wallets
- TOTZ free entitlements from this **unreconciled CSV**: **2,029**.
- WIF free if 1 each (user indicated **1,011**; not verified full wallet snapshot at same block): **1,011**.
- Combined **3,040**.
- Against proposed 3,333 supply: **293 left** for ALL other allocations/commitments.
- If 100 giveaway reserve and founder special 1/1 both count separately, **192 left** for remaining GTD, FCFS, partnerships, team reserves and any other promises.
- **3,333 is conditionally enough for these two pools according to this exported file**, but is **not yet verifiably sufficient for all commitments**.

## Required verification before public supply reduction announcement
1. Re-export or reconcile TOTZ holdings so all balances sum **exactly 4,000** at snapshot block (verify NFT token IDs, not generic token holders without NFT token IDs).
2. Verify WIF contract (`0x12A4c7659A4B7C4a2870B5167C4f8b014C7fa690`), total unique eligible addresses and block at same cutoff.
3. Determine treasury, escrow, marketplace contract, special addresses, zero address and other nonhuman eligible ownership, as well as tie breaks at Top 10.
4. Check overlaps between TOTZ and WIF wallet lists: rights add unless an alternate public rule was already established.
5. Audit other already-promised partner/GTD allocations against remaining 293 (or 192 with illustrated giveaways+1 honorary).
6. After reconciling, publish updated supply announcement from prior publicly announced **6,666** to selected **3,333**, without silently changing free-mint promises.

**Do not publish this CSV wallet address list in a public GitHub repository.** Full calculated .xlsx was generated for user delivery in this chat; summary only retained here.

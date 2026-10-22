# TOTZ: GROWN — Announced tier audit (provisional, 2026-10-22)

**NOT an official snapshot. NOT the final allocation/allowlist.** Visible OpenSea data is dynamic. This report uses the publicly pinned @WeAreTOTZ announcement from **2026-09-28** supplied as a screenshot by the project owner, plus the visible ranked holders on **2026-10-22**.

## Publicly announced terms (reference — do not supersede with prior internal draft)
- Supply in the pinned post: **6,666**.
- 1 TOTZ => 1 FREE
- 2–4 => 2 FREE
- 5–9 => 4 FREE
- 10–14 => 6 FREE
- 15–24 => 8 FREE
- 25–49 => 10 FREE
- 50+ => 15 FREE
- **Top 10 Genesis wallets at official snapshot receive +20 EXTRA free GROWN per wallet, in addition to the normal tier.**

## Source checked
- https://opensea.io/collection/wetotz/holders — displayed 765 unique owners, 4,000 original TOTZ supply, and top 25 ranked balances on 2026-10-22 (dynamic; may change with trades).
- User-supplied screenshot of pinned TOTZ post dated 2026-09-28.
- Collection contract previously associated with project: `0x107c4e7cf931b18e022d40184d03d00b4ec99d5a` on Robinhood Chain.

## Visible 25 ranked wallets and current provisional entitlement
| Rank | OpenSea label | Original TOTZ owned | GROWN free entitlement incl. top-10 bonus |
|---:|---|---:|---:|
| 1 | Dubs22 | 252 | 35 |
| 2 | WeTOTZ | 186 | 35 |
| 3 | RottenArmy | 132 | 35 |
| 4 | Goddard-ac96be | 82 | 35 |
| 5 | XWADE3 | 61 | 35 |
| 6 | GullGruven | 55 | 35 |
| 7 | 369d | 54 | 35 |
| 8 | L-T17 | 51 | 35 |
| 9 | drjame2 | 41 | 30 |
| 10 | cyberalhaji | 40 | 30 |
| 11 | Cray50 | 36 | 10 |
| 12 | MyNameIsNemo | 30 | 10 |
| 13 | s0tric | 29 | 10 |
| 14 | M-1717 | 28 | 10 |
| 15 | _Sasu | 28 | 10 |
| 16 | TiddsBBNFT | 25 | 10 |
| 17 | 0xDF61 | 22 | 8 |
| 18 | NFTVault127 | 21 | 8 |
| 19 | Freshout | 20 | 8 |
| 20 | Nanobeatss | 20 | 8 |
| 21 | fFb65 | 20 | 8 |
| 22 | Crypto_Classics | 17 | 8 |
| 23 | paulyongdcl | 16 | 8 |
| 24 | creedfi | 16 | 8 |
| 25 | chrispinus | 15 | 8 |
| **TOTAL** | **Visible top 25** | **1,297** | **472** |

Breakdown: Current #1–#8 = 8 × (15 + 20) = 280; #9–#10 = 2 × (10 + 20) = 60; #11–#16 = 6 × 10 = 60; #17–#25 = 9 × 8 = 72. **Total = 472**. Top 10 subset = 340. The extra Top 10 bonus by itself = 200.

## What cannot be stated exactly from this source
The visible holders page did not provide a usable complete export of all 765 wallet balances. As a result, the exact FREE GROWN total for all owners **cannot be verified** from these 25 rows, and any exact all-wallet count would be an invention. At official snapshot the Top 10 rankings and even the unique owner count can differ.

## Mathematical stress-test bounds — CONDITIONAL, NOT FORECAST
If (a) exactly 765 distinct eligible wallets own all 4,000 original TOTZ, (b) the visible 25 are the first 25 sorted by balance, and (c) every other 740 wallet owns 1–15 NFTs, then those 740 wallets together own 2,703 NFTs. Optimizing the announced piecewise mint formula across all possible distributions gives:
- Minimum for 740 unobserved wallets = **1,395** free; combined minimum = **1,867**.
- Maximum for 740 unobserved wallets = **2,295** free; combined maximum = **2,767**.
These are rigorous conditional extremes of an integer budget model, **not estimates of current actual entitlement**. If OpenSea counts escrow/contracts differently, if the wallet count changes, or if top 25 balances change, the bounds must be recomputed.

## Needed to finalize
1. Full exported all-owner (wallet, balance) CSV at a chosen block / snapshot time.
2. Determine whether team/treasury wallets and smart contracts have free claims, whether multiple owners can be linked, and whether holding listed NFTs qualifies (the pinned announcement did NOT impose a delisting rule).
3. Apply exact bracket formula and Top 10 +20 only once per eligible wallet.
4. Compare total against any proposed GROWN supply (public announcement said 6,666) and reserved WIF Outlaws/GTD/other pools.
5. Save both raw snapshot and calculated allowlist as separate files with block/time, and publish any changed supply policy transparently.

**No new supply or allocation has been approved by this audit.**

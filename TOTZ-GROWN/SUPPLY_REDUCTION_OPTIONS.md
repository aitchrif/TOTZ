# TOTZ: GROWN — Supply Reduction Scenarios

Updated: 2026-10-22
Decision status: **OWNER CHOSE 3,333 AS PREFERRED TARGET ON 2026-10-22 — FEASIBILITY AND PUBLIC AMENDMENT PENDING**
**Publicly announced on pinned @WeAreTOTZ X post 2026-09-28: 6,666.** 5,555 was an internal subsequent proposal; no official amendment has been confirmed (no contract supply edited).

## Constraints to preserve
- Original TOTZ collection supply = 4,000, not the target GROWN supply.
- Original TOTZ holder guaranteed free mint eligibility remains a priority.
- **Actually announced tier formula:** 1=>1, 2–4=>2, 5–9=>4, 10–14=>6, 15–24=>8, 25–49=>10, 50+=>15; Top 10 at official snapshot get **+20 EACH IN ADDITION** to regular tier. Total entitlements have not been verified from a complete snapshot.
- WIF Outlaws: announced 1 free GROWN mint per qualifying wallet. Earlier discussion indicated about 992 wallets, but this is not a verified fresh GROWN snapshot and must not be used as an exact mint count.
- No open public mint. Separate FREE_GTD, PAID_GTD and curated community access.
- Keep previously announced commitments; do not silently diminish entitlements or forget the founder 1/1.

## Scenario feasibility (indicative ONLY)
Assume for stress-test TOTZ budget 3,000, WIF wallets 992, giveaways 100, **no overlap credits**:
| Candidate supply | Change from 5,555 | Remaining for GTD, paid, team, and extras after 3,000 + 992 + 100 |
| --- | ---: | ---: |
| 5,555 | baseline | 1,463 |
| **4,444** | -1,111 (-20.0%) | **352** |
| 4,000 | -1,555 (-28.0%) | **-92 (not feasible)** |
| 3,333 | -2,222 (-40.0%) | **-759 (not feasible)** |

The 3,000 is a **proposed reserve**, NOT a measured holder entitlement. The 2026-10-22 visible top 25 alone represent 472 provisional entitlements; see HOLDER_ALLOCATION_CHECK_2026-10-22.md. A fresh wallet-level simulation may show a lower or higher actual number. Count overlaps according to an explicitly approved stacking rule, not optimistically.

## Possible 4,444 draft distribution — not a promise
| Pool | Budget |
| --- | ---: |
| Original TOTZ holder cap (conditional on simulation) | 2,400 |
| WIF Outlaws holder reserve (indicative; validate eligibility) | 1,050 |
| FREE_GTD | 400 |
| PAID_GTD | 350 |
| Giveaways | 100 |
| Team/project/1-of-1/unclaimed contingency | 144 |
| **Total** | **4,444** |

This budget works **only if** the final holder-tier entitlement is <=2,400, verified WIF entitlement <=1,050, and creator 1/1 and all promised extra rights fit their pools. If not, move budget from GTD/paid/reserve, change supply, or negotiate unannounced tiers — don't retroactively revoke already public guarantees.

## Updated owner direction
The selected design target is now **3,333**, not 4,444. It reduces the originally announced 6,666 by 50%. With the old assumed 992 WIF holder wallets and 100 giveaways, only 2,241 remain even BEFORE founder 1/1, GTD, team, or community allocations. Keep all publicly committed entitlement rules; no fixed bucket can be guaranteed without the full current snapshots.

Do not announce 3,333 as executable or edit on-chain supply until:
1. Get current TOTZ NFT wallet holdings and simulate tiers, including the announced Top 10 +20 extra and confirmed 15–24 bracket.
2. Get current WIF wallet snapshot and decide cross-collection overlap/stacking.
3. Check all partner commitments already announced, including giveaways and founder 1/1.
4. Fit the exact sum to supply; test allowlist and claims.
5. Owner preference recorded as 3,333. Verify that the full commitments fit; then finalize and publish amended supply, updating contract/website and mint materials.

This document exists to preserve the latest discussion without incorrectly treating it as a finalized policy.

See `SUPPLY_3333_DECISION_2026-10-22.md` for 3,333 feasibility gates and allocation accounting. The illustrative 4,444 budget above is obsolete and not authorized for production.

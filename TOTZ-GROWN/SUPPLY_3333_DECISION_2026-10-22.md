# TOTZ: GROWN — 3,333 Supply Decision & Feasibility Gate

**Decision recorded:** 2026-10-22
**Owner's preferred supply target:** **3,333 TOTZ: GROWN NFTs**
**Status:** Approved as a **planning/design target only**; NOT yet validated as an executable total; NOT deployed or publicly announced as a change.
**Originally PUBLICLY announced supply:** **6,666 NFTs** on pinned TOTZ X post dated 2026-09-28 (user-supplied screenshot). Proposed change is **-3,333 NFTs (-50%)**.

## Nonnegotiable existing mint commitments
Original TOTZ (Genesis) wallets at official snapshot:
| Original NFTs held | Free GROWN |
| ---: | ---: |
| 1 | 1 |
| 2–4 | 2 |
| 5–9 | 4 |
| 10–14 | 6 |
| 15–24 | 8 |
| 25–49 | 10 |
| 50+ | 15 |

**Extra Top 10 bonus:** Add **20 Free GROWN** per Top 10 Genesis wallet to the tier amount, NOT replace it. This adds exactly **200** free entitlements if Top 10 eligibility is fulfilled.

**WIF Outlaws holders:** announced 1 guaranteed FREE GROWN per eligible snapshot wallet; final wallet count and overlap rule pending. About 992 was mentioned in an earlier holder analysis but is **not a verified current snapshot**, so it can only be used for stress tests.

**Other:** honor founder 1/1, giveaways/partners and any independently published promises; audit these before reducing any uncommitted community/paid buckets. NO open public mint.

## Hard supply accounting
Let
- `H` = verified TOTAL Genesis free mint entitlement **including Top 10 +200**;
- `W` = verified WIF free mint entitlement after the explicitly announced overlap/stacking policy;
- `P` = other previously committed partner/giveaway/founder obligations;
- `C` = planned FREE_GTD + PAID_GTD + FCFS + uncommitted team/reserve.

The necessary condition is **H + W + P + C <= 3,333**.

### Stress test with prior indicative WIF count (992)
| Bucket | Illustrative amount |
| --- | ---: |
| Preferred new total | 3,333 |
| WIF Outlaws — old approximate wallets | -992 |
| Giveaway pool — earlier proposal, **not yet confirmed as a binding obligation** | -100 |
| Founder 1/1 — assuming separate additional token inside supply | -1 |
| **Remaining for all original TOTZ free rights + GTD, paid, FCFS, and team** | **2,240** |

- If `H=1,867` (conditional theoretical lower bound given 765 owner distribution), then only 373 slots remain after WIF, 100 giveaways and founder 1/1.
- If `H=2,767` (conditional theoretical upper bound), this scenario is **527 NFTs over supply even before GTD/paid/community**.
- These H limits come from a conditional integer optimization using 4,000 supply, 765 owners, and the visible top-25 ownership snapshot on 2026-10-22. They are not a measured holder total and are **not guaranteed bounds at future snapshot dates**.
- Removing discretionary 100 giveaways and other uncommitted categories helps, but cannot override any giveaways already promised to recipients.
- A wallet appearing in both TOTZ and WIF pools must be treated according to transparently specified rules; do not assume its rights disappear through deduplication.

### What would make 3,333 viable?
- All promised original TOTZ + WIF + other fixed entitlements fit within 3,333.
- Decide whether any remaining 3,333 capacity supports FREE_GTD, PAID_GTD and community FCFS; these pools may need to be small or zero if already-committed claims consume most supply.
- Founder honorary NFT rarity/metadata and mint supply counting is verified.

## Implementation checklist — STOP until all pass
1. [ ] Export **complete** original TOTZ wallet balances (not just OpenSea top 25) at a reproducible snapshot block; total unique holders / NFT supply verified.
2. [ ] Compute tier entitlements and Top 10 extra +20 for every wallet.
3. [ ] Export WIF Outlaws eligible holder wallets at the same declared policy cut-off; count 1/wallet and handle overlap transparently.
4. [ ] List ALL already-announced partnership commitments, giveaways and honorary reserved tokens; distinguish commitments from brainstorming.
5. [ ] Produce exact ledger `H + W + P + C = 3,333` with uncommitted allocations chosen only after commitments.
6. [ ] **If commitments alone exceed 3,333, DO NOT breach promises:** discuss increasing supply or a transparent, consented change to earlier eligibility.
7. [ ] Issue official public X/Discord notice **updating 6,666 -> 3,333** before mint, clearly confirming that holder tiers + Top 10 bonuses remain intact if feasible.
8. [ ] Update mint contract settings, allowlist / checker, metadata generation count, and website ONLY after validated final supply.
9. [ ] Confirm smart-contract constraints: if deployed with an immutable 6,666 cap, changing supply may require a new contract or an enforceable lower minted cap.

## Source
- User-supplied screenshot, pinned TOTZ / @WeAreTOTZ post dated September 28, 2026.
- https://opensea.io/collection/wetotz/holders (765 unique owners, top 25 displayed, checked 2026-10-22).
- `HOLDER_ALLOCATION_CHECK_2026-10-22.md` — provisional top 25; no authoritative complete holders snapshot.

**Decision log:** The 3,333 direction supersedes earlier internal planning targets (5,555 and 4,444) **for design purposes**. Public communication and contract implementation are deliberately pending real eligibility validation.

## CURRENT CHECK — 2026-10-22 (OpenSea live holders pages)
**Newer than the old 992-wallet stress-test above. Use this section for current decisions.**
- TOTZ Original: **765 unique owners**; original NFT supply **4,000**; top-25 visible balances (sum **1,297**) imply **472** free GROWN including Top-10 +200 under the public tiers. Source: https://opensea.io/collection/wetotz/holders — crawled 2026-10-22.
- WIF Outlaws: **1,036 unique owners**, 2,222 NFTs, on https://opensea.io/collection/wif-outlaws/holders — crawled 2026-10-22.
- Assuming every unique WIF holder gets 1 free GROWN: WIF obligation ~**1,036**. This is a live page count, not the official freeze.
- `3,333 - 1,036 = 2,297`: maximum available for ALL Original TOTZ free allocations plus every other pool. Thus **H must be <=2,297 even if NO other pools are assigned**. With 100 giveaways +1 founder 1/1, H must be **<=2,196**, and this leaves zero for GTD/paid/team.
- Conditional TOTZ owner distribution bounds from the visible top-25 and 4,000/765 figures are still **H in [1,867, 2,767]**. Combined two collections require **[2,903, 3,803]** GROWN (before any other obligations). So 3,333 **MAY** suffice for the two communities, but this is **NOT CONFIRMED**; upper conditional allocations exceed cap by **470**.
- The critical break-even for TOTZ holder obligations is **2,297** (strictest before extras). Need full 765-wallet holdings to determine if H <= 2,297, and ideally a meaningful remainder for GTD/community.
- Overlaps of addresses across TOTZ and WIF Outlaws do NOT automatically remove the separate promised benefits. Define any exclusive/stackable mint policy publicly and check all claims before finalizing.
- **Verdict: Cannot currently guarantee 3,333 is enough.** Confirm exact H from full current on-chain snapshot and W from a same-date holder export before announcing.

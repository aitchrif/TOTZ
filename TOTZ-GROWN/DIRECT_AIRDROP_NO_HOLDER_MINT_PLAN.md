# TOTZ: GROWN — Direct Airdrop, no holder-initiated mint

Date: 2026-10-31
Status: TECHNICAL PLAN ONLY — no contract deployed, no mint or transfer executed.

## Objective
Project owner wants TOTZ: GROWN automatically sent to holder wallets without recipients connecting, claiming, or paying. Every NFT MUST still be minted on-chain; project does the mint in owner-controlled batch transactions, directly to recipients. Robinhood Chain mainnet (4663) uses ETH gas paid by the project wallet.

## Recommended design
- Build a new ERC-721 GROWN contract, max supply 3,333 **only after confirmed commitment coverage**.
- Add protected owner-only batch direct mint function (e.g. airdropMint(recipients, quantities)), which mints unique ERC-721 IDs directly to holder addresses. Use gas-sized chunks instead of one huge transaction. Avoid mint-all-to-project + resend unless contract technology requires it.
- Test safe minting to contract wallets; reject/handle non-receiver smart contracts through separately approved exception policy.
- Add allocation ledger with idempotency and onchain verification, safe admin permissions, non-reentrancy where appropriate, immutable cap, and fully traceable Transfer events.
- Assign distinct images, traits and metadata to all NFT IDs; choose a fair deterministic reveal/reassignment process prior to distributions.
- Do not trust guessed gas cost; estimate batches and fund project operational wallet with ETH on Robinhood Chain. Thousands of tokens / hundreds of recipient wallets require multiple transactions.

## Announced promises
- TOTZ Genesis tiers 1=>1, 2–4=>2, 5–9=>4, 10–14=>6, 15–24=>8, 25–49=>10, 50+=>15; Top 10 +20 EXTRA. Genesis per-wallet max **35**.
- WIF Outlaws 1 free per eligible wallet.
- CROSS-COLLECTION OVERLAP: **open** whether “35 maximum” applies to Genesis entitlement only or all claims per wallet. Prior messages explicitly treated WIF separately, potentially 36 to wallet entitled to Genesis 35 + WIF 1. Do not silently cancel WIF rights to enforce a universal cap.
- TOTZ holder CSV provided has 766 rows with combined balances 4,009 vs onchain totalSupply 4,000, not reconciled; provisional tier 1,829 +200=2,029.
- WIF 1,011 wallets count is provisional without full on-chain snapshot.
- Provisional combined allocation 3,040, leaving 293 of 3,333 for other obligations, subject to all audits. Earlier publicly announced 6,666 cap requires explicit public supply update once 3,333 is fully feasible.

## Steps
1. Reconcile TOTZ 4,009 vs 4,000 and obtain complete current WIF holder list at a fixed snapshot block. Specify eligible wallets, escrow, contract holdings and top-10 ties.
2. Build private allocation table: address, TOTZ balance, tier grant, top-10 bonus, WIF eligibility, final grant, unique NFT IDs, status. Merge same addresses without losing applicable cross-collection rights. No public address list in GitHub by default.
3. Check all commitments (including giveaways, honorary, partners, GTD) fit <= 3,333, then finalize and announce change from previously published 6,666.
4. Complete unique NFT artwork and metadata storage, choose fair rarity assignment.
5. Deploy/test controlled ERC-721 on Robinhood testnet (chain 46630), verify max supply and batchMint access and safe receipts.
6. Estimate gas by a small dry run: 1, 15, 35 NFTs, different recipients and contracts. Verify contract recipients are compatible.
7. Execute owner-paid airdrop batches on mainnet with confirmed tx receipts, checkpoint/resume logs, avoid duplicate retries, handle known exceptions.
8. Independently reconcile all individual NFT ownership and recipient balances; announce completion only after checks.

## No execution approval
This record is a plan, not permission to mint or spend gas. Production distribution requires an audited allowlist and owner approval.

Sources:
- https://docs.robinhood.com/chain/deploy-smart-contracts/
- https://docs.openzeppelin.com/contracts/5.x/api/token/erc721
- https://portal.thirdweb.com/knowledge-base/troubleshoot/contracts/airdrop-contract

## STATUS CHANGE — 2026-10-31
**SUPERSEDED. DO NOT IMPLEMENT.** The owner selected holder-initiated mint via OpenSea on Robinhood Chain instead of project-run direct airdrop. Retain this file ONLY as a historical technical option. Current active plan and announcement live in PROJECT_SOURCE_OF_TRUTH.md and ANNOUNCEMENT_2222_FINAL_DRAFT_2026-10-31.md. No distribution was performed.

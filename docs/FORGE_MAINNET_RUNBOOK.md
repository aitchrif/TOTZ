# TOTZ FORGE — Robinhood Mainnet Release Runbook

This is the operator procedure for moving FORGE claim writes from Robinhood Chain Testnet (46630) to Robinhood Chain Mainnet (4663).

## Non-negotiable rule

Mainnet must remain fail-closed until every preflight is green. Never jump directly from `locked` to `public`.

FORGE has three independent write gates:

1. Client runtime gate: `mainnetClaimsEnabled`
2. Edge Function gate: master flag + staged release policy + dedicated mainnet RPC
3. Postgres trigger: master flag + staged release policy

A release is valid only when all three intentionally agree.

## Current default state

Expected safe state before Canary:

- `mainnet_claims_enabled = false`
- `mainnet_release_mode = locked`
- `mainnet_canary_sponsor = ''`
- `mainnet_canary_max_wallets = 10`
- `mainnet_canary_expires_at = ''`
- frontend `mainnetClaimsEnabled = false`
- frontend default claim network = Testnet 46630

## Gate 1 — Code and CI

Before touching release configuration:

- `Compile and Test Forge Contracts` must be green.
- `FORGE Claims Live Security` must be green.
- `FORGE Mainnet Readiness` must be green.
- `artifacts/ForgeMerkleClaim.json` must still report compiler `0.8.24`, optimizer enabled with 200 runs, and normalized runtime hash:
  `0x0051149977ffb2b42b63e07841f68b4bd382a1656ac32efbf5c3c064f12a0b56`
- The known published Testnet fixture must still match its live on-chain contract.
- Live mainnet claim creation must still be rejected while locked.
- Canary expiry invariant must pass: default blank, valid Canary window no longer than 24 hours, expired Canary treated as locked.

Do not continue after any red check.

## Gate 2 — Repository protection

Before Mainnet writes:

Protect `forge-v1` in GitHub and require these checks:

- `Compile and Test Forge Contracts`
- `FORGE Claims Live Security`
- `FORGE Mainnet Readiness`

Also disable force pushes and branch deletion. Prefer pull-request-only changes once Canary work starts.

## Gate 3 — Dedicated production RPC

Configure `FORGE_MAINNET_RPC_URL` as a Supabase Edge Function secret using a dedicated Robinhood Chain Mainnet provider endpoint.

Requirements:

- Secret stays server-side.
- Never commit the API key or endpoint credentials to GitHub.
- Verify `eth_chainId` returns decimal `4663` / hex `0x1237`.
- Keep Robinhood public RPC only as a non-secret fallback/read endpoint; production writes must fail if `FORGE_MAINNET_RPC_URL` is absent.

## Gate 4 — Final wallet-signed Testnet rehearsal

Run the complete production-shaped flow on Testnet with the final code:

1. EPOCHS creates the snapshot and Merkle package.
2. Launcher verifies every allocation/proof.
3. Sponsor deploys the immutable claim contract.
4. FORGE verifies runtime + immutable constructor values.
5. Sponsor funds the exact ERC-20 pool.
6. Sponsor signs V2 publication authorization.
7. Proofs upload and epoch publishes.
8. Eligible wallet claims successfully.
9. Same wallet cannot claim twice.
10. A non-eligible wallet cannot claim.
11. After deadline, sponsor recovers unclaimed funds.
12. Published metadata still matches the live contract.

### Automated release rehearsal

The repository includes the manual-only GitHub Action `FORGE Testnet Wallet E2E` and runner `tests/forge-testnet-wallet-e2e.mjs`.

Use a dedicated Robinhood Testnet-only operator wallet and add its private key as the encrypted repository secret:

`FORGE_TESTNET_OPERATOR_PRIVATE_KEY`

The operator wallet must hold a small amount of Robinhood Chain Testnet ETH for gas. Testnet tokens have no real-world value; obtain Testnet ETH from the official Robinhood Chain Testnet faucet.

The workflow automatically performs and verifies:

- deploy a fresh `ForgeTestUSDG`,
- build a two-wallet Merkle root/proofs,
- deploy the approved `ForgeMerkleClaim` artifact,
- fund the exact pool,
- sign the V2 publication message,
- create/upload/publish through the live FORGE claim service,
- perform one real eligible claim,
- prove double claim rejection,
- prove non-eligible rejection,
- wait until the short Testnet deadline,
- recover the exact unclaimed balance,
- write addresses and transaction hashes to the GitHub Actions step summary.

It is intentionally `workflow_dispatch` only and has a concurrency lock so it cannot consume Testnet gas automatically or run two rehearsals at the same time.

`FORGE Mainnet Readiness` syntax-checks this E2E runner on every relevant change even when the Testnet operator secret is not present.

Any E2E failure returns the release to LOCKED. Do not replace this release rehearsal with only read-only probes.

## Gate 5 — Prepare Canary policy while still locked

Choose one dedicated sponsor wallet for the first Mainnet Canary. It must be the wallet that deploys and signs the Canary claim.

Choose a short expiry window for the Canary authorization. It MUST be in the future and MUST NOT be more than 24 hours from the time it is configured. A few hours is preferred for the first controlled release.

Configure only the policy values first while the master gate remains `false`:

```sql
begin;

update public.forge_release_config
set value = lower('<CANARY_SPONSOR_ADDRESS>'), updated_at = now()
where key = 'mainnet_canary_sponsor';

update public.forge_release_config
set value = '10', updated_at = now()
where key = 'mainnet_canary_max_wallets';

update public.forge_release_config
set value = '<UTC_ISO_EXPIRY_WITHIN_24_HOURS>', updated_at = now()
where key = 'mainnet_canary_expires_at';

update public.forge_release_config
set value = 'canary', updated_at = now()
where key = 'mainnet_release_mode';

commit;
```

At this point Mainnet must STILL be closed because `mainnet_claims_enabled` remains `false` and the client runtime remains locked.

Before proceeding, `GET ?route=status` must report an effective locked state until the remaining gates are intentionally opened. The status endpoint must never expose the raw sponsor address, raw Canary expiry, or private RPC URL.

## Gate 6 — Canary release commit

Create a dedicated, reviewable Canary commit. Do not edit unrelated FORGE files.

The client change should intentionally:

- set environment/claim network to Robinhood Mainnet 4663 for the Canary surface,
- set `mainnetClaimsEnabled = true`,
- keep Testnet helper UI disabled,
- preserve network-aware read paths,
- display explicit MAINNET / REAL ASSETS warnings,
- preserve all review confirmations.

After the commit, require all three CI checks to pass and verify the Vercel Preview is READY before touching the server master gate.

## Gate 7 — Open server master gate last

Only after the Canary client preview is approved, branch protection is active, the dedicated RPC is configured, final Testnet rehearsal is complete, and the Canary expiry is still valid:

```sql
update public.forge_release_flags
set enabled = true, updated_at = now()
where key = 'mainnet_claims_enabled';
```

Because `mainnet_release_mode = canary`, the backend and Postgres trigger will still reject:

- any sponsor other than the configured Canary sponsor,
- any epoch with more than 10 eligible wallets,
- any Canary with missing, invalid, expired, or >24-hour authorization,
- unsupported claim chains,
- writes without the dedicated production mainnet RPC.

If the Canary expiry passes during create/upload/publish, later write stages fail closed. Configure a fresh controlled window only after re-running the release checks.

## Canary constraints

The first Mainnet epoch should use:

- 5–10 eligible wallets maximum,
- a deliberately small reward pool,
- a standard non-rebasing ERC-20,
- no fee-on-transfer, reflection, tax, rebasing, or balance-mutating tokenomics,
- a short but operationally comfortable claim window,
- only wallets controlled/known for the Canary validation,
- a Canary release authorization window of 24 hours maximum.

Do not use a valuable large distribution for the first live test.

## Canary validation

After deployment/funding/publication, verify all of the following independently:

- chain ID = 4663,
- contract runtime normalized hash matches the approved artifact,
- sponsor matches configured Canary sponsor,
- reward token address/symbol/decimals match the package,
- Merkle root matches,
- total allocation matches,
- deadline matches,
- contract is fully funded,
- public claim GET returns the correct epoch,
- one eligible wallet can claim,
- double claim is rejected,
- non-eligible wallet is rejected,
- `MY EPOCHS` reports correct live state,
- Blockscout links point to Robinhood Chain Mainnet.

If any check fails, execute lockdown immediately.

## Emergency lockdown

Preferred emergency action: run:

`supabase/sql/forge-mainnet-lockdown.sql`

It safely and idempotently restores:

- master gate = false,
- release mode = locked,
- Canary sponsor = blank,
- Canary max wallets = 10,
- Canary expiry = blank.

Important: locking the app/backend stops new FORGE publication flows. It does not and cannot disable already-deployed immutable claim contracts. Existing on-chain claim contracts continue according to their code, funding, proofs and deadline.

## Canary → Public promotion

Do not promote immediately after one successful claim. First complete the Canary validation and review contract funding/claim behavior.

When the Canary is considered stable:

1. Keep the master gate enabled only during the controlled promotion window.
2. Change `mainnet_release_mode` from `canary` to `public`.
3. Keep runtime/backend/DB chain checks and runtime attestation unchanged.
4. Run readiness/security checks again.
5. Use a second modest pilot epoch before a large public distribution.

Promotion command, only after explicit release approval:

```sql
update public.forge_release_config
set value = 'public', updated_at = now()
where key = 'mainnet_release_mode';
```

## Rollback principle

Application rollback and blockchain rollback are different:

- Frontend/backend rollback: disable gates and deploy the last known-good client/server build.
- Database rollback: use the lockdown SQL.
- On-chain contracts: immutable; cannot be rolled back. Never fund/deploy until all pre-deployment values are verified.

## Never do these

- Never commit a private key, seed phrase, API key, or RPC credential to repository files.
- Never paste a private key/seed phrase into FORGE UI, source code, logs, issues, support chats, or ordinary chat messages.
- The only automated signing exception is a dedicated Testnet-only operator private key stored as the encrypted `FORGE_TESTNET_OPERATOR_PRIVATE_KEY` GitHub Secret. Never put a Mainnet, treasury, holder, or valuable wallet key in that secret.
- Never commit an Alchemy/API key.
- Never enable the server master gate before the client Canary preview is approved.
- Never set release mode directly from `locked` to `public` for first launch.
- Never leave a Canary authorization without an expiry or with a window longer than 24 hours.
- Never remove runtime attestation to make a deployment pass.
- Never bypass Merkle total/proof verification.
- Never use a test token helper on Mainnet.
- Never continue after a red CI/readiness result.

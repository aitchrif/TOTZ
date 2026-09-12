# TOTZ FORGE — Final Post-Canary Review Packet

Date: 2026-09-12

This packet is for the final focused reviewer pass before any PUBLIC Robinhood Chain Mainnet claim-launch unlock. It is evidence only. It does not authorize or enable public Mainnet writes.

## Current production baseline

- Repository: `aitchrif/TOTZ`
- Current `main`: `1738082cae697170144ca435e0d2604a9b977111`
- Vercel production deployment: `dpl_9KCPQj5JQBouos8trQbY5MExhoJY` — READY
- Public runtime is still fail-closed for NEW Mainnet launches:
  - `environment = mainnet`
  - `claimNetwork.chainId = 4663`
  - `mainnetClaimsEnabled = false`
  - claims service = `forge-claims-gateway`
  - gasless relay = empty/unreachable
- Server release gate remains:
  - `mainnet_claims_enabled = false`
  - `mainnet_release_mode = locked`
  - Canary expiry cleared
- Public `/forge` and `/forge/epochs` return HTTP 200 with CSP, HSTS, `X-Frame-Options: DENY`, and `X-Content-Type-Options: nosniff`.

## Backend/runtime evidence

- Supabase project: `yymwpnztjlyfxongwmsw`
- `forge-claims`: v21 ACTIVE
- `forge-claims` SHA-256: `29cd1cc9615d2855b4d638205b2e8897b86d8db4a95ea590027536b3ddb7d207`
- `forge-claims-gateway`: v1 ACTIVE
- `forge-claims-gateway` SHA-256: `a9c461325dc99acb43b4a253c678a3c8bba603497dc70cf6bdcfe3b13fcc5df9`
- Production release policy supports `locked | canary | public`; current effective state is `locked`.

## Pre-Canary reviewer blockers now closed

### Runtime attestation test quality

PR #80 changed the mutation suite to execute the production verifier implementation directly from `supabase/functions/forge-claims/index.ts` rather than a test-local verifier.

- PR #80 exact reviewed head: `3b329769373f2beff731f4ab79456110996fa487`
- Merged to main as: `c777438abca3f9587b5c1fcabe4e5bd8644fde07`
- `FORGE Production Integration`: PASS

### Real two-session database race

A production-equivalent PostgreSQL two-session upload-vs-finalize race test was added using the exact checked-in FORGE migrations.

Observed assertions:
- upload-first path serialized correctly;
- finalize-first path failed closed;
- retry path published successfully;
- post-publication entry writes were rejected.

- `FORGE Two-Session DB Race`: PASS

## Limited Mainnet Canary result

Canary was operated with one trusted sponsor, one eligible wallet, a 0.01 USDG committed allocation cap, and Mainnet writes re-locked immediately after publication.

- Claim slug: `totz-mtxoisbf-ed9b9c`
- Claim contract: `0x6a8e354f6df0948c6c8fc35f6b068f3f54fa9345`
- Chain ID: `4663`
- Reward token: USDG `0x5fc5360d0400a0fd4f2af552add042d716f1d168`
- Reward decimals: `6`
- Eligible wallets: `1`
- Total allocation: `10000` base units = `0.01 USDG`
- Merkle root: `0xf5a24453272031c46a526c461711fd07fb2f1d78c8fe7fc0851f9c1eef3dd7f2`
- Distribution fingerprint: `0x3745d915e3511ad82da41ffc63761e4d5de597256298e063b1ff9332aa3c4a76`
- Snapshot block: `60694259`
- Snapshot completeness: `true`
- Snapshot source: `multicall-ownerof`
- Publication completed successfully and the public claim page verified the on-chain contract as solvent.
- After publication, the server gate was immediately restored to `locked`.

## Recovery path result

The eligible holder did not claim before the immutable deadline. The sponsor then executed `recoverUnclaimed()` through the public claim page.

- Recovery transaction: `0xaf8da70794ec0b487cbb8a65f8b0bbd9c7a63f429d24a0562596f51737e578cc`
- Transfer observed: exactly `0.01 USDG` from claim contract to sponsor `0xf3e2e7362f38daf68662ff9f963a20bd9602011f`
- Claim-contract USDG balance after recovery: `0`
- Active Mainnet epoch count after expiry/recovery: `0`
- UI reports epoch CLOSED / SETTLED and unclaimed funds returned to sponsor.

The database row remains labeled `published`; an attempted cosmetic status mutation while the Mainnet gate was locked was correctly rejected by the release-gate trigger. No gate was reopened just to change that label. The row is not counted as an active Mainnet epoch after expiry.

## Production baseline sync

PR #81 was merged only to force Vercel to deploy the current reviewed baseline after PR #80 while keeping NEW Mainnet launch writes locked.

- PR #81 merge commit: `1738082cae697170144ca435e0d2604a9b977111`
- Production deployment: `dpl_9KCPQj5JQBouos8trQbY5MExhoJY`
- Served runtime verified locked and pointed to `forge-claims-gateway`.

## Requested reviewer decision

Please review the focused evidence above and answer one question:

> Are there any remaining security/correctness blockers to a deliberate PUBLIC Mainnet release, assuming the release change only enables the reviewed client gate and the server is explicitly switched from `locked` to `public` after the exact production revision is verified?

If approving, please state that the post-Canary focused review is complete and that there are no unresolved blockers for the planned public Mainnet release.

## Proposed release sequence after approval

1. Keep server `mainnet_claims_enabled=false` / mode `locked` while preparing the release PR.
2. Make a minimal reviewed client release change from `mainnetClaimsEnabled=false` to `true`; do not reuse/merge Canary-only PR #79.
3. Merge only the approved release commit and wait for the exact Vercel production deployment to become READY.
4. Verify the exact served revision, runtime config, CSP/security headers, `forge-claims-gateway`, and empty gasless relay.
5. With no active Mainnet epochs, set server policy to `mainnet_release_mode=public` and `mainnet_claims_enabled=true` in one guarded operation.
6. Immediately re-check `route=status`, public launcher state, and fail-closed invariants before announcement.
7. Record the activation evidence in GitHub issue #77.

Until the focused reviewer explicitly approves, public Mainnet launch remains NOT approved and both client/server release gates should remain locked.
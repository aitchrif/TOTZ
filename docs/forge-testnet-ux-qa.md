# TOTZ FORGE Production Holder UX QA

Scope: Robinhood Testnet and read-only/public claim UX. Mainnet launch writes stay locked.

## Automated gates

- Gas estimate is shown before the Claim action.
- Native gas balance is compared with the estimated claim fee.
- Actual wallet chain ID is verified before claim/recovery signing.
- Pending wallet UI states warn against duplicate resubmission.
- Reloaded pages reconcile `claimed(address)` from chain and keep already-claimed wallets fail-closed.
- Narrow screens retain viewport scaling, two-column stats, and full-width action buttons.
- Wallet-signed Testnet E2E estimates gas before signing, simulates the claim, confirms the real claim, recreates a fresh read contract to prove reload reconciliation, rejects a duplicate claim, rejects a non-eligible claim, and rehearses post-deadline recovery.

## Live read-only Testnet observation

A current published Testnet epoch was used to verify that a valid Merkle claim is estimable by the Robinhood Testnet RPC. A sampled eligible, unclaimed wallet returned a non-zero gas estimate while holding zero native ETH, which is exactly the low-balance condition the hardened holder page is designed to surface before signing.

No holder private key or Mainnet write was used for this read-only check.

## Pass criteria before public holder rollout

1. Protected PR checks pass.
2. Mainnet readiness remains green and locked.
3. Vercel preview/build is READY under deployment protection.
4. The dedicated wallet-signed Testnet workflow is rerun after these changes and passes with its Testnet-only operator key.
5. Gasless sponsorship remains a separate V2 Testnet experiment; V1 and completed Mainnet Pilot contracts remain immutable.

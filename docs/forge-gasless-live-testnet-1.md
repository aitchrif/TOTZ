# TOTZ FORGE Gasless V2 — Live Testnet Canary 1

Date: 2026-09-07

## Scope

This record captures the first successful live Robinhood Chain Testnet ERC-4337 + Alchemy Gas Manager claim rehearsal for `ForgeMerkleClaimV2`. It is historical evidence only; it does not unlock any Mainnet release gate.

## Verified live result

- Chain: Robinhood Chain Testnet (`46630`)
- EntryPoint v0.8: `0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108`
- V2 claim contract: `0xF83b2f392f0f5D5E1fa72f2C18Ba9Ef2F07358aE`
- Test reward token: `0xe8fFF26Ec90208D6cC2323aB6c95D84F39558cA8`
- Zero-gas holder: `0x7Dc1D9f493310cfb4D462D742DBdeE9897c63700`
- Test ERC-4337 account: `0x2BFE9B72de0983AEc9DEb2F9a6AF0ffdb92594f6`
- Paymaster: `0x000000000804FF442BE7d200445362c46A008ADd`
- UserOperation hash: `0x3f639fd23f8830618a1dd6e52b3975523f5bf9654fbd3bc9020ecb25e5d32015`
- EntryPoint transaction: `0x99fd122a77e55a354ae0db15a340a4146fa30aea60436717c59a2854e6ebe458`
- Reward received: `1` unit (`0.01 tUSDG`)
- Holder native balance before/after: `0 / 0`
- Smart-account native balance before/after: `0 / 0`
- EntryPoint account nonce: `0 -> 1`
- Final `claimCount`: `1`
- Final claim-contract reward balance: `0`

The mined EntryPoint transaction emitted the V2 claim events and transferred the exact reward allocation to the Merkle-eligible holder. The holder and test account remained unfunded in native ETH.

## Security conclusions carried into hardening

1. The reward destination remains the Merkle-eligible `account`; a relayer cannot redirect it.
2. The holder authorizes `account`, exact `amount`, authorization `nonce`, and a short authorization deadline through EIP-712.
3. The V2 authorization nonce prevents replay after a successful claim.
4. Gas sponsorship must have its own server-side release gate, rate limit, idempotency record, and on-chain reconciliation.
5. A direct `claim()` path remains available as an explicit fallback. The UI must never silently convert a failed sponsored attempt into a gas-paying transaction.
6. Mainnet gasless execution is a separate release decision and remains disabled until the existing Mainnet release process is public and a dedicated Mainnet relayer/paymaster configuration has passed its own canary.

## Production-hardening state

The hardened relay is deliberately fail-closed. Its database gates default to:

- `gasless_testnet_enabled = false`
- `gasless_mainnet_enabled = false`

The server requires environment-bound Alchemy/bundler credentials and an attested ERC-4337 smart-account owner before it can report `configured=true`. Mainnet additionally requires the existing master Mainnet claim flag and `mainnet_release_mode=public`.

No private key, Alchemy API key, or Gas Manager policy ID is committed to this repository.

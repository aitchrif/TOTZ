# TOTZ FORGE — Gasless V2 Testnet PoC

Status: **Testnet-only proof of concept. Not approved for Mainnet deployment or funding.**

## Goal

Allow an eligible FORGE holder to authorize a claim without requiring the relayer to become the reward recipient.
The holder signs an EIP-712 `ClaimAuthorization`; any relayer may submit `claimFor`, but the contract always transfers the reward to the Merkle-eligible `account` contained in both the signed authorization and the immutable Merkle root.

## V2 authorization

EIP-712 domain:

- name: `TOTZ FORGE Claim`
- version: `2`
- chain ID: runtime chain ID
- verifying contract: the deployed `ForgeMerkleClaimV2` address

Signed struct:

`ClaimAuthorization(address account,uint256 amount,uint256 nonce,uint256 authorizationDeadline)`

The signature does **not** authorize an arbitrary recipient. `claimFor` has no recipient parameter.

## Security properties required before any live experiment

1. Rewards can only be transferred to the Merkle-eligible holder account.
2. A relayer cannot redirect rewards to itself or another wallet.
3. Every successful claim consumes the holder authorization nonce.
4. Exact replay of a consumed authorization is rejected.
5. EIP-712 domain separation prevents the same signature from being replayed against a different claim contract or chain.
6. Expired authorizations and incorrect nonces are rejected.
7. A failed proof or failed signature cannot consume the holder nonce or mutate claim accounting.
8. Direct V1-style claims remain available; a successful direct claim advances the holder nonce to invalidate previously signed relay authorizations.
9. Existing V1 claim contracts and completed Mainnet pilots remain immutable and untouched.
10. Mainnet launch controls remain locked while this PoC is evaluated.

## Test gate

`tests/forge-claim-v2.test.cjs` compiles the V2 contract with the pinned toolchain and exercises the authorization path locally on chain ID `46630` without broadcasting any transaction to Robinhood Testnet or Mainnet.

`tests/forge-gasless-v2-static.mjs` adds a fail-closed source-level gate for recipient integrity, nonce consumption, V1 immutability, and Mainnet lockdown.

The dedicated workflow `.github/workflows/forge-gasless-v2-poc.yml` also fails if the V1 claim contract or Mainnet launch runtime config is changed by the PoC branch.

## Sponsorship boundary

An isolated Alchemy Gas Manager policy exists for Robinhood Testnet feasibility work, but this PoC does not request paymaster data, submit UserOperations, or spend sponsored gas. No Mainnet Gas Manager policy is part of this work.

A later live Testnet phase must be separately reviewed before any sponsored operation is sent.

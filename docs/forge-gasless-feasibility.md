# TOTZ FORGE Gasless Claim Feasibility

Status: design/feasibility only. No Mainnet sponsorship policy, relayer, or contract migration is enabled by this document.

## What Pilot #3 exposed

The Mainnet Pilot proved the current Merkle claim path end to end, but holder-paid gas can exceed a small reward. FORGE now surfaces a live gas estimate before signing; gasless claims are a separate protocol change, not a UI toggle.

## Why V1 cannot safely become gasless by only adding a relayer

`ForgeMerkleClaim` authenticates eligibility through the Merkle proof for the caller. A normal relayer would become `msg.sender`, so it cannot claim an allocation whose leaf belongs to the holder EOA. Moving the holder into a different smart-account address has the same address-binding problem for an existing Merkle tree.

Therefore the V1 contract and already-published epochs remain immutable and unchanged.

## Preferred V2 shape: signed claim-for

A future `ForgeMerkleClaimV2` can preserve the eligible holder address while allowing a sponsor/relayer to submit the transaction:

1. Merkle leaf remains `(holder, amount)`.
2. Holder signs an EIP-712 authorization containing at minimum the claim contract, chain ID, holder, amount, nonce/deadline, and intended recipient.
3. `claimFor(holder, amount, proof, authorization, signature)` verifies both the Merkle proof and the holder signature.
4. Reward is transferred only to the authorized recipient (normally the holder), never to the relayer.
5. Claimed state is keyed by the holder, preserving one-claim semantics.
6. A relayer or sponsored-account system pays native gas.

This makes front-running economically harmless if a copied signed request can only deliver the reward to the holder-selected recipient. Nonce/deadline/domain separation prevent replay across claims, contracts, or chains.

## Alternative: EIP-7702 / account abstraction

If Robinhood Chain and the target wallet stack support EIP-7702 account delegation with a production-grade paymaster, sponsorship may preserve the holder's EOA address and avoid a new eligibility address. This must be proven on Robinhood Testnet with the exact wallet/bundler/paymaster stack before it is considered for FORGE.

Do not assume generic ERC-4337 smart-account migration is compatible with a V1 EOA-bound Merkle leaf: the smart-account address can differ from the eligible EOA.

## Required Testnet gate before any Mainnet consideration

A gasless V2 must pass a dedicated Testnet pilot that proves:

- correct EIP-712 domain separation and signature recovery;
- wrong chain, wrong contract, wrong holder, wrong amount, expired authorization, and replay all revert;
- relayer cannot redirect rewards;
- copied/front-run authorization still pays the holder-selected recipient;
- double claim is impossible even through different relayers;
- sponsor policy has a strict per-operation and total budget cap;
- only the approved claim contract/method is sponsored;
- sponsorship can be disabled independently from published claim continuity;
- holder can still use the normal self-paid path if sponsorship is unavailable;
- all Mainnet launch gates remain locked throughout the Testnet pilot.

## Current decision

Keep V1 in production-hardening mode with transparent gas estimates. Build gasless claims only as an isolated V2 Testnet proof-of-concept. Do not retrofit or redeploy the completed Pilot #3 contract, and do not create a Mainnet Gas Manager policy during feasibility work.

# ForgeMerkleClaim deployed-runtime reconstruction

This document records the evidence recovered for the legacy `ForgeMerkleClaim` artifact used by TOTZ FORGE.

## What is proven

With the checked-in candidate source, pinned `solc` 0.8.24, optimizer enabled at 200 runs, Shanghai EVM target, and OpenZeppelin 5.0.2:

- the public ABI surface matches the legacy artifact;
- the deployed runtime bytecode length matches (2951 bytes);
- all 19 immutable byte positions and lengths match;
- after zeroing immutable values and removing compiler metadata, the deployed executable runtime matches byte-for-byte;
- the normalized deployed runtime core hash is:
  `0xb90f55deac3bb7b4cc6743afb563abd27ac21e0df0ff02d7ce6ae289bb9b7e36`.

The CI verifier fails if any of those deployed-runtime properties drift.

## What is not proven

The historical constructor/init bytecode is not an exact reconstruction, and compiler metadata/full artifact identity is not byte-for-byte identical.

Therefore this repository must **not** claim that the candidate Solidity file is the exact historical deployment source for the legacy artifact.

The source is retained as a deployed-runtime reconstruction and review aid only.

## Release consequence

This evidence is useful for reviewing contracts that are already deployed because deployed behavior is governed by runtime bytecode. It is **not** sufficient provenance for deploying new Mainnet claim contracts from the legacy artifact.

For future Mainnet launches, use a fresh source-controlled contract build whose source, compiler inputs, artifact and CI output are reproducible from the repository and receive a separate security review before enabling launch writes.

Robinhood Chain Mainnet deploy/fund/publish controls remain locked by this PR.

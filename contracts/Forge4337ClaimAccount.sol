// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

struct ForgePackedUserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    bytes32 accountGasLimits;
    uint256 preVerificationGas;
    bytes32 gasFees;
    bytes paymasterAndData;
    bytes signature;
}

/// @title TOTZ FORGE ERC-4337 Claim Account
/// @notice Minimal, non-upgradeable service account dedicated to sponsored FORGE claimFor calls.
/// @dev The account intentionally cannot move native value or execute arbitrary selectors.
///      A dedicated owner key signs ERC-4337 UserOperations; the configured EntryPoint is immutable.
contract Forge4337ClaimAccount {
    using MessageHashUtils for bytes32;

    bytes4 public constant CLAIM_FOR_SELECTOR = bytes4(
        keccak256("claimFor(address,uint256,bytes32[],uint256,uint256,bytes)")
    );

    address public immutable owner;
    address public immutable entryPoint;

    error OnlyEntryPointOrOwner();
    error OnlyEntryPoint();
    error ExecutionFailed(bytes data);
    error ZeroAddress();
    error NonZeroValue();
    error InvalidTarget();
    error InvalidCallSelector();

    constructor(address owner_, address entryPoint_) {
        if (owner_ == address(0) || entryPoint_ == address(0)) revert ZeroAddress();
        owner = owner_;
        entryPoint = entryPoint_;
    }

    /// @notice Execute only the FORGE V2 claimFor selector with zero native value.
    /// @dev This keeps a compromised service account from becoming a generic sponsored executor.
    function execute(address target, uint256 value, bytes calldata data) external returns (bytes memory result) {
        if (msg.sender != entryPoint && msg.sender != owner) revert OnlyEntryPointOrOwner();
        if (value != 0) revert NonZeroValue();
        if (target == address(0) || target.code.length == 0) revert InvalidTarget();
        if (data.length < 4 || bytes4(data[:4]) != CLAIM_FOR_SELECTOR) revert InvalidCallSelector();

        (bool ok, bytes memory returned) = target.call(data);
        if (!ok) revert ExecutionFailed(returned);
        return returned;
    }

    /// @notice ERC-4337 account validation for EntryPoint v0.8 packed UserOperations.
    /// @dev Missing account funds are rejected: production use must be paymaster-sponsored rather than
    ///      silently spending native ETH from this service account.
    function validateUserOp(
        ForgePackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external view returns (uint256 validationData) {
        if (msg.sender != entryPoint) revert OnlyEntryPoint();
        if (userOp.sender != address(this) || missingAccountFunds != 0) return 1;

        bytes32 digest = userOpHash.toEthSignedMessageHash();
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, userOp.signature);
        if (err != ECDSA.RecoverError.NoError || recovered != owner) return 1;
        return 0;
    }
}

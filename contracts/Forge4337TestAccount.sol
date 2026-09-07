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

/// @title FORGE 4337 Test Account
/// @notice Isolated Robinhood Testnet-only account used for gas sponsorship canaries.
/// @dev Not production wallet code. No upgradeability and no Mainnet deployment path.
contract Forge4337TestAccount {
    using MessageHashUtils for bytes32;

    address public immutable owner;
    address public immutable entryPoint;

    error OnlyEntryPointOrOwner();
    error OnlyEntryPoint();
    error ExecutionFailed(bytes data);
    error ZeroAddress();

    constructor(address owner_, address entryPoint_) {
        if (owner_ == address(0) || entryPoint_ == address(0)) revert ZeroAddress();
        owner = owner_;
        entryPoint = entryPoint_;
    }

    receive() external payable {}

    function execute(address target, uint256 value, bytes calldata data) external returns (bytes memory result) {
        if (msg.sender != entryPoint && msg.sender != owner) revert OnlyEntryPointOrOwner();
        (bool ok, bytes memory returned) = target.call{value: value}(data);
        if (!ok) revert ExecutionFailed(returned);
        return returned;
    }

    function validateUserOp(
        ForgePackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData) {
        if (msg.sender != entryPoint) revert OnlyEntryPoint();
        if (userOp.sender != address(this)) return 1;

        bytes32 digest = userOpHash.toEthSignedMessageHash();
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, userOp.signature);
        if (err != ECDSA.RecoverError.NoError || recovered != owner) return 1;

        if (missingAccountFunds != 0) {
            (bool sent,) = payable(msg.sender).call{value: missingAccountFunds}("");
            sent;
        }
        return 0;
    }
}

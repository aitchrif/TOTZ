// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @notice Immutable ERC-20 Merkle distributor used by TOTZ FORGE claim epochs.
/// @dev Leaf encoding must match FORGE: keccak256(bytes.concat(keccak256(abi.encode(account, amount)))).
contract ForgeMerkleClaim {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error InvalidToken();
    error InvalidRoot();
    error InvalidAllocation();
    error InvalidDeadline();
    error ClaimClosed();
    error AlreadyClaimed();
    error InvalidAmount();
    error AllocationExceeded();
    error InvalidProof();
    error OnlySponsor();
    error ClaimStillOpen();

    IERC20 public immutable token;
    bytes32 public immutable merkleRoot;
    uint256 public immutable totalAllocated;
    uint64 public immutable deadline;
    address public immutable sponsor;

    uint256 public totalClaimed;
    uint256 public claimCount;
    mapping(address => bool) public claimed;

    event Claimed(address indexed account, uint256 amount);
    event UnclaimedRecovered(address indexed sponsor, uint256 amount);

    constructor(
        IERC20 token_,
        bytes32 merkleRoot_,
        uint256 totalAllocated_,
        uint64 deadline_,
        address sponsor_
    ) {
        if (address(token_) == address(0) || sponsor_ == address(0)) revert ZeroAddress();
        if (address(token_).code.length == 0) revert InvalidToken();
        if (merkleRoot_ == bytes32(0)) revert InvalidRoot();
        if (totalAllocated_ == 0) revert InvalidAllocation();
        if (deadline_ <= block.timestamp) revert InvalidDeadline();

        token = token_;
        merkleRoot = merkleRoot_;
        totalAllocated = totalAllocated_;
        deadline = deadline_;
        sponsor = sponsor_;
    }

    function claim(uint256 amount, bytes32[] calldata proof) external {
        if (block.timestamp > deadline) revert ClaimClosed();
        if (claimed[msg.sender]) revert AlreadyClaimed();
        if (amount == 0) revert InvalidAmount();
        if (amount > totalAllocated - totalClaimed) revert AllocationExceeded();

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender, amount))));
        if (!MerkleProof.verifyCalldata(proof, merkleRoot, leaf)) revert InvalidProof();

        claimed[msg.sender] = true;
        totalClaimed += amount;
        claimCount += 1;

        token.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    function recoverUnclaimed() external {
        if (msg.sender != sponsor) revert OnlySponsor();
        if (block.timestamp <= deadline) revert ClaimStillOpen();

        uint256 balance = token.balanceOf(address(this));
        if (balance != 0) token.safeTransfer(sponsor, balance);
        emit UnclaimedRecovered(sponsor, balance);
    }

    function contractBalance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    function isFullyFunded() external view returns (bool) {
        uint256 required = totalClaimed >= totalAllocated ? 0 : totalAllocated - totalClaimed;
        return token.balanceOf(address(this)) >= required;
    }
}

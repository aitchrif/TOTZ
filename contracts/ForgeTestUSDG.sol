// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title ForgeTestUSDG
/// @notice Testnet-only fixed-supply ERC-20 used to exercise TOTZ FORGE claim flows.
/// @dev No owner, no admin, no mint function. The entire supply is minted once to the deployer.
contract ForgeTestUSDG is ERC20 {
    uint256 public constant INITIAL_SUPPLY = 100_000 * 1e6;

    constructor() ERC20("TOTZ Test USDG", "tUSDG") {
        _mint(msg.sender, INITIAL_SUPPLY);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

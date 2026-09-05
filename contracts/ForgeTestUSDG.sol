// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title ForgeTestUSDG
/// @notice Testnet-only fixed-supply ERC-20 used to exercise TOTZ FORGE claim flows.
/// @dev No owner, no admin, no mint function. The entire supply is minted once to the deployer.
///      Decimals are chosen at deployment so the test token can exactly match the EPOCHS package.
contract ForgeTestUSDG is ERC20 {
    uint8 private immutable _forgeDecimals;
    uint256 public immutable INITIAL_SUPPLY;

    constructor(uint8 decimals_) ERC20("TOTZ Test USDG", "tUSDG") {
        require(decimals_ <= 18, "Decimals too high");
        _forgeDecimals = decimals_;
        uint256 supply = 100_000 * (10 ** uint256(decimals_));
        INITIAL_SUPPLY = supply;
        _mint(msg.sender, supply);
    }

    function decimals() public view override returns (uint8) {
        return _forgeDecimals;
    }
}

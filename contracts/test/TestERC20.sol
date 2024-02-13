// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../tokens/ERC20Purgatory.sol";

contract TestERC20 is ERC20Purgatory {
    constructor (address purgatoryContract_) ERC20Purgatory("PurgatoryTest", "PT", purgatoryContract_) {}

    function mint(uint256 amount, address owner) public {
        _mint(owner, amount);
    }
}

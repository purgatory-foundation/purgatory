// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "../tokens/ERC20Purgatory.sol";

contract TestERC20Burnable is ERC20Purgatory, ERC20Burnable {
    constructor (address purgatoryContract_) ERC20Purgatory("PurgatoryTest", "PT", purgatoryContract_) {}

    function mint(uint256 amount, address owner) public {
        _mint(owner, amount);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20Purgatory, ERC20) virtual {
        super._beforeTokenTransfer(from, to, amount);
    }

    function approve(address spender, uint256 amount) public virtual override(ERC20Purgatory, ERC20) returns (bool) {
        return super.approve(spender, amount);
    }

    function increaseAllowance(address spender, uint256 addedValue) public virtual override(ERC20Purgatory, ERC20) returns (bool) {
        return super.increaseAllowance(spender, addedValue);
    }

    function decreaseAllowance(address spender, uint256 subtractedValue) public virtual override(ERC20Purgatory, ERC20) returns (bool) {
        return super.decreaseAllowance(spender, subtractedValue);
    }

    function allowance(address owner, address spender) public view virtual override(ERC20Purgatory, ERC20) returns (uint256) {
        return super.allowance(owner, spender);
    }
}

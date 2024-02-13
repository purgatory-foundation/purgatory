// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../interfaces/IPurgatory.sol";
import "../interfaces/IPurgatoryCollection.sol";

contract ERC20Purgatory is ERC20, IPurgatoryCollection, Ownable {
    constructor(string memory name, string memory symbol, address purgatoryContract_) ERC20(name, symbol) {
        deployer = msg.sender;

        purgatoryAddress = purgatoryContract_;
        purgatory = IPurgatory(purgatoryContract_);
    }
    
    IPurgatory purgatory;
    address public purgatoryAddress;
    address deployer;
    bool purgatoryContractLocked;

    /**
     * @dev override _beforeTokenTransfer to apply Purgatory security checks for all token transfers
     * refer to Purgatory implementation for specifics on how mint/burn/transfers are assessed
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        // Throw error if invalid transfer within purgatory time
        // msg.sender == operator
        purgatory.validateTransfer(from, msg.sender, to);
        super._beforeTokenTransfer(from, to, amount);
    }

    /**
     * @dev override approve to apply Purgatory approval checks for all instances where approvals
     * and token allowances are updated. If amount is > 0, considered an approval and if amount is
     * 0, it is considered a revoked approval. If an approval is set and still in Purgatory state,
     * the approval must be first revoked if the user wishes to set a different amount without
     * completing the Purgatory state
     */
    function approve(address spender, uint256 amount) public virtual override returns (bool) {
        bool approved = false;
        if (amount > 0)
            approved = true;

        // If there is an existing allowance already allocated and approved via Purgatory
        // and there is a new amount being set > 0, then we must first revoke the initial
        // approval and approve the new amount individually in order to avoid AlreadyApproved issues
        if (approved && allowance(msg.sender, spender) > 0) {
            purgatory.validateApproval(msg.sender, spender, false);
            return super.approve(spender, amount);
        }
        
        purgatory.validateApproval(msg.sender, spender, approved);
        return super.approve(spender, amount);
    }

    /**
     * @dev override increaseAllowance which is not supported by Purgatory due to issues with overriding
     * the allowance function which depends on Purgatory state for the value returned
     */
    function increaseAllowance(address spender, uint256 addedValue) public virtual override returns (bool) {
        revert FunctionNotSupported();
    }

    /**
     * @dev override decreaseAllowance which is not supported by Purgatory due to issues with overriding
     * the allowance function which depends on Purgatory state for the value returned
     */
    function decreaseAllowance(address spender, uint256 subtractedValue) public virtual override returns (bool) {
        revert FunctionNotSupported();
    }

    /**
     * @dev override allowance to return allowance as 0 if the Purgatory state has not been successfully completed
     */
    function allowance(address owner, address spender) public view virtual override returns (uint256) {
        return purgatory.isApproved(owner, spender) ? super.allowance(owner, spender) : 0;
    }

    /**
     * @dev owner function is required as part of the collection enrollment process within Purgatory as
     * enrollment is restricted to only contract owners. Ownable can be dropped if not necessary in favor
     * of a custom owner function if desired
     */
    function owner() public view override(Ownable, IPurgatoryCollection) returns (address) {
        return super.owner();
    }

    /**
     * @inheritdoc IPurgatoryCollection
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IPurgatoryCollection).interfaceId;
    }

    /**
     * @inheritdoc IPurgatoryCollection
     */
    function setPurgatoryAddress(address purgatoryAddress_) public {
        if (msg.sender != deployer) revert Unauthorized();
        if (purgatoryContractLocked) revert ContractLocked();

        purgatoryAddress = purgatoryAddress_;
        purgatory = IPurgatory(purgatoryAddress_);
    }

    /**
     * @inheritdoc IPurgatoryCollection
     */
    function lockPurgatoryContract() public {
        if (msg.sender != deployer) revert Unauthorized();
        purgatoryContractLocked = true;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "../interfaces/IPurgatory.sol";
import "../interfaces/IPurgatoryCollection.sol";

contract ERC1155Purgatory is ERC1155, IPurgatoryCollection, Ownable {
    constructor (string memory uri_, address purgatoryContract_) ERC1155(uri_) {
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
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal virtual override {
        // Throw error if invalid transfer within purgatory time
        purgatory.validateTransfer(from, operator, to);
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);
    }

    /**
     * @dev override setApprovalForAll to perform checks and updating approval mappings with
     * approval statuses
     */
    function setApprovalForAll(address operator, bool approved) public virtual override {
        purgatory.validateApproval(msg.sender, operator, approved);
        super.setApprovalForAll(operator, approved);
    }

    /**
     * @dev override isApprovedForAll to ensure griefing/scamming cannot take place with marketplaces
     * allowing listings when not actually approved which could artifically manipulate floor prices with
     * non-transferrable tokens
     */
    function isApprovedForAll(address account, address operator) public view virtual override returns (bool) {
        return purgatory.isApproved(account, operator) && super.isApprovedForAll(account, operator);
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
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC1155, IPurgatoryCollection) returns (bool) {
        return interfaceId == type(IPurgatoryCollection).interfaceId || super.supportsInterface(interfaceId);
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

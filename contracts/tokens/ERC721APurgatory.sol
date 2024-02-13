// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "erc721a/contracts/ERC721A.sol";
import "../interfaces/IPurgatory.sol";
import "../interfaces/IPurgatoryCollection.sol";

contract ERC721APurgatory is ERC721A, IPurgatoryCollection, Ownable {
    constructor (string memory name_, string memory symbol_, address purgatoryContract_)
        ERC721A(name_, symbol_) {
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
    function _beforeTokenTransfers(
        address from,
        address to,
        uint256 startTokenId,
        uint256 quantity
    ) internal virtual override {
        // Throw error if invalid transfer within purgatory time
        // msg.sender == operator
        purgatory.validateTransfer(from, msg.sender, to);
        super._beforeTokenTransfers(from, to, startTokenId, quantity);
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
     * @dev override approve to perform checks and updating approval mappings with
     * approval statuses. The specific tokenId is not relevant in this flow as we
     * only care about the generic approval.
     */
    function approve(address to, uint256 tokenId) public payable virtual override {
        bool approved = true;

        // If current approval is being revoked, pass in relevant info to Purgatory
        // in order to revoke the existing approval. Approved operator is taken
        // from super call as opposed to overridden Purgatory version to allow
        // revoke during Purgatory state
        if (to == address(0)) {
            to = super.getApproved(tokenId);
            approved = false;
        }

        purgatory.validateApproval(msg.sender, to, approved);
        super.approve(to, tokenId);
    }

    /**
     * @dev override isApprovedForAll to only return approved status if the operator is approved and has
     * completed the Purgatory state. This also ensures griefing/scamming cannot take place with marketplaces
     * allowing listings when not actually approved which could artifically manipulate floor prices with
     * non-transferrable tokens
     */
    function isApprovedForAll(address account, address operator) public view virtual override returns (bool) {
        return purgatory.isApproved(account, operator) && super.isApprovedForAll(account, operator);
    }

    /**
     * @dev override getApproved to only return approved address if the operator is approved and has
     * completed the Purgatory state. This also ensures griefing/scamming cannot take place with marketplaces
     * allowing listings when not actually approved which could artifically manipulate floor prices with
     * non-transferrable tokens
     */
    function getApproved(uint256 tokenId) public view virtual override returns (address) {
        address approvedAddress = super.getApproved(tokenId);
        if (approvedAddress == address(0)) return approvedAddress; 

        address tokenOwner = ownerOf(tokenId);

        return purgatory.isApproved(tokenOwner, approvedAddress) ? approvedAddress : address(0);
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
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721A, IPurgatoryCollection) returns (bool) {
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

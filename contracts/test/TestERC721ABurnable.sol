// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "erc721a/contracts/extensions/ERC721ABurnable.sol";
import "../tokens/ERC721APurgatory.sol";

contract TestERC721ABurnable is ERC721APurgatory, ERC721ABurnable {
    constructor (address purgatoryContract_) ERC721APurgatory("PurgatoryTest", "PT", purgatoryContract_) {}

    function mint(uint256 amount, address owner) public {
        _safeMint(owner, amount);
    }

    function airdropToken(uint256[] calldata amount, address[] calldata owners) public onlyOwner {
        for(uint256 i = 0; i < owners.length; ++i) {            
            _safeMint(owners[i], amount[i]);
        }
    }

    function _startTokenId() internal view override returns (uint256) {
        return 1;
    }

     function _beforeTokenTransfers(
        address from,
        address to,
        uint256 startTokenId,
        uint256 quantity
    ) internal override(ERC721APurgatory, ERC721A) virtual {
        super._beforeTokenTransfers(from, to, startTokenId, quantity);
    }

    function setApprovalForAll(address operator, bool approved) public override(ERC721APurgatory, ERC721A, IERC721A) {
        super.setApprovalForAll(operator, approved);
    }

    function approve(address to, uint256 tokenId) public payable virtual override(ERC721APurgatory, ERC721A, IERC721A) {
        super.approve(to, tokenId);
    }

    function getApproved(uint256 tokenId) public view virtual override(ERC721APurgatory, ERC721A, IERC721A) returns (address) {
        return super.getApproved(tokenId);
    }

    function isApprovedForAll(address account, address operator) public view virtual override(ERC721APurgatory, ERC721A, IERC721A) returns (bool) {
        return super.isApprovedForAll(account, operator);
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721A, ERC721APurgatory, IERC721A) returns (bool) {
        return interfaceId == type(IPurgatoryCollection).interfaceId || super.supportsInterface(interfaceId);
    }
}

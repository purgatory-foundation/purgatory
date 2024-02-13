// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../tokens/ERC1155Purgatory.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";

contract TestERC1155Burnable is ERC1155Purgatory, ERC1155Burnable {
    constructor(address purgatoryContract_) ERC1155Purgatory("", purgatoryContract_) {}

    bool contractLocked;
    mapping (uint256 => string) public tokenURIs;

    function mint(uint256[] calldata amount, uint256[] calldata tokenIds, address[] calldata receiver) public {
        require(!contractLocked, "Contract is locked");
        for(uint256 i = 0; i < receiver.length; i++) {
            _mint(receiver[i], tokenIds[i], amount[i], "");
        }
    }

    function lockContract() public onlyOwner {
        contractLocked = true;
    }

    function uri(uint256 tokenId) public view virtual override returns (string memory) {
        return tokenURIs[tokenId];
    }

    function setTokenURIs(uint256[] calldata tokenIds, string[] calldata uris) public onlyOwner {
        require(!contractLocked, "Contract is locked");
        require(tokenIds.length == uris.length, "Length mismatch");

        for (uint256 i = 0; i < tokenIds.length; i++) {
            tokenURIs[tokenIds[i]] = uris[i];
        }
    }

    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal override(ERC1155Purgatory, ERC1155) virtual {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);
    }

    function setApprovalForAll(address operator, bool approved) public override(ERC1155Purgatory, ERC1155) {
        super.setApprovalForAll(operator, approved);
    }

    function isApprovedForAll(address account, address operator) public view virtual override(ERC1155Purgatory, ERC1155) returns (bool) {
        return super.isApprovedForAll(account, operator);
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC1155, ERC1155Purgatory) returns (bool) {
        return interfaceId == type(IPurgatoryCollection).interfaceId || super.supportsInterface(interfaceId);
    }
}

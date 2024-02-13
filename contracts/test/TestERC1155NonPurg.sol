// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TestERC1155NonPurg is ERC1155, Ownable {
    constructor() ERC1155("") {}

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
}

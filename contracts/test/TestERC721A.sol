// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../tokens/ERC721APurgatory.sol";

contract TestERC721A is ERC721APurgatory {
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
}

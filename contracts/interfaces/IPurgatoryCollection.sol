// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IPurgatoryCollection {
    /// @notice Error thrown if the ERC function overridden is not supported by Purgatory
    error FunctionNotSupported();

    /// @notice Error thrown when the Purgatory settings have been permanently locked and cannot be updated
    error ContractLocked();

    /// @notice Error thrown when a caller does not have access to the function called
    error Unauthorized();

    /**
     * @notice Returns collection contract owner address used to verify ownership before enrollment
     */
    function owner() external view returns (address);

    /**
     * @notice Checks if a contract enrolled in Purgatory is implementing the IPurgatoryCollection interface
     * @param interfaceID interface ID to be implemented
     * @return bool whether contract supports the supplied interfaceID
     */
    function supportsInterface(bytes4 interfaceID) external view returns (bool);

    /**
     * @notice Updates Purgatory contract address and accompanying purgatory interface
     * @dev lockPurgatoryContract() will permanently lock this function and ability to update Purgatory address
     * @param purgatoryAddress_ new address for Purgatory contract
     */
    function setPurgatoryAddress(address purgatoryAddress_) external;

    /**
     * @notice locks the ability to update the Purgatory contract address
     * @dev should be called if no issues arise from Purgatory contract for extended period of time
     */
    function lockPurgatoryContract() external;
} 

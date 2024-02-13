// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../interfaces/IBlast.sol";
import "../interfaces/IPurgatory.sol";
import "../interfaces/IPurgatoryCollection.sol";

/**
 ___                          _                    
(  _ \                       ( )_                  
| |_) )_   _ _ __   __    _ _|  _)  _   _ __ _   _ 
|  __/( ) ( )  __)/ _  \/ _  ) |  / _ \(  __) ) ( )
| |   | (_) | |  ( (_) | (_| | |_( (_) ) |  | (_) |
(_)    \___/(_)   \__  |\__ _)\__)\___/(_)   \__  |
                 ( )_) |                    ( )_| |
                  \___/                      \___/ 
 * @title Purgatory Self Deploy
 * @notice Standalone security smart contract standard with ERC721/1155 support to protect against common scams.
 * @dev NFT smart contract creators can leverage ERC721APurgatory / ERC1155Purgatory smart contracts which utilize
 * Purgatory's standalone smart contract to provide additional security features to collectors of their NFTs.
 * @custom:coauthor maximonee (@maximonee_) - smart contract & tech design
 * @custom:coauthor Aure (@aurealarcon) - frontend & design
 * @custom:coauthor Samuel Cardillo (@CardilloSamuel) - all around
 */
contract PurgatorySelfDeploy is IPurgatory {
    constructor () {
        authorizedAdmins[msg.sender] = true;
        BLAST.configureClaimableGas();
    }

    /// @notice Blast constract for gas revenue sharing
    IBlast public constant BLAST = IBlast(0x4300000000000000000000000000000000000002);

    /// @notice To be activated if a breaking bug is present and Purgatory needs to be disabled
    bool public emergencyShutdownActive;

    /// @notice To be set to true once confidence in Purgatory operating properly is determined which disables admin functionality
    bool public adminFunctionPermanentlyDisabled;

    /// @notice Purgatory time period for all requests that enter the Purgatory state
    uint32 public purgatoryTime = 24 hours;

    /// @notice A mapping storing operator approval requests (for setApprovalForAll()/approve())
    /// @dev collection address => (holder address => (operator address => Approval))
    mapping (address => mapping (address => mapping (address => Approval))) public approvals;

    /// @notice A mapping storing transfer recipient approval requests for manual transfers
    /// @dev collection address => (holder address => (recipient address => Approval))
    mapping (address => mapping (address => mapping (address => Approval))) public approvedRecipients;

    /// @notice A mapping storing global transfer recipient approval requests for all collections for a given holder
    /// @dev holder address => (recipient address => Approval)
    mapping (address => mapping (address => Approval)) public approvedGlobalRecipients;

    /// @notice A mapping storing 2FA wallet approval records AKA second factor authentication
    /// @dev holder address => (2FA wallet address => TwoFactorWalletApproval)
    mapping (address => mapping (address => TwoFactorWalletApproval)) public twoFactorWalletApprovals;

    /// @notice A mapping storing opt status for a given user
    /// @dev holder address => OptStatus
    /// @dev optStatusLastUpdated of 0 indicates the user is opted out as opt-out is default
    mapping (address => OptStatus) public optStatus;

    /// @notice A mapping storing enrolled collections into the Purgatory system
    /// @dev collection address => enrollment status
    mapping (address => bool) public enrolledCollections;

    /// @notice A mapping storing authorized admins
    /// @dev admin address => authorized status
    mapping (address => bool) public authorizedAdmins;

    /** 
     * @dev Modifier to ensure caller is authorized admin
     */
    modifier isAuthorizedAdmin() {
        if (!authorizedAdmins[msg.sender]) revert Unauthorized(); 
        _;
    }

    /**
     ***************************
     * Approval request setters
     ***************************
     */

    /**
     * @inheritdoc IPurgatory
     */
    function setTwoFactorWalletApprover(address approver, bool approved, bool canEnableLockDown, bool isApprovedRecipient) external {
        if (msg.sender == approver) revert TwoFactorApproverSetToSelf();

        TwoFactorWalletApproval memory currentApproval = twoFactorWalletApprovals[msg.sender][approver];
        if (currentApproval.approved == approved) revert ApprovalAlreadySetToSameStatus();

        uint64 time = _getApprovalTime(currentApproval.lastUpdated, currentApproval.approved);

        // If approved, update the entire approval record. If not, only update the approved status & time to ensure
        // that history for other fields is maintained for Purgatory state reference when deactivating

        bool haveAttributesChanged;
        if (currentApproval.canEnableLockDown != canEnableLockDown || currentApproval.isApprovedRecipient != isApprovedRecipient)
            haveAttributesChanged = true;

        // If the request is not approved, or the 2FA attributes have changed and the purgatory time is marked
        // as complete (meaning the request was already previously approved for this wallet), do not update the
        // attributes as the attribute changes should go through Purgatory state via wallet revocal and re-approval
        if (!approved || (haveAttributesChanged && _isPurgatoryTimeCompleted(time))) {
            twoFactorWalletApprovals[msg.sender][approver].approved = approved;
            twoFactorWalletApprovals[msg.sender][approver].lastUpdated = time;
        } else {
            twoFactorWalletApprovals[msg.sender][approver] = TwoFactorWalletApproval(approved, canEnableLockDown, isApprovedRecipient, time);
        }

        emit NewTwoFactorWalletApproverRequest(msg.sender, approver, approved, canEnableLockDown, isApprovedRecipient);
    }

    /**
     * @inheritdoc IPurgatory
     */
    function setApprovedRecipient(address collection, address recipient, bool approved) external {
        if(!enrolledCollections[collection]) revert Unauthorized();
        Approval memory currentApproval = approvedRecipients[collection][msg.sender][recipient];
        if (currentApproval.approved == approved) revert ApprovalAlreadySetToSameStatus();

        uint64 time = _getApprovalTime(currentApproval.lastUpdated, currentApproval.approved);
        approvedRecipients[collection][msg.sender][recipient] = Approval(approved, time);

        emit NewTransferRecipientRequest(collection, msg.sender, recipient, approved);
    }

    /**
     * @inheritdoc IPurgatory
     */
    function setApprovedGlobalRecipient(address recipient, bool approved) external {
        Approval memory currentApproval = approvedGlobalRecipients[msg.sender][recipient];
        if (currentApproval.approved == approved) revert ApprovalAlreadySetToSameStatus();

        uint64 time = _getApprovalTime(currentApproval.lastUpdated, currentApproval.approved);
        approvedGlobalRecipients[msg.sender][recipient] = Approval(approved, time);

        emit NewGlobalTransferRecipientRequest(msg.sender, recipient, approved);
    }

    /**
     ********************************
     * Opt/Config Setters
     ********************************
     */

    /**
     * @inheritdoc IPurgatory
     */
    function setOptStatus(bool optedIn, uint32 shortLivedApprovalLength) external {
        OptStatus memory userOptStatus = optStatus[msg.sender];
        if (userOptStatus.optedIn == optedIn) revert ApprovalAlreadySetToSameStatus();

        uint64 time = uint64(block.timestamp);

        optStatus[msg.sender].optedIn = optedIn;
        optStatus[msg.sender].optStatusLastUpdated = time;

        if (userOptStatus.shortLivedApprovalLength != shortLivedApprovalLength) {
            optStatus[msg.sender].shortLivedApprovalLength = shortLivedApprovalLength;
            optStatus[msg.sender].shortLivedApprovalLastUpdated = time;
        }

        emit OptStatusSet(msg.sender, optedIn, shortLivedApprovalLength);
    }

    /**
     * @inheritdoc IPurgatory
     */
    function setShortLivedApprovalLength(uint32 shortLivedApprovalLength) external {
        uint32 currentShortLivedApprovalLength = optStatus[msg.sender].shortLivedApprovalLength;
        if (currentShortLivedApprovalLength == shortLivedApprovalLength) revert ApprovalAlreadySetToSameStatus();

        optStatus[msg.sender].shortLivedApprovalLength = shortLivedApprovalLength;
        optStatus[msg.sender].shortLivedApprovalLastUpdated = uint64(block.timestamp);

        emit ShortLivedApprovalLengthSet(msg.sender, shortLivedApprovalLength);
    }

    /**
     * @inheritdoc IPurgatory
     */
    function toggleLockDownMode() external {
        OptStatus memory userOptStatus = optStatus[msg.sender];

        optStatus[msg.sender].lockDownActive = !userOptStatus.lockDownActive;
        optStatus[msg.sender].lockDownLastUpdated = uint64(block.timestamp);

        emit LockDownStatusSet(msg.sender, optStatus[msg.sender].lockDownActive);
    }

    /**
     * @inheritdoc IPurgatory
     */
    function enableLockDownModeFromTwoFactorWalletApprover(address holder) external {
        if (!twoFactorWalletApprovals[holder][msg.sender].canEnableLockDown || !_isTwoFactorWalletApproved(holder, msg.sender)) revert Unauthorized();
        if (optStatus[holder].lockDownActive) revert ApprovalAlreadySetToSameStatus();

        optStatus[holder].lockDownActive = true;
        optStatus[holder].lockDownLastUpdated = uint64(block.timestamp);

        emit LockDownStatusSet(holder, true);
    }

    /**
     * @inheritdoc IPurgatory
     */
    function refreshApproval(address collection, address operator) external {
        if (!_isOperatorApprovalApprovedOrExpired(collection, msg.sender, operator)) revert RequestNotFullyCompleted();

        Approval memory currentApproval = approvals[collection][msg.sender][operator];
        OptStatus memory userOptStatus = optStatus[msg.sender];
        if (!_isShortLivedApprovalEnabled(userOptStatus)) revert ShortLivedApprovalsNotConfigured();

        uint32 shortLivedApprovalLength = _getShortLivedApprovalLength(userOptStatus);
        if (_isShortLivedApprovalValid(currentApproval.lastUpdated, shortLivedApprovalLength)) revert OperatorApprovalNotExpired();

        // As operator has already been approved, reset lastUpdated time to current timestamp minus purgatory time
        approvals[collection][msg.sender][operator].lastUpdated = uint64(block.timestamp - (purgatoryTime + 1));

        emit OperatorApprovalRefreshed(collection, msg.sender, operator, shortLivedApprovalLength);
    }

    /**
     ********************************
     * 2FA wallet Approval setters
     ********************************
     */

    /**
     * @inheritdoc IPurgatory
     */
    function setApprovalForOperatorApproval(address holder, address operator, address collection, bool approved) external {
        if (!_isTwoFactorWalletApproved(holder, msg.sender)) revert Unauthorized();

        Approval memory currentApproval = approvals[collection][holder][operator];
        if (currentApproval.lastUpdated == 0) revert RequestNotFound();

        // If Purgatory state is already complete, don't allow for approvals to be set
        if (_isPurgatoryTimeCompleted(currentApproval.lastUpdated)) revert RequestAlreadyCompleted();

        if (approved) {
            uint64 time = uint64(block.timestamp - (purgatoryTime + 1));
            approvals[collection][holder][operator] = Approval(approved, time);
        } else {
            delete approvals[collection][holder][operator];
        }

        emit OperatorApprovalSet(collection, holder, msg.sender, operator, approved);
    }

    /**
     * @inheritdoc IPurgatory
     */
    function setApprovalForTransferRecipient(address holder, address recipient, address collection, bool approved) external {
        if (!_isTwoFactorWalletApproved(holder, msg.sender)) revert Unauthorized();

        Approval memory currentApproval = approvedRecipients[collection][holder][recipient];
        if (currentApproval.lastUpdated == 0) revert RequestNotFound();

        // If Purgatory state is already complete, don't allow for approvals to be set
        if (_isPurgatoryTimeCompleted(currentApproval.lastUpdated)) revert RequestAlreadyCompleted();

        if (approved) {
            uint64 time = uint64(block.timestamp - (purgatoryTime + 1));
            approvedRecipients[collection][holder][recipient] = Approval(approved, time);
        } else {
            delete approvedRecipients[collection][holder][recipient];
        }

        emit TransferRecipientApprovalSet(collection, holder, msg.sender, recipient, approved);
    }

    /**
     * @inheritdoc IPurgatory
     */
    function setApprovalForGlobalTransferRecipient(address holder, address recipient, bool approved) external {
        if (!_isTwoFactorWalletApproved(holder, msg.sender)) revert Unauthorized();

        Approval memory currentApproval = approvedGlobalRecipients[holder][recipient];
        if (currentApproval.lastUpdated == 0) revert RequestNotFound();

        // If Purgatory state is already complete, don't allow for approvals to be set
        if (_isPurgatoryTimeCompleted(currentApproval.lastUpdated)) revert RequestAlreadyCompleted();

        if (approved) {
            uint64 time = uint64(block.timestamp - (purgatoryTime + 1));
            approvedGlobalRecipients[holder][recipient] = Approval(approved, time);
        } else {
            delete approvedGlobalRecipients[holder][recipient];
        }

        emit GlobalTransferRecipientApprovalSet(holder, msg.sender, recipient, approved);
    }

    /**
     * @inheritdoc IPurgatory
     */
    function setApprovalForDeactivatingLockDown(address holder) external {
        if (!_isTwoFactorWalletApproved(holder, msg.sender)) revert Unauthorized();

        OptStatus memory userOptStatus = optStatus[holder];

        // Approval is only needed when speeding up deactivation of lockdown mode
        if (userOptStatus.lockDownLastUpdated == 0 || userOptStatus.lockDownActive) revert RequestNotFound();
        if (_isPurgatoryTimeCompleted(userOptStatus.lockDownLastUpdated)) revert RequestAlreadyCompleted();

        optStatus[holder].lockDownLastUpdated = uint64(block.timestamp - (purgatoryTime + 1));
    }

    /**
     ***********************************
     * ERC721/1155/20 integrated functions
     ***********************************
     */

    /**
     * @inheritdoc IPurgatory
     */
    function validateTransfer(address from, address operator, address recipient) public view {
        // Skip processing if user is opted out and has passed the purgatory period for the opt out
        // or emergency shutdown is active or the collection is not enrolled. In this case msg.sender
        // is the collection
        OptStatus memory userOptStatus = optStatus[from];
        if (_isOptedOut(userOptStatus) || emergencyShutdownActive || !enrolledCollections[msg.sender]) return;

        if (_isLockedDown(userOptStatus)) revert LockDownModeEnabled();

        // Allow burns to happen without Purgatory intervention
        // However, if account is in lockdown mode, burns should not be allowed
        if (recipient == address(0)) return;

        // If the operator is also the from (indicating owner is transferring), require valid transfer recipient
        // If not, the require valid operator approval. If from == null address, allow transfer (mints)
        if (from != address(0)) {
            if (operator == from && !_isTransferRecipientApproved(msg.sender, from, recipient)) revert UnauthorizedTransferRecipient();
            if (operator != from && !_isOperatorApprovalApproved(msg.sender, from, operator)) revert UnauthorizedOperatorApproval();
        }
    }

    /**
     * @inheritdoc IPurgatory
     */
    function validateApproval(address from, address operator, bool approved) public {
        // Skip processing if user is opted out and has passed the purgatory period for the opt out
        // or emergency shutdown is active or the collection is not enrolled. In this case msg.sender
        // is the collection
        OptStatus memory userOptStatus = optStatus[from];
        if (_isOptedOut(userOptStatus) || emergencyShutdownActive || !enrolledCollections[msg.sender]) return;

        if (_isLockedDown(userOptStatus)) revert LockDownModeEnabled();

        Approval memory currentApproval = approvals[msg.sender][from][operator];
        bool shortLivedApprovalExpired = (
            _isShortLivedApprovalEnabled(userOptStatus) && 
            !_isShortLivedApprovalValid(currentApproval.lastUpdated, _getShortLivedApprovalLength(userOptStatus))
        );

        if (!approved) {
            delete approvals[msg.sender][from][operator];
        } else {
            // Allow both currently not approved operators as well as short-lived approvals
            // that have been expired to be approved, otherwise throw AlreadyApproved error
            if (!currentApproval.approved || shortLivedApprovalExpired) {
                approvals[msg.sender][from][operator] = Approval(true, uint64(block.timestamp));
            } else {
                revert AlreadyApproved();
            }
        }

        emit NewOperatorApprovalRequest(msg.sender, from, operator, approved);
    }

    /**
     * @inheritdoc IPurgatory
     */
    function isApproved(address from, address operator) public view returns (bool) {
        // In this case msg.sender is the collection
        return _isApproved(from, operator, msg.sender);
    }

    /**
     *********************
     * Internal functions
     *********************
     */

    /**
     * @dev Helper function to determine whether a user is opted out
     */
    function _isOptedOut(OptStatus memory userOptStatus) internal view returns (bool) {
        // If optStatusLastUpdated returns 0, the user is opted out as default option is opt-out
        if (userOptStatus.optStatusLastUpdated == 0) return true;

        // // if optedIn is not set and the purgatory is not complete (but last updated is NOT 0)
        // // then the status was recently revoked but has not completed the purgatory time.
        // // In order to prevent abuse of deactivating opt in mode via a compromised wallet
        // // or phished transaction, we should ensure even deactivations go through purgatory time
        if (!userOptStatus.optedIn && !_isPurgatoryTimeCompleted(userOptStatus.optStatusLastUpdated)) return false;

        // Do not require opting in to go through Purgatory time
        return !userOptStatus.optedIn;
    }

    /**
     * @dev Helper function to determine whether a user wallet is locked down
     */
    function _isLockedDown(OptStatus memory userOptStatus) internal view returns (bool) {
        // If lockDownLastUpdated returns 0, the user is opted out as default option is opt-out
        if (userOptStatus.lockDownLastUpdated == 0) return false;

        // if lockDown is not set and the purgatory is not complete (but last updated is NOT 0)
        // then the status was recently revoked but has not completed the purgatory time.
        // In order to prevent abuse of deactivating lock down mode via a compromised wallet
        // or phished transaction, we should ensure even deactivations go through purgatory time
        if (!userOptStatus.lockDownActive && !_isPurgatoryTimeCompleted(userOptStatus.lockDownLastUpdated)) return true;

        // Do not require activating lockdown mode to go through Purgatory time
        return userOptStatus.lockDownActive;
    }

    /**
     * @dev Helper function to determine if Purgatory time is completed
     */
    function _isPurgatoryTimeCompleted(uint256 approvedTime) internal view returns (bool) {
        // If there is no approvedTime, that means there is no record indicating no
        // purgatory time has been completed.
        if (approvedTime == 0) return false;

        return block.timestamp - approvedTime >= purgatoryTime;
    }

    /**
     * @dev Helper function to determine if a short-lived approval is still valid
     */
    function _isShortLivedApprovalValid(uint256 approvedTime, uint32 shortLivedApprovalLength) internal view returns (bool) {
        // If there is no approvedTime, that means there is no record indicating no
        // short lived approval has been set.
        if (approvedTime == 0) return false;

        // Check that current timestamp minus the approved time is less than
        // the approval length plus the purgatory time. Addition of purgatoryTime
        // is done as the system will essentially start the approval timer after
        // purgatory time is complete
        return block.timestamp - approvedTime <= shortLivedApprovalLength + purgatoryTime;
    }

    /**
     * @dev Helper function to determine if short-lived approvals are enabled for a user
     */
    function _isShortLivedApprovalEnabled(OptStatus memory userOptStatus) internal view returns (bool) {
        // As feature is opt-out by default, a zero for lastUpdated can be considered opted-out
        if (userOptStatus.shortLivedApprovalLastUpdated == 0) return false;

        // If Purgatory state is completed and length is zero, this means the feature was recently revoked
        // and should be considered enabled
        if (userOptStatus.shortLivedApprovalLength == 0 && _isPurgatoryTimeCompleted(userOptStatus.shortLivedApprovalLastUpdated)) return false;

        // Feature is only disabled if shortLivedApprovalLastUpdated is 0 or purgatoryTimeCompleted is true
        // and shortLivedApprovalLength is 0
        return true;
    }

    /** 
     * @dev Helper function to get the short-lived approval length of a user depending on their current opt status. If the
     * user has opted out but is still within Purgatory time, we will return the purgatoryTime value as their remaining time
     * which will allow the approval to remain active until the user's opt-out Purgatory state is complete
     */
    function _getShortLivedApprovalLength(OptStatus memory userOptStatus) internal view returns (uint32) {
        if (!_isShortLivedApprovalEnabled(userOptStatus)) return 0;

        // If Purgatory state is not complete, we should use Purgatory time as a safety approval length as we do not have
        // access to what the last entry was. Without this, changing shortLivedApprovalLength could result in short-lived
        // approvals being deactivated or using a very large time bypassing the intent of the system in case of wallet compromise
        if (!_isPurgatoryTimeCompleted(userOptStatus.shortLivedApprovalLastUpdated)) return purgatoryTime;

        return userOptStatus.shortLivedApprovalLength != 0 ? userOptStatus.shortLivedApprovalLength : purgatoryTime;
    }

    /**
     * @dev Helper function to determine if a transfer recipient is fully approved and usable
     */
    function _isTransferRecipientApproved(address collection, address holder, address recipient) internal view returns (bool) {
        // If the recipient is an authorized 2FA wallet approver AND is configured
        //  as an approved recipient, transfer is valid
        if (_isTwoFactorWalletApproved(holder, recipient) && twoFactorWalletApprovals[holder][recipient].isApprovedRecipient) return true;

        Approval memory collectionApprovalStatus = approvedRecipients[collection][holder][recipient];
        Approval memory globalApprovalStatus = approvedGlobalRecipients[holder][recipient];

        if (collectionApprovalStatus.lastUpdated == 0 && globalApprovalStatus.lastUpdated == 0) return false;

        if (
            (collectionApprovalStatus.approved && _isPurgatoryTimeCompleted(collectionApprovalStatus.lastUpdated)) || 
            (globalApprovalStatus.approved && _isPurgatoryTimeCompleted(globalApprovalStatus.lastUpdated))
        ) {
            return true;
        }

        // if the approval is not set and the purgatory is not complete (but ledger is NOT 0)
        // then the approval was recently revoked but has not completed the purgatory time.
        // In order to prevent abuse of revoking secondary approvers via a compromised wallet
        // or phished transaction, we should ensure even revoked approvals go through purgatory time
        if (
            (!collectionApprovalStatus.approved && !_isPurgatoryTimeCompleted(collectionApprovalStatus.lastUpdated)) && 
            (!globalApprovalStatus.approved && !_isPurgatoryTimeCompleted(globalApprovalStatus.lastUpdated))
        ) {
            return true;
        }

        return false;
    }

    /**
     * @dev Helper function to determine if an operator approval is fully approved and usable
     */
    function _isOperatorApprovalApproved(address collection, address holder, address operator) internal view returns (bool) {
        Approval memory currentApproval = approvals[collection][holder][operator];

        if (currentApproval.lastUpdated == 0) return false;

        // If the approval is marked as approved and purgatory time is complete
        // Determine if the requestor has opted into short-lived approvals. If not
        // simply mark as approved/true. If so, assess whether the approval is still valid
        if (currentApproval.approved && _isPurgatoryTimeCompleted(currentApproval.lastUpdated)) {
            OptStatus memory userOptStatus = optStatus[holder];
            if (_isShortLivedApprovalEnabled(userOptStatus)) {
                return _isShortLivedApprovalValid(currentApproval.lastUpdated, _getShortLivedApprovalLength(userOptStatus));
            }

            return true;
        }

        return false;
    }

    /**
     * @dev Helper function to determine if an operator approval is currently valid or at one point was (i.e. expired)
     * To be used with refreshing approvals to determine if the approval was once valid at any point in time to 
     * determine whether a refresh should be allowed
     */
    function _isOperatorApprovalApprovedOrExpired(address collection, address holder, address operator) internal view returns (bool) {
        Approval memory currentApproval = approvals[collection][holder][operator];

        if (currentApproval.lastUpdated == 0) return false;

        // If the approval is marked as approved and purgatory time is complete
        // Determine if the requestor has opted into short-lived approvals. If not
        // simply mark as approved/true. If so, assess whether the approval is still valid
        if (currentApproval.approved && _isPurgatoryTimeCompleted(currentApproval.lastUpdated)) return true;

        return false;
    }

    /**
     * @dev Helper function to determine if a 2FA wallet is approved and usable
     */
    function _isTwoFactorWalletApproved(address holder, address approver) internal view returns (bool) {
        TwoFactorWalletApproval memory currentApproval = twoFactorWalletApprovals[holder][approver];

        if (currentApproval.lastUpdated == 0) return false;

        if (currentApproval.approved && _isPurgatoryTimeCompleted(currentApproval.lastUpdated)) return true;

        // if the approval is not set and the purgatory is not complete (but lastUpdated is NOT 0)
        // then the approval was recently revoked but has not completed the purgatory time.
        // In order to prevent abuse of revoking secondary approvers via a compromised wallet
        // or phished transaction, we should ensure even revoked approvals go through purgatory time
        if (!currentApproval.approved && !_isPurgatoryTimeCompleted(currentApproval.lastUpdated)) return true;

        return false;
    }

    /**
     * @dev Helper function to calculate the approval time to be set depending on the current state
     * of the approval. The time set depends on approval status to determine the timestamp to set
     * lastUpdated to for the approval to ensure Purgatory states are respected where relevant
     *
     * TODO: This logic is fairly fragile - brainstorm if there's a better way to allow for recently
     * revoked to still have authorization for Purgatory state
     */
    function _getApprovalTime(uint64 lastUpdated, bool approved) internal view returns (uint64) {
        // If the below conditions are not met, that means time should be set to 0 in order to allow
        // and protect against a case where we want to allow recently unapproved recipients still
        // within purgatory time to pass
        uint64 time;
        if (lastUpdated == 0 ||_isPurgatoryTimeCompleted(lastUpdated)) {
            time = uint64(block.timestamp);
        // If purgatory time is within Purgatory state and approved is false, this means an already approved
        // request was recently revoked. In this case, approval should be reinstated by setting time accordingly
        } else if (!_isPurgatoryTimeCompleted(lastUpdated) && !approved) {
            time = lastUpdated - (purgatoryTime + 1);
        }

        return time;
    }

    /**
     * @dev Helper function to determine if a token approval is valid and passes the Purgatory security checks
     */
    function _isApproved(address from, address operator, address collection) internal view returns (bool) {
        // Skip processing if user is opted out and has passed the purgatory period for the opt out
        // or emergency shutdown is active or the collection is not enrolled
        OptStatus memory userOptStatus = optStatus[from];
        if (_isOptedOut(userOptStatus) || emergencyShutdownActive || !enrolledCollections[collection]) return true;

        // If locked down, do not show the approval as valid to avoid griefing issues
        // on marketplace listings
        if (_isLockedDown(userOptStatus)) return false;

        return _isOperatorApprovalApproved(collection, from, operator);
    }

    /**
     * @dev Helper function to determine if an enrolled collection is properly implementing the Purgatory enrollment interface
     */
    function _supportsPurgatory(address collection) public view returns (bool) {
        IPurgatoryCollection purgatoryCollection = IPurgatoryCollection(collection);
        return purgatoryCollection.supportsInterface(type(IPurgatoryCollection).interfaceId);
    }

    /**
     **********************************************************
     * External view functions to be used by other systems/UIs
     **********************************************************
     */

    /**
     * @inheritdoc IPurgatory
     */
    function isOptedOut(address holder) external view returns (bool) {
        OptStatus memory userOptStatus = optStatus[holder];
        return _isOptedOut(userOptStatus);
    }

    /**
     * @inheritdoc IPurgatory
     */
    function isLockedDown(address holder) external view returns (bool) {
        OptStatus memory userOptStatus = optStatus[holder];
        return _isLockedDown(userOptStatus);
    }

    /**
     * @inheritdoc IPurgatory
     */
    function isShortLivedApprovalEnabled(address addr) external view returns (bool) {
        OptStatus memory userOptStatus = optStatus[addr];
        // As feature is opt-out by default, a zero for lastUpdated can be considered opted-out
        return _isShortLivedApprovalEnabled(userOptStatus);
    }

    /**
     * @inheritdoc IPurgatory
     */
    function operatorApprovalStatus(address collection, address holder, address operator) external view returns (RequestStatus memory) {
        Approval memory currentApproval = approvals[collection][holder][operator];
        bool approved = _isOperatorApprovalApproved(collection, holder, operator);

        if (approved) return RequestStatus(0, ApprovalStatus.Approved);
        if (currentApproval.lastUpdated == 0) return RequestStatus(0, ApprovalStatus.NoApproval);

        // Check if approval exists but short-lived approvals are enabled and approval has expired
        OptStatus memory userOptStatus = optStatus[holder];
        if (_isShortLivedApprovalEnabled(userOptStatus) && !_isShortLivedApprovalValid(currentApproval.lastUpdated, _getShortLivedApprovalLength(userOptStatus))) {
            return RequestStatus(0, ApprovalStatus.Expired);
        }

        uint256 remainingTime = purgatoryTime - (block.timestamp - currentApproval.lastUpdated);
        return RequestStatus(remainingTime, ApprovalStatus.InPurgatory);
    }

    /**
     * @inheritdoc IPurgatory
     */
    function transferRecipientApprovalStatus(address collection, address holder, address recipient) external view returns (RequestStatus memory) {
        Approval memory collectionApprovalStatus = approvedRecipients[collection][holder][recipient];
        Approval memory globalApprovalStatus = approvedGlobalRecipients[holder][recipient];
        TwoFactorWalletApproval memory twoFactorApprovalStatus = twoFactorWalletApprovals[holder][recipient];

        bool recipientApproved = _isTransferRecipientApproved(collection, holder, recipient);
        if (recipientApproved && (collectionApprovalStatus.approved || globalApprovalStatus.approved)) return RequestStatus(0, ApprovalStatus.Approved);

        bool twoFactorApproved = _isTwoFactorWalletApproved(holder, recipient);
        if (twoFactorApproved && twoFactorApprovalStatus.isApprovedRecipient && twoFactorApprovalStatus.approved) return RequestStatus(0, ApprovalStatus.Approved);

        if (collectionApprovalStatus.lastUpdated == 0 && globalApprovalStatus.lastUpdated == 0 && !twoFactorApprovalStatus.isApprovedRecipient)
            return RequestStatus(0, ApprovalStatus.NoApproval);

        uint256 approvedRecipientLastUpdated = collectionApprovalStatus.lastUpdated != 0 ? collectionApprovalStatus.lastUpdated : globalApprovalStatus.lastUpdated;
        uint256 twoFactorRecipientLastUpdated = twoFactorApprovalStatus.lastUpdated;

        // Check if request has been unapproved/revoked past the Purgatory time
        // indicating request is now fully revoked
        if ((block.timestamp - approvedRecipientLastUpdated >= purgatoryTime) && (block.timestamp - twoFactorRecipientLastUpdated >= purgatoryTime))
            return RequestStatus(0, ApprovalStatus.NoApproval);

        uint256 remainingTime;
        if (approvedRecipientLastUpdated != 0 && twoFactorRecipientLastUpdated == 0) {
            remainingTime = purgatoryTime - (block.timestamp - approvedRecipientLastUpdated);
        } else {
            remainingTime = purgatoryTime - (block.timestamp - twoFactorRecipientLastUpdated);
        }

        // If in revoke purgatory state for two-factor wallet approved recipients,
        // return approved state with remaining time until revoke is complete
        if (twoFactorApproved && twoFactorApprovalStatus.isApprovedRecipient && !twoFactorApprovalStatus.approved)
            return RequestStatus(remainingTime, ApprovalStatus.Approved);

        // If in revoke purgatory state for global or collection approved recipients,
        // return approved state with remaining time until revoke is complete
        if (recipientApproved && (!collectionApprovalStatus.approved && !globalApprovalStatus.approved))
            return RequestStatus(remainingTime, ApprovalStatus.Approved);

        return RequestStatus(remainingTime, ApprovalStatus.InPurgatory);
    }

    /**
     * @inheritdoc IPurgatory
     */
    function twoFactorWalletApprovalStatus(address holder, address approver) external view returns (RequestStatus memory) {
        TwoFactorWalletApproval memory currentApproval = twoFactorWalletApprovals[holder][approver];
        bool approved = _isTwoFactorWalletApproved(holder, approver);
        if (approved && currentApproval.approved) return RequestStatus(0, ApprovalStatus.Approved);

        if (currentApproval.lastUpdated == 0) return RequestStatus(0, ApprovalStatus.NoApproval);

        // Check if request has been unapproved/revoked past the Purgatory time
        // indicating request is now fully revoked
        if (block.timestamp - currentApproval.lastUpdated >= purgatoryTime) return RequestStatus(0, ApprovalStatus.NoApproval);

        uint256 remainingTime = purgatoryTime - (block.timestamp - currentApproval.lastUpdated);

        // If in revoke purgatory state, return approved state with remaining time until revoke is complete
        if (approved && !currentApproval.approved) return RequestStatus(remainingTime, ApprovalStatus.Approved);

        return RequestStatus(remainingTime, ApprovalStatus.InPurgatory);        
    }

    /**
     * @inheritdoc IPurgatory
     */
    function lockDownStatus(address holder) external view returns (RequestStatus memory) {
        OptStatus memory userOptStatus = optStatus[holder];
        bool lockedDown = _isLockedDown(userOptStatus);

        if (lockedDown && userOptStatus.lockDownActive) return RequestStatus(0, ApprovalStatus.Approved);
        if (userOptStatus.lockDownLastUpdated == 0) return RequestStatus(0, ApprovalStatus.NoApproval);

        // Check if request has been unapproved/revoked past the Purgatory time
        // indicating request is now fully revoked
        if (block.timestamp - userOptStatus.lockDownLastUpdated >= purgatoryTime) return RequestStatus(0, ApprovalStatus.NoApproval);

        uint256 remainingTime = purgatoryTime - (block.timestamp - userOptStatus.lockDownLastUpdated);

        // Even while "in purgatory", lock down remains active so we keep the Approved ApprovalStatus
        return RequestStatus(remainingTime, ApprovalStatus.Approved);
    }

    /**
     * @inheritdoc IPurgatory
     */
    function optInStatus(address holder) external view returns (RequestStatus memory) {
        OptStatus memory userOptStatus = optStatus[holder];
        bool optedIn = !_isOptedOut(userOptStatus);

        if (optedIn && userOptStatus.optedIn) return RequestStatus(0, ApprovalStatus.Approved);
        if (userOptStatus.optStatusLastUpdated == 0) return RequestStatus(0, ApprovalStatus.NoApproval);

        // Check if request has been unapproved/revoked past the Purgatory time
        // indicating request is now fully revoked
        if (block.timestamp - userOptStatus.optStatusLastUpdated >= purgatoryTime) return RequestStatus(0, ApprovalStatus.NoApproval);

        uint256 remainingTime = purgatoryTime - (block.timestamp - userOptStatus.optStatusLastUpdated);

        // Even while "in purgatory", opt in remains active so we keep the Approved ApprovalStatus
        return RequestStatus(remainingTime, ApprovalStatus.Approved);        
    }

    /**
     * @inheritdoc IPurgatory
     */
    function shortLivedApprovalStatus(address holder) external view returns (RequestStatus memory) {
        OptStatus memory userOptStatus = optStatus[holder];
        bool shortLivedApprovalsEnabled = _isShortLivedApprovalEnabled(userOptStatus);
        if (shortLivedApprovalsEnabled && userOptStatus.shortLivedApprovalLength != 0) {
            // If Purgatory time is not complete and approval length was changed
            // return remaining time until new approval length goes into effect
            uint256 remaining;
            if (!_isPurgatoryTimeCompleted(userOptStatus.shortLivedApprovalLastUpdated) ) {
                remaining = purgatoryTime - (block.timestamp - userOptStatus.shortLivedApprovalLastUpdated);
            }
            return RequestStatus(remaining, ApprovalStatus.Approved);
        }

        if (userOptStatus.shortLivedApprovalLastUpdated == 0) return RequestStatus(0, ApprovalStatus.NoApproval);

        // Check if request has been unapproved/revoked past the Purgatory time
        // indicating request is now fully revoked
        if (block.timestamp - userOptStatus.shortLivedApprovalLastUpdated >= purgatoryTime)
            return RequestStatus(0, ApprovalStatus.NoApproval);

        uint256 remainingTime = purgatoryTime - (block.timestamp - userOptStatus.shortLivedApprovalLastUpdated);

        // Even while "in purgatory", opt in remains active so we keep the Approved ApprovalStatus
        return RequestStatus(remainingTime, ApprovalStatus.Approved);
    }

    /**
     * @inheritdoc IPurgatory
     */
    function getRemainingOperatorApprovalTime(address collection, address holder, address operator) external view returns (uint256) {
        Approval memory currentApproval = approvals[collection][holder][operator];
        OptStatus memory userOptStatus = optStatus[holder];

        if (!_isShortLivedApprovalEnabled(userOptStatus)) revert ShortLivedApprovalsNotConfigured();

        if (currentApproval.approved && _isPurgatoryTimeCompleted(currentApproval.lastUpdated)) {
            if ((block.timestamp - currentApproval.lastUpdated) <= (_getShortLivedApprovalLength(userOptStatus) + purgatoryTime)) {
                return (_getShortLivedApprovalLength(userOptStatus) + purgatoryTime) - (block.timestamp - currentApproval.lastUpdated);
            }
        }

        return 0;
    }

    /**
     * @inheritdoc IPurgatory
     */
    function isApproved(address from, address operator, address collection) external view returns (bool) {
        return _isApproved(from, operator, collection);
    }

    /**
     ****************************
     * Temporary admin functions
     ****************************
     */

    /**
     * @notice Admin function to pause/shutdown the Purgatory system has been added
     * in the case a breaking bug arises and the system needs to be shutdown in order
     * to prevent projects leveraging this system also having breaking issues
     * @dev If after a period of time using the system there are no issues identified, this
     * admin function should be permanently disabled via disableAdminFunctionPermanently
     */
    function toggleEmergencyShutdown() external isAuthorizedAdmin {
        if (adminFunctionPermanentlyDisabled) revert AdminFunctionsPermanentlyDisabled();

        emergencyShutdownActive = !emergencyShutdownActive;

        emit EmergencyShutdownSet(emergencyShutdownActive);
    }

    /**
     * @dev If after a period of time using the system there are no issues identified, this
     * function should be called to permanently disable admin functionality
     */
    function disableAdminFunctionPermanently() external isAuthorizedAdmin {
        adminFunctionPermanentlyDisabled = true;
    }

    /**
     * @notice Admin function to update the purgatory time period
     */
    function setPurgatoryTime(uint32 purgatoryTime_) external isAuthorizedAdmin {
        if (adminFunctionPermanentlyDisabled) revert AdminFunctionsPermanentlyDisabled();

        purgatoryTime = purgatoryTime_;

        emit PurgatoryTimeSet(purgatoryTime_);
    }

    /** 
     * @notice Admin function to enroll additional collections under Purgatory management
     */
    function toggleCollectionEnroll(address collection) external isAuthorizedAdmin {
        if (!_supportsPurgatory(collection)) revert PurgatoryInterfaceNotImplemented();

        enrolledCollections[collection] = !enrolledCollections[collection];
        emit CollectionEnrollmentSet(collection, enrolledCollections[collection]);
    }

    /**
     * @notice Admin function to authorize or revoke authorized admins
     */
    function toggleAuthorizedAdmin(address admin) external isAuthorizedAdmin {
        if (admin == msg.sender) revert InvalidAdminAddress();

        authorizedAdmins[admin] = !authorizedAdmins[admin];
    }

    /** 
     * @notice Admin function to allow Purgatory deployer to claim gas revenue share from Blast
     */
    function claimMyContractsGas() external isAuthorizedAdmin {
        BLAST.claimAllGas(address(this), msg.sender);
    }
}

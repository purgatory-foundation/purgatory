// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IPurgatory {
    /**
     ********************************
     * Purgatory errors
     ********************************
     */

    /// @notice Error when a user attempts to set approval for an already valid operator approval
    error AlreadyApproved();

    /// @notice Error when a user attempts to set a Purgatory based approval to the already existing status
    error ApprovalAlreadySetToSameStatus();

    /// @notice Error when a user attempts to set a two factor wallet approver as themselves
    error TwoFactorApproverSetToSelf();

    /// @notice Generic error when a user attempts to access a feature/function without proper access
    error Unauthorized();

    /// @notice Error when a user attempts to approve a request that has not been submitted/initiated
    error RequestNotFound();

     /// @notice Error when a user attempts to transfer to an authorized transfer recipient
    error UnauthorizedTransferRecipient();

    /// @notice Error when an operator attempts to transfer without proper approval
    error UnauthorizedOperatorApproval();

    /// @notice Error when a user attempts to approve a request when the Purgatory state is already complete
    error RequestAlreadyCompleted();

    /// @notice Error when a request has not successfully fully past the Purgatory state
    error RequestNotFullyCompleted();

    /// @notice Error when a user attempts to use short-lived approvals without it being configured
    error ShortLivedApprovalsNotConfigured();

    /// @notice Error when a user attempts to refresh a short-lived approval without it being expired
    error OperatorApprovalNotExpired();

    /// @notice Error when a user takes action restricted by lockdown mode with lockdown mode enabled
    error LockDownModeEnabled();

    /// @notice Error when an admin attempts to access an admin function while powers are permanently disabled
    error AdminFunctionsPermanentlyDisabled();

    /// @notice Error when a contract attempts to enroll with Purgatory without the proper interface implemented
    error PurgatoryInterfaceNotImplemented();

    /// @notice Error when an admin attempts to revoke themself from authorized admins
    error InvalidAdminAddress();

    /**
     ********************************
     * Purgatory events
     ********************************
     */

    /// @notice Emitted when a user sets a new authorized transfer recipient
    event NewTransferRecipientRequest(address indexed collection, address indexed holder, address indexed recipient, bool approved);

    /// @notice Emitted when a user sets a new authorized global transfer recipient for all collections
    event NewGlobalTransferRecipientRequest(address indexed holder, address indexed recipient, bool approved);

    /// @notice Emitted when a user sets approval for a new operator
    event NewOperatorApprovalRequest(address indexed collection, address indexed holder, address indexed operator, bool approved);

    /// @notice Emitted when a user sets a approval for a new 2FA wallet approver
    event NewTwoFactorWalletApproverRequest(address indexed holder, address indexed approver, bool approved, bool canToggleLockDown, bool isApprovedRecipient);

    /// @notice Emitted when a user's authorized 2FA wallet approver approves/denies an operator approval request
    event OperatorApprovalSet(address collection, address indexed holder, address indexed approver, address indexed operator, bool approved);

    /// @notice Emitted when an existing short-lived operator approval has been expired and subsequently refreshed
    event OperatorApprovalRefreshed(address indexed collection, address indexed holder, address indexed operator, uint64 shortLivedApprovalLength);

    /// @notice Emitted when a user's authorized 2FA wallet approver approves/denies a transfer recipient request
    event TransferRecipientApprovalSet(address collection, address indexed holder, address indexed approver, address indexed recipient, bool approved);

    /// @notice Emitted when a user's authorized 2FA wallet approver approves/denies a global transfer recipient request
    event GlobalTransferRecipientApprovalSet(address indexed holder, address indexed approver, address indexed recipient, bool approved);

    /// @notice Emitted when a user updates their opt status
    event OptStatusSet(address indexed owner, bool optStatus, uint64 shortLivedApprovalLength);

    /// @notice Emitted when a user updates their short-lived approval length
    event ShortLivedApprovalLengthSet(address indexed owner, uint64 shortLivedApprovalLength);

    /// @notice Emitted when a user's lock down status is updated
    event LockDownStatusSet(address indexed owner, bool lockDownActive);

    /// @notice Emitted when an admin authorizes a new collection to use Purgatory
    event CollectionEnrollmentSet(address indexed collection, bool enrolled);

    /// @notice Emitted when an admin updates emergency shutdown state
    event EmergencyShutdownSet(bool emergencyShutdownActive);

    /// @notice Emitted when an admin updates the Purgatory time period
    event PurgatoryTimeSet(uint256 purgatoryTime);

    /**
     ********************************
     * Purgatory structs & enums
     ********************************
     */

    /// @notice Information for an approval request/record
    struct Approval {
        bool approved;
        uint64 lastUpdated;
    }

    /// @notice Information for an 2FA wallet approver
    struct TwoFactorWalletApproval {
        bool approved;
        bool canEnableLockDown;
        bool isApprovedRecipient;
        uint64 lastUpdated;
    }

    /// @notice Information for a user's opt-status for Purgatory
    struct OptStatus {
        bool optedIn;
        bool lockDownActive;
        uint64 optStatusLastUpdated;
        uint64 lockDownLastUpdated;
        uint64 shortLivedApprovalLastUpdated;
        uint32 shortLivedApprovalLength;
    }

    /// @notice Information used by external systems to determine a given request's status
    struct RequestStatus {
        uint256 timeRemaining;
        ApprovalStatus approvalStatus;
    }

    /// @notice Approval status states
    enum ApprovalStatus {
        Approved,
        InPurgatory,
        NoApproval,
        Expired
    }

    /**
     ***************************
     * Approval request setters
     ***************************
     */

    /**
     * @notice Allow holder to set 2FA wallet approver to approve requests on their behalf
     * @param approver 2FA wallet approver to serve as 2FA approver you are authorizing
     * @param approved The approved status you are delegating to the wallet
     * @param canToggleLockdown The authorization status to determine if the address should be allowed to lockdown your wallet
     * @param isApprovedRecipient The authorization status to determine if the address should be able to receive NFT transfers without explicit Purgatory approval
     * @dev Updates to 2FA wallet properties can only be changed if approved status changes. This is done to ensure that all changes to 2FA wallets
     * must go through Purgatory state. When revoking an approved status, only the approved status changes in order to maintain history for other properties
     */
    function setTwoFactorWalletApprover(address approver, bool approved, bool canToggleLockdown, bool isApprovedRecipient) external;

    /**
     * @notice Allow holder to set approved recipient to transfer NFTs to for a given collection
     * @param collection Collection address you are modifying recipient authorizations for
     * @param recipient Recipient address you are updating authorization for
     * @param approved The approved status of the address you are setting as a recipient
     */
    function setApprovedRecipient(address collection, address recipient, bool approved) external;

    /**
     * @notice Allow holder to set approved global recipient to transfer NFTs to for all collections managed by Purgatory
     * @param recipient Recipient address you are updating authorization for
     * @param approved The approved status of the address you are setting as a recipient
     */
    function setApprovedGlobalRecipient(address recipient, bool approved) external;

    /**
     ********************************
     * Opt/Config Setters
     ********************************
     */

    /**
     * @notice Allow holder to opt in or out of using the Purgatory system
     * @param optedIn Bool value indicating whether the user wishes to opt in or out to the purgatory system
     * @param shortLivedApprovalLength Length of time in seconds for short-lived approvals to be valid. If 0, this opts out of short-lived approvals
     * @dev If the user does not wish to opt-in to short-lived approvals, approvalLength should be set as 0
     */
    function setOptStatus(bool optedIn, uint32 shortLivedApprovalLength) external;

    /**
     * @notice Allow holder to update their short-lived approval length (in seconds)
     * @param shortLivedApprovalLength Length of time in seconds for short-lived approvals to be valid. If 0, this opts out of short-lived approvals
     * @dev If the user does not wish to opt-in to short-lived approvals, approvalLength should be set as 0
     */
    function setShortLivedApprovalLength(uint32 shortLivedApprovalLength) external;

    /**
     * @notice Allow holder to toggle lockdown mode freezing or unfreezing token approvals and transfers
     */
    function toggleLockDownMode() external;

    /**
     * @notice Allow authorized 2FA approver to enable (but not disable) lockdown mode for the holder wallet
     * @param holder Holder address to be enabled for lockdown mode
     */
    function enableLockDownModeFromTwoFactorWalletApprover(address holder) external;

    /**
     * @notice Allows refresh of short-lived approval once it is expired to avoid explicit re-approval request
     * @param collection Collection address the approval is scoped to
     * @param operator Operator address the approval refresh is targeted at
     */
    function refreshApproval(address collection, address operator) external;

    /**
     ********************************
     * 2FA wallet Approval setters
     ********************************
     */

    /**
     * @notice Allow 2FA approver to update an operator approval request with approval or denial
     * @param holder Holder address you are approving a request for
     * @param operator Operator address access is being granted to
     * @param collection Collection address the approval request is scoped to
     * @param approved The approval status to approve or deny the request
     */
    function setApprovalForOperatorApproval(address holder, address operator, address collection, bool approved) external;

    /**
     * @notice Allow 2FA approver to update a transfer recipient approval request with approval or denial
     * @param holder Holder address you are approving a request for
     * @param recipient Recipient address access is being granted to
     * @param collection Collection address the approval request is scoped to
     * @param approved The approval status to approve or deny the request
     */
    function setApprovalForTransferRecipient(address holder, address recipient, address collection, bool approved) external;

    /**
     * @notice Allow 2FA approver to update a global transfer recipient approval request with approval or denial
     * @param holder Holder address you are approving a request for
     * @param recipient Recipient address access is being granted to
     * @param approved The approval status to approve or deny the request
     */
    function setApprovalForGlobalTransferRecipient(address holder, address recipient, bool approved) external;

    /**
     * @notice Allow 2FA approver to approve a lockdown deactivation request to bypass the purgatory time period
     * @param holder Holder address you are approving the lockdown deactivation request for
     */
    function setApprovalForDeactivatingLockDown(address holder) external;

    /**
     ***********************************
     * ERC721/1155 integrated functions
     ***********************************
     */

    /**
     * @notice Called from ERC721/1155 enrolled contracts to validate a transfer passes the Purgatory security checks
     * @param from Holder address the token is being transferred from
     * @param operator Operator address making the request
     * @param recipient Recipient address the token is being transferred to
     */
    function validateTransfer(address from, address operator, address recipient) external view;

    /**
     * @notice Called from ERC721/1155 enrolled contracts to validate a transfer passes the Purgatory security checks
     * @param from Holder address requesting the approval
     * @param operator Operator address the approval is targeted at
     * @param approved Approved status of the approval request
     */
    function validateApproval(address from, address operator, bool approved) external;

    /**
     * @notice Called from ERC721/1155 enrolled contracts to determine if a token approval is valid and passes the Purgatory security checks
     * @param from Holder address the request applies to
     * @param operator Operator address the approval is targeted at
     * @return approvalStatus Whether an operator approval is fully approved completing the Purgatory state
     */
    function isApproved(address from, address operator) external view returns (bool);

    /**
     ***********************************
     * External view functions
     ***********************************
     */

    /**
     * @notice External view function to determine whether a user is opted out (fully completing Purgatory state)
     * @param holder Holder address to check if opted out
     * @return optOutStatus If a user is opted out fully completing the Purgatory state
     */
    function isOptedOut(address holder) external view returns (bool);

    /**
     * @notice External view function to determine whether a user is locked down
     * @param holder Holder address to check if is locked down
     * @return lockDownStatus If a user wallet is locked down fully completing the Purgatory state
     */
    function isLockedDown(address holder) external view returns (bool);

    /**
     * @notice External view function to determine whether a user has short-lived approvals enabled
     * @param holder Holder address to check if short-lived approvals are enabled
     * @return shortLivedApprovalEnabledStatus If a user wallet has short-lived approvals enabled fully completing the Purgatory state
     */
    function isShortLivedApprovalEnabled(address holder) external view returns (bool);

    /**
     * @notice External view function to return the current approval status for a provided holder, operator, and collection
     * @param collection Collection address the approval is scoped to
     * @param holder Holder address the approval is for
     * @param operator Operator address the approval is targeted at
     * @return requestStatus Current operator approval status and remaining time if in purgatory state
     */
    function operatorApprovalStatus(address collection, address holder, address operator) external view returns (RequestStatus memory);

    /**
     * @notice External view function to return the current transfer recipient approval status for a provided holder, recipient, and collection
     * @param collection Collection address the transfer is scoped to
     * @param holder Holder address the token is being transferred from
     * @param recipient Recipient address the token is being transferred to
     * @return requestStatus Current transfer recipient approval status and remaining time if in purgatory state

     */
    function transferRecipientApprovalStatus(address collection, address holder, address recipient) external view returns (RequestStatus memory);

    /**
     * @notice External view function to return the current approval status for an 2FA wallet
     * @param holder Holder address the 2FA approver has permission for
     * @param approver Two-factor approver address
     * @return requestStatus Current two-factor wallet approval status and remaining time if in purgatory state
     */
    function twoFactorWalletApprovalStatus(address holder, address approver) external view returns (RequestStatus memory);

    /**
     * @notice External view function to return the current lock down status for a given user
     * @param holder Holder address to check lockdown status for
     * @return requestStatus Current lockdown status and remaining time if in purgatory state
     */
    function lockDownStatus(address holder) external view returns (RequestStatus memory);

    /**
     * @notice External view function to return the current opt in status for a given user
     * @param holder Holder address to check opt-in status for
     * @return requestStatus Current opt-in status and remaining time if in purgatory state
     */
    function optInStatus(address holder) external view returns (RequestStatus memory);

    /**
     * @notice External view function to return the current short-lived approval opt in status for a given user
     * @param holder Holder address to check short-lived approval opt-in status for
     * @return requestStatus Current short-lived approval opt-in status and remaining time if in purgatory state
     */
    function shortLivedApprovalStatus(address holder) external view returns (RequestStatus memory);

    /**
     * @notice External view function to return the remaining time on an operator approval (if short-lived approvals are used)
     * @param collection Collection address the approval is scoped to
     * @param holder Holder address the approval is for
     * @param operator Operator address the approval is targeted at
     * @return timeRemaining Remaining time until a short-lived approval is expired
     */
    function getRemainingOperatorApprovalTime(address collection, address holder, address operator) external view returns (uint256);

    /**
     * @notice Callable externally to determine if a token approval is valid and passes the Purgatory security checks
     * @param from Holder address the request applies to
     * @param operator Operator address the approval is targeted at
     * @param collection Collection address the approval is scoped to
     * @return approvalStatus Whether an operator approval is fully approved completing the Purgatory state
     */
    function isApproved(address from, address operator, address collection) external view returns (bool);
} 

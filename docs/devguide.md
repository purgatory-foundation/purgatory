# Purgatory Dev Guide

Please first take a look at the [User Guide](./userguide.md) to get an understanding of how Purgatory works.
This dev guide will give information on how Purgatory has been built, and important considerations to understand
when contributing to Purgatory or implementing in your own projects.

## Core Concepts to Understand

There are several core concepts that are important to understand how Purgatory works, as well as how the security
model is built and what it relies on:

1. Requests must be initially made from the main wallet, and then subsequently approved or denied from the two-factor 
wallet (the one exception to this rule is an opt-in feature to enable lockdown mode from a two-factor wallet). Given that
we want users to only be compromised if they lose **both** their main and two-factor wallets, this is an important
concept that must be respected.
2. Both the approval and revokal of requests impacting the user's security must go through the Purgatory state.
Similar to above, in order to ensure the security model is not broken, we must ensure that requests to approve or
revoke access all go through the Purgatory state to prevent issues where an attacker can bypass the system (i.e. 
revoking authorized recipients so a victim cannot transfer NFTs out of a compromised wallet)
3. Purgatory state is determined by `block.timestamp`. When a request is made, the timestamp is stored in the
appropriate mapping. When checking a request status, a comparison of the current `block.timestamp` is made against
the stored timestamp. If the Purgatory time is completed between the delta, the request is considered approved. 
Additionally, when a request is approved from a two-factor wallet, the stored timestamp in the mapping is updated
by subtracting the Purgatory time value indicating the request has successfully completed the Purgatory state.

## Using Purgatory Smart Contracts
There are two aspects for the smart contracts that make up Purgatory: Purgatory.sol and the ERC token implementation.

Purgatory.sol is either a global contract to easily leverage, or a standalone contract that can be deployed once for 
all of your collections, from which you can enroll individual token contracts to leverage the same Purgatory.sol contract.

ERC token implementations (i.e. ERC1155) have been provided in the [tokens directory](../contracts/tokens/) which
can be leveraged by your token's smart contract. These contracts override functions within the ERC standard to 
inject the Purgatory security checks. 

Before walking through the ERC token implementations, let's first understand how Purgatory.sol works:

### Purgatory.sol
This standalone contract will store all the relevant data for each of the users and collections it manages. This 
includes approval requests/records, two-factor wallet authorizations, approved transfer recipients, and user opt status.

In addition to storing data, this contract also handles the core security logic for the system. Given that ERC721,
ERC1155, and even ERC20 token structures are very similar, we can include the core validation logic within this contract.
We'll walk through 3 of the core functions which are the functions that handle the core Purgatory business logic and are
called from ERC token implementation contract.

#### validateApproval
`validateApproval` is called when an operator approval is set. This function (as well as the below functions) will first ensure
the user is opted-in, not in lockdown mode, and the collection is enrolled within Purgatory. Once the initial validations
pass, the core Purgatory security checks are done. If the approval is being revoked, the record in the `approvals` mapping
will be deleted. If the approval is being set, the approvals mapping will be updated accordingly with the current approval
status as well as the current timestamp (`block.timestamp`). If the operator being approved has already been approved, an
error is thrown to ensure that the user doesn't accidentally approve an already approved operator resetting the Purgatory
time to a pending state and also wasting gas in the process.

#### validateTransfer
`validateTransfer` is called when a token is transferred in the `beforeTokenTransfer` or similar call. Similar to above,
opt-in and other checks are initially done. Once validated, if the requestor of the token transfer is `from` (i.e. if
`msg.sender` of the transaction is the token holder), a check is done to determine if the recipient is an authorized
recipient. Transfer recipients are added through `setApprovedRecipient` or `setApprovedGlobalRecipient` by the token holder
which allows them to set authorized recipients for a given collection, or for all collections managed by Purgatory. Similar 
to all Purgatory functionality, the addition or removal of approved recipients must go through the Purgatory state. If the 
requestor is not `from`, then this indicates an operator is handling the transfer so a check is done to ensure the operator 
is approved. 

#### isApproved
`isApproved` is called when the token's approval status or allowance functions are called (i.e. `isApprovedForAll`). This
function is important as it allows other systems, including frontends/outside integrations, to understand approval status
in respect to the current Purgatory status. For example, if a user calls `setApprovalForAll` but the request is still in
the Purgatory state, `isApprovedForAll` will return `false` because the request is not fully validated yet. This is also
important because it allows us to protect against scam or griefing vectors which result in being able to list NFTs for
a value much lower than the floor while having the token be untransferrable (i.e. during a pending approval or lockdown 
mode). By being able to update the approval status, marketplaces such as OpenSea will delist items automatically if
the current status of approval is not `true`.

Now with the core logic out of the way, let's walk through an example with ERC1155...

### ERC1155Purgatory
The full implementation for ERC1155Purgatory can be found [here](../contracts/tokens/ERC1155Purgatory.sol).

ERC1155Purgatory overrides the following core functions:


#### _beforeTokenTransfer
`_beforeTokenTransfer` is overridden to allow us to call `validateTransfer` within Purgatory.sol before any token
transfer. `validateTransfer` will run Purgatory checks as detailed above to determine if the transfer should succeed
or be rejected.

```solidity
function _beforeTokenTransfer(
    address operator,
    address from,
    address to,
    uint256[] memory ids,
    uint256[] memory amounts,
    bytes memory data
) internal virtual override {
    // Throw error if invalid transfer within purgatory time
    try purgatory.validateTransfer(from, operator, to) {
        emit PurgatoryEvent(true, "");
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);
    } catch Error(string memory reason) {
        emit PurgatoryEvent(false, reason);
        revert PurgatoryError(reason);
    }
}
```

#### setApprovalForAll
`setApprovalForAll` is overridden to allow us to call `validateApproval` within Purgatory.sol when an approval
is set or revoked. `validateApproval` will run Purgatory checks as detailed above to update the approvals data
stored within Purgatory.

```solidity
function setApprovalForAll(address operator, bool approved) public virtual override {
    try purgatory.validateApproval(msg.sender, operator, approved) {
        emit PurgatoryEvent(true, "");
        super.setApprovalForAll(operator, approved);
    } catch Error(string memory reason) {
        emit PurgatoryEvent(false, reason);
        revert PurgatoryError(reason);
    }
}
```

#### isApprovedForAll
`isApprovedForAll` is overridden to allow us to call `isApproved` within Purgatory.sol whenever an operator
approval status is checked. `isApproved` will run checks as detailed above and return `true` if the approval
has successfully completed the Purgatory state and `false` if the approval is not valid or still pending.

```solidity
function isApprovedForAll(address account, address operator) public view virtual override returns (bool) {
    return purgatory.isApproved(account, operator) && super.isApprovedForAll(account, operator);
}
```

## Building a UI for Purgatory
When building external user interfaces to interact with Purgatory, there's a few important things to know:

### External View Functions
Most of the external view functions return standardized data in the form of a struct `RequestStatus`:

```solidity
struct RequestStatus {
    uint256 timeRemaining;
    ApprovalStatus approvalStatus;
}

enum ApprovalStatus {
    Approved,
    InPurgatory,
    NoApproval,
    Expired
}
```

`RequestStatus` contains the approval status, which is either `Approved`, `InPurgatory`, `NoApproval`, or `Expired` as 
well as the remaining time left in the Purgatory state if the approval status is `InPurgatory`. If the request
is `NoApproval`, or `Expired` the `timeRemaining` will be 0. If the request is `Approved` state, the `timeRemaining` will
be either 0 if approved, or if the request is revoked and still in Purgatory state, the `timeRemaining` will be the remaining 
time until the revoke goes into effect. Let's take a look at one example to see how this works in practice:

```solidity
function operatorApprovalStatus(address collection, address holder, address operator) external view returns (RequestStatus memory) {
    Approval memory currentApproval = approvals[collection][holder][operator];
    bool approved = _isOperatorApprovalApproved(collection, holder, operator);
    if (approved) {
        return RequestStatus(0, ApprovalStatus.Approved);
    }

    if (currentApproval.lastUpdated == 0) {
        return RequestStatus(0, ApprovalStatus.NoApproval);
    }

    // Check if approval exists but short-lived approvals are enabled and approval has expired
    OptStatus memory userOptStatus = optStatus[holder];
    if (_isShortLivedApprovalEnabled(userOptStatus) && !_isShortLivedApprovalValid(currentApproval.lastUpdated, _getShortLivedApprovalLength(userOptStatus))) {
        return RequestStatus(0, ApprovalStatus.Expired);
    }

    uint256 remainingTime = purgatoryTime - (block.timestamp - currentApproval.lastUpdated);
    return RequestStatus(remainingTime, ApprovalStatus.InPurgatory);
}
```

In this example, if the operator approval is approved and the Purgatory state is successfully completed, the 
returned `RequestStatus` would indicate an approved `ApprovalStatus` with a `timeRemaining` of 0.

If the request is in Purgatory, then the `ApprovalStatus` is `InPurgatory` with a `timeRemaining` of the 
remaining seconds until the Purgatory state is complete.

Lastly, if there is no approval found for this operator, the `ApprovalStatus` is `NoApproval` with a 
`timeRemaining` of 0.

A similar function to `operatorApprovalStatus` exists for all of the request types within Purgatory, in 
addition to a few other helpful functions external interfaces or contracts can use.

### Events
Events are the easiest way to get the necessary data to determine current pending requests and historical
data for Purgatory requests. Where relevant, event parameters are indexed to allow for frontends to 
filter event logs to supply the current user with relevant data for their logged-in wallet, including 
pending requests for that wallet as well as approvals they may be able to make as a two-factor wallet.

For some examples getting started parsing the event data and using status view functions, see the 
[events task](../tasks/events.ts). Note that this is just for testing/demonstration purposes, and not 
necessarily the optimal approach.

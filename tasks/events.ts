import { task } from "hardhat/config";
import { Purgatory, TestERC721A, TestERC1155 } from "../typechain";

const axios = require('axios');

task("events", "Parse event logs for external interfaces", async (taskArgs, hre) => {
    const { ethers, deployments } = hre;
    const chainId = await hre.getChainId();
    const {} = deployments;

    const deployerAddress = "<TO_UPDATE>";
    const holderAddress = "<TO_UPDATE>";
    const twoFactorWalletAddress = "<TO_UPDATE>";

    const deployerSigner = await ethers.getSigner(deployerAddress);
    const signer = await ethers.getSigner(holderAddress);
    const twoFactorSigner = await ethers.getSigner(twoFactorWalletAddress);

    let purgatoryContract = await deployments.get("Purgatory");
    let erc1155Contract = await deployments.get("TestERC1155");
    let erc721Contract = await deployments.get("TestERC721A");

    // const purgatory = (await ethers.getContractAt(
    //     "Purgatory",
    //     purgatoryContract.address,
    //     signer
    // )) as Purgatory;

    // const purgatoryDeployer = (await ethers.getContractAt(
    //     "Purgatory",
    //     purgatoryContract.address,
    //     deployerSigner
    // )) as Purgatory;

    // const purgatorySecondFactor = (await ethers.getContractAt(
    //     "Purgatory",
    //     purgatoryContract.address,
    //     twoFactorSigner
    // )) as Purgatory;
    
    // const erc721 = (await ethers.getContractAt(
    //     "TestERC721A",
    //     erc721Contract.address,
    //     signer
    // )) as TestERC721A;

    // const erc1155 = (await ethers.getContractAt(
    //     "TestERC1155",
    //     erc1155Contract.address,
    //     deployerSigner
    // )) as TestERC1155;

    // await purgatoryDeployer.claimMyContractsGas();
    // await erc721.mint(5, "<TO_UPDATE>");

    // Initialize environment
    // await purgatoryDeployer.toggleCollectionEnroll(erc1155.address);
    // await purgatoryDeployer.toggleCollectionEnroll(erc721.address);
    // await purgatory.setOptStatus(true, 900);
    // await purgatoryDeployer.setOptStatus(true, 0);

    // await purgatory.setTwoFactorWalletApprover(twoFactorWalletAddress, true, false, false);
    // await purgatory.setTwoFactorWalletApprover(erc1155.address, true, false, true);
    // await purgatory.setApprovedGlobalRecipient(twoFactorWalletAddress, true);
    // await purgatory.setApprovedGlobalRecipient(erc1155.address, true);
    // await purgatory.setApprovedRecipient(erc721.address, erc1155.address, true);
    // await purgatory.setApprovedRecipient(erc721.address, erc721.address, true);

    // await erc1155.setApprovalForAll(twoFactorWalletAddress, true);
    // await erc1155.setApprovalForAll(erc721.address, true);
    // await erc721.setApprovalForAll(twoFactorWalletAddress, true);
    // await erc721.setApprovalForAll(erc1155.address, true);

    // await purgatory.refreshApproval(erc1155.address, twoFactorWalletAddress);
    // await purgatory.setShortLivedApprovalLength(5000);

    // await purgatory.setApprovedRecipient(erc1155.address, "<TO_UPDATE>", false);
    // await purgatory.setTwoFactorWalletApprover("<TO_UPDATE>", false, true, true);
    // await purgatory.setApprovedRecipient(erc721.address, twoFactorWalletAddress, false);
    // await purgatory.setTwoFactorWalletApprover(erc1155.address, false, false, false);

    // await purgatorySecondFactor.setApprovalForGlobalTransferRecipient(holderAddress, erc1155.address, false);
    // console.log(await purgatory.twoFactorWalletApprovals(holderAddress, "<TO_UPDATE>"));
    // console.log(await purgatory.approvedRecipients(erc1155.address, holderAddress, "<TO_UPDATE>"));
    // console.log(await purgatory.approvedRecipients(erc721.address, holderAddress, "<TO_UPDATE>"));
    // console.log(await purgatory.transferRecipientApprovalStatus(erc721.address, holderAddress, "<TO_UPDATE>"));
    // console.log(await purgatory.transferRecipientApprovalStatus(erc1155.address, holderAddress, "<TO_UPDATE>"));
    // console.log(await purgatory.twoFactorWalletApprovalStatus(holderAddress, "<TO_UPDATE>"));

    // console.log(await purgatory.shortLivedApprovalStatus(holderAddress));

    // await purgatory.setTwoFactorWalletApprover("<TO_UPDATE>", true, false, true);
    // await purgatory.setTwoFactorWalletApprover("<TO_UPDATE>", false, false, true);
    // console.log(await purgatory.twoFactorWalletApprovals(holderAddress, "<TO_UPDATE>"));
    // console.log(await purgatory.twoFactorWalletApprovalStatus(holderAddress, "<TO_UPDATE>"));
    // console.log(await purgatory.transferRecipientApprovalStatus(erc1155.address, holderAddress, "<TO_UPDATE>"));
    // // await purgatorySecondFactor.setApprovalForOperatorApproval(holderAddress, twoFactorWalletAddress, erc1155.address, true);
    // await purgatorySecondFactor.setApprovalForOperatorApproval(holderAddress, erc721.address, erc1155.address, true);
    // await purgatorySecondFactor.setApprovalForOperatorApproval(holderAddress, twoFactorWalletAddress, erc721.address, true);
    // await purgatorySecondFactor.setApprovalForOperatorApproval(holderAddress, erc1155.address, erc721.address, false);

    /**
     * MAIN WALLET VIEWS
     */

    interface StatusData {
        EventArgs: string;
        ApprovalStatus: number;
        RemainingTime: number;
    }

    // console.log("=========SHORT LIVED APPRVL==========");
    // console.log(await purgatory.shortLivedApprovalStatus(holderAddress));

    // /// Operator approval status
    // const operatorApprovalRequestFilter = purgatory.filters.NewOperatorApprovalRequest(null, holderAddress);
    // const operatorApprovalRequestEvents = await purgatory.queryFilter(operatorApprovalRequestFilter);

    // console.log("============OPERATOR==============");
    
    // for (let event in operatorApprovalRequestEvents) {
    //     const eventData = operatorApprovalRequestEvents[event];
    //     let operatorApprovalStatus = await purgatory.operatorApprovalStatus(eventData.args.collection, eventData.args.holder, eventData.args.operator);
    //     console.log(eventData.args.collection, eventData.args.holder, eventData.args.operator);
    //     console.log(operatorApprovalStatus);
    //     // console.log(await purgatory.getRemainingOperatorApprovalTime(eventData.args.collection, eventData.args.holder, eventData.args.operator));
    //     console.log("-----------------------------------");
    //     // Do something with data
    // }

    // /// transfer recipient status
    // const transferRecipientApprovalRequestFilter = purgatory.filters.NewTransferRecipientRequest(null, holderAddress);
    // const transferRecipientApprovalRequestEvents = await purgatory.queryFilter(transferRecipientApprovalRequestFilter);

    // console.log("============TRANSFER==============");

    // for (let event in transferRecipientApprovalRequestEvents) {
    //     const eventData = transferRecipientApprovalRequestEvents[event];
    //     let transferRecipientApprovalStatus = await purgatory.transferRecipientApprovalStatus(eventData.args.collection, eventData.args.holder, eventData.args.recipient);
    //     console.log(eventData.args.collection, eventData.args.holder, eventData.args.recipient);
    //     console.log(transferRecipientApprovalStatus);
    //     console.log("-----------------------------------");
    //     // Do something with data
    // }

    // const globalTransferRecipientApprovalRequestFilter = purgatory.filters.NewGlobalTransferRecipientRequest(holderAddress);
    // const globalTransferRecipientApprovalRequestEvents = await purgatory.queryFilter(globalTransferRecipientApprovalRequestFilter);

    // console.log("============GLOBAL==============");

    // for (let event in globalTransferRecipientApprovalRequestEvents) {
    //     const eventData = globalTransferRecipientApprovalRequestEvents[event];
    //     // Collection parameter can be any value for global transfer recipients as it's not relevant
    //     let globalTransferRecipientApprovalStatus = await purgatory.transferRecipientApprovalStatus(eventData.args.holder, eventData.args.holder, eventData.args.recipient);
    //     console.log(eventData.args.holder, eventData.args.recipient);
    //     console.log(globalTransferRecipientApprovalStatus);
    //     console.log("-----------------------------------");
    //     // Do something with data
    // }

    // // two-factor wallet status
    // const twoFactoWalletsApprovalRequestFilter = purgatory.filters.NewTwoFactorWalletApproverRequest(holderAddress);
    // const twoFactoWalletsApprovalRequestEvents = await purgatory.queryFilter(twoFactoWalletsApprovalRequestFilter);

    // console.log("============2FA==============");

    // for (let event in twoFactoWalletsApprovalRequestEvents) {
    //     const eventData = twoFactoWalletsApprovalRequestEvents[event];
    //     let twoFactorWalletApprovalStatus = await purgatory.twoFactorWalletApprovalStatus(eventData.args.holder, eventData.args.approver);
    //     console.log(eventData.args.holder, eventData.args.approver);
    //     console.log(twoFactorWalletApprovalStatus);
    //     console.log("-----------------------------------");
    //     // Do something with data
    // }

    // /**
    //  * 2FA WALLET VIEWS
    //  */


    //  console.log("============2FA APPROVALS==============");

    // const walletsApprovedFor: string[] = [];

    // /// get wallets that 2FA wallet is approver for
    // const walletsAuthorizedToApproveForFilter = purgatory.filters.NewTwoFactorWalletApproverRequest(null, twoFactorWalletAddress);
    // const walletsAuthorizedToApproveForEvents = await purgatory.queryFilter(walletsAuthorizedToApproveForFilter);

    // for (let event in walletsAuthorizedToApproveForEvents) {
    //     const eventData = walletsAuthorizedToApproveForEvents[event];
    //     let walletsAuthorizedToApproveForStatus = await purgatory.twoFactorWalletApprovalStatus(eventData.args.holder, eventData.args.approver);
    //     console.log(eventData.args.holder, eventData.args.approver);
    //     console.log(walletsAuthorizedToApproveForStatus);
    //     console.log("-----------------------------------");
    //     if (walletsAuthorizedToApproveForStatus.approvalStatus == 0) {
    //         walletsApprovedFor.push(eventData.args.holder);
    //     }
    // }
});

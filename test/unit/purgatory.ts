/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect } from "chai";
import { ethers } from "hardhat";
import { Contracts, setupIntegration, User } from "../fixtures";
import { BigNumber } from "ethers";
import { Address } from "cluster";
import { ERC1155 } from "../../typechain";

describe("Purgatory", function () {
  let contracts: Contracts;
  let deployer: User;
  let dao: User;
  let users: User[];
  let enrollCollectionTx: any;

  beforeEach(async () => {
    ({ contracts, deployer, users } = await setupIntegration());
    enrollCollectionTx = await deployer.Purgatory.toggleCollectionEnroll(deployer.TestERC1155.address);
    await deployer.Purgatory.toggleCollectionEnroll(deployer.TestERC721A.address);
    await deployer.Purgatory.toggleCollectionEnroll(deployer.TestERC20.address);
    await deployer.Purgatory.toggleCollectionEnroll(deployer.TestERC1155Burnable.address);
    await deployer.Purgatory.toggleCollectionEnroll(deployer.TestERC721ABurnable.address);
    await deployer.Purgatory.toggleCollectionEnroll(deployer.TestERC20Burnable.address);
    await users[2].Purgatory.setOptStatus(true, 0);
  });

  describe("Purgatory core tests", async function () {
    it("allows enrolled collection using the IPurgatoryColleciton interface to be enrolled in Purgatory", async function () {
      await expect(enrollCollectionTx).not.to.be.revertedWith("PurgatoryInterfaceNotImplemented");
    });
    it("forbids collection without IPurgatoryCollection interface to be enrolled in Purgatory", async function () {
      await expect(deployer.Purgatory.toggleCollectionEnroll(deployer.TestERC1155NonPurg.address)).to.be.revertedWithCustomError(deployer.Purgatory, "PurgatoryInterfaceNotImplemented");
    });
    it("forbids collection enrollment while not owner of collection", async function () {
      await expect(users[2].Purgatory.toggleCollectionEnroll(users[2].TestERC1155.address)).to.be.revertedWithCustomError(deployer.Purgatory, "Unauthorized");
    });
    it("forbids two factor wallet approval within purgatory time", async function () {
      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, true, false, false);
      await expect(users[4].Purgatory.setApprovalForOperatorApproval(users[2].address, users[3].address, deployer.TestERC1155.address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "Unauthorized");
    })
    it("forbids two factor wallet denial within purgatory time", async function () {
      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, true, false, false);
      await expect(users[4].Purgatory.setApprovalForOperatorApproval(users[2].address, users[3].address, deployer.TestERC1155.address, false)).to.be.revertedWithCustomError(deployer.Purgatory, "Unauthorized");
    })
    it("forbids two factor wallet approval by unapproved wallet", async function () {
      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, true, false, false);
      await expect(users[3].Purgatory.setApprovalForOperatorApproval(users[2].address, users[3].address, deployer.TestERC1155.address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "Unauthorized");
    })
    it("forbids approved status by unapproved operator", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC1155.isApprovedForAll(users[2].address, users[3].address)).to.equal(true);
      expect(await deployer.TestERC1155.isApprovedForAll(users[2].address, users[4].address)).to.equal(false);
      expect((await deployer.Purgatory.approvals(deployer.TestERC1155.address, users[2].address, users[3].address)).approved).to.equal(true);
      expect((await deployer.Purgatory.approvals(deployer.TestERC1155.address, users[2].address, users[4].address)).approved).to.equal(false);
    })
    it("forbids set an Approved recipient of a none erolled collection", async function () {
      /// @dev removing the collection from purgatory
      await deployer.Purgatory.toggleCollectionEnroll(deployer.TestERC721A.address);
      await expect(deployer.Purgatory.setApprovedRecipient(deployer.TestERC721A.address, users[2].address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "Unauthorized");
    });
    it("allows multiple two factor wallets to complete approvals after purgatory time is complete", async function () {
      await deployer.TestERC1155.mint([2], [1], [users[2].address]);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, true, false, false);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);
      await users[2].TestERC1155.setApprovalForAll(users[4].address, true);

      await expect(users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x")).to.be.rejectedWith("ERC1155: caller is not token owner nor approved");
      await expect(users[4].TestERC1155.safeTransferFrom(users[2].address, users[4].address, 1, 1, "0x")).to.be.rejectedWith("ERC1155: caller is not token owner nor approved");

      await users[4].Purgatory.setApprovalForOperatorApproval(users[2].address, users[4].address, deployer.TestERC1155.address, true);
      await users[3].Purgatory.setApprovalForOperatorApproval(users[2].address, users[3].address, deployer.TestERC1155.address, true);

      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
      expect(await deployer.TestERC1155.balanceOf(users[4].address, 1)).to.equal(0);

      await users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x");
      await users[4].TestERC1155.safeTransferFrom(users[2].address, users[4].address, 1, 1, "0x");

      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(1);
      expect(await deployer.TestERC1155.balanceOf(users[4].address, 1)).to.equal(1);
    })
    it("allows two factor wallet approval after purgatory time is complete", async function () {
      await deployer.TestERC1155.mint([1], [1], [users[2].address]);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, true, false, false);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);
      await expect(users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x")).to.be.rejectedWith("ERC1155: caller is not token owner nor approved");
      await users[4].Purgatory.setApprovalForOperatorApproval(users[2].address, users[3].address, deployer.TestERC1155.address, true);

      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
      await users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x");
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(1);
    })
    it("allows two factor wallet denial after purgatory time is complete", async function () {
      await deployer.TestERC1155.mint([1], [1], [users[2].address]);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, true, false, false);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);
      await expect(users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x")).to.be.rejectedWith("ERC1155: caller is not token owner nor approved");
      await users[4].Purgatory.setApprovalForOperatorApproval(users[2].address, users[3].address, deployer.TestERC1155.address, false);

      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
      await expect(users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x")).to.be.rejectedWith("ERC1155: caller is not token owner nor approved");
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
    })
    it("allows revoked two factor wallet approval to continue approving during purgatory time", async function () {
      await deployer.TestERC1155.mint([1], [1], [users[2].address]);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, true, false, false);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect((await deployer.Purgatory.twoFactorWalletApprovals(users[2].address, users[4].address)).approved).to.equal(true);

      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);
      await expect(users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x")).to.be.rejectedWith("ERC1155: caller is not token owner nor approved");
      await users[4].Purgatory.setApprovalForOperatorApproval(users[2].address, users[3].address, deployer.TestERC1155.address, true);

      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
      await users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x");
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(1);

      await users[2].TestERC1155.setApprovalForAll(users[3].address, false);

      // REVOKE two factor wallet
      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, false, false, false);
      expect((await deployer.Purgatory.twoFactorWalletApprovals(users[2].address, users[4].address)).approved).to.equal(false);

      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);
      expect(await deployer.Purgatory["isApproved(address,address,address)"](users[2].address, users[3].address, deployer.TestERC1155.address)).to.equal(false);
      await users[4].Purgatory.setApprovalForOperatorApproval(users[2].address, users[3].address, deployer.TestERC1155.address, true);
      expect(await deployer.Purgatory["isApproved(address,address,address)"](users[2].address, users[3].address, deployer.TestERC1155.address)).to.equal(true);
    })
    it("forbids revoked two factor wallet approval to continue approving after purgatory time", async function () {
      await deployer.TestERC1155.mint([1], [1], [users[2].address]);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, true, false, false);
      expect((await deployer.Purgatory.twoFactorWalletApprovals(users[2].address, users[4].address)).lastUpdated).to.not.equal(0);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);
      await expect(users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x")).to.be.rejectedWith("ERC1155: caller is not token owner nor approved");
      await users[4].Purgatory.setApprovalForOperatorApproval(users[2].address, users[3].address, deployer.TestERC1155.address, true);

      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
      await users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x");
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(1);

      await users[2].TestERC1155.setApprovalForAll(users[3].address, false);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663123559 +  (2 * (purgatoryTimeInSeconds + 10))]);
      await ethers.provider.send("evm_mine", []);

      // REVOKE two factor wallet
      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, false, false, false);
      expect((await deployer.Purgatory.twoFactorWalletApprovals(users[2].address, users[4].address)).approved).to.equal(false);
      
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663123559 +  (4 * (purgatoryTimeInSeconds + 10))]);
      await ethers.provider.send("evm_mine", []);

      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);
      await expect(users[4].Purgatory.setApprovalForOperatorApproval(users[2].address, users[3].address, deployer.TestERC1155.address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "Unauthorized");
    })
    it("forbids opt out bypass if within purgatory time", async function () {
      // User opted out
      await users[2].Purgatory.setOptStatus(false, 0);

      await deployer.TestERC1155.mint([1], [1], [users[2].address]);
      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);

      await expect(users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x")).to.be.rejectedWith("ERC1155: caller is not token owner nor approved");
    })
    it("allows approval if opted out and purgatory time is complete", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setOptStatus(false, 0);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await deployer.TestERC1155.mint([1], [1], [users[2].address]);
      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);

      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
      await users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x");
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(1);      
    })
    it("allows opt in instant access to purgatory functionality without purgatory time", async function () {
      // User opted out
      await users[2].Purgatory.setOptStatus(false, 0);

      await deployer.TestERC1155.mint([1,1], [1,1], [users[2].address, users[2].address]);
      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);

      await expect(users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x")).to.be.rejectedWith("ERC1155: caller is not token owner nor approved");

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await expect(users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x"));

      // User opts in
      await users[2].Purgatory.setOptStatus(true, 0);
      await users[2].TestERC1155.setApprovalForAll(users[4].address, true);
      await expect(users[4].TestERC1155.safeTransferFrom(users[2].address, users[4].address, 1, 1, "0x")).to.be.rejectedWith("ERC1155: caller is not token owner nor approved");
    })
    it("allows lock down mode to remain active when recently deactivated within purgatory time", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await users[2].Purgatory.toggleLockDownMode();
      await expect(users[2].TestERC1155.setApprovalForAll(users[3].address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "LockDownModeEnabled");

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC1155.isApprovedForAll(users[2].address, users[3].address)).to.equal(false);

      await users[2].Purgatory.toggleLockDownMode();
      await expect(users[2].TestERC1155.setApprovalForAll(users[3].address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "LockDownModeEnabled");
      expect(await users[2].TestERC1155.isApprovedForAll(users[2].address, users[3].address)).to.equal(false);
    })
    it("allows lock down mode to be deactivated after purgatory time for disable is complete", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await users[2].Purgatory.toggleLockDownMode();
      await expect(users[2].TestERC1155.setApprovalForAll(users[3].address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "LockDownModeEnabled");

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.toggleLockDownMode();
      await expect(users[2].TestERC1155.setApprovalForAll(users[3].address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "LockDownModeEnabled");

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + ((purgatoryTimeInSeconds + 10) * 2)]);
      await ethers.provider.send("evm_mine", []);

      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + ((purgatoryTimeInSeconds + 10) * 4)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC1155.isApprovedForAll(users[2].address, users[3].address)).to.equal(true);
    })
    it("allows lock down mode to remain deactivated when double activated then reactivated without waiting for purgatory time", async function () {
      await users[2].Purgatory.toggleLockDownMode();
      await users[2].Purgatory.toggleLockDownMode();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC1155.isApprovedForAll(users[2].address, users[3].address)).to.equal(true);
    })
    it("allows lock down mode to be deactivated w/ purgatory time bypass by 2FA wallet approver", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await users[2].Purgatory.toggleLockDownMode();
      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.toggleLockDownMode();
      await expect(users[2].TestERC1155.setApprovalForAll(users[3].address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "LockDownModeEnabled");
      expect(await (await users[2].Purgatory.approvals(deployer.TestERC1155.address, users[2].address, users[3].address)).approved).to.equal(false);

      await users[3].Purgatory.setApprovalForDeactivatingLockDown(users[2].address);
      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);
      expect(await (await users[2].Purgatory.approvals(deployer.TestERC1155.address, users[2].address, users[3].address)).approved).to.equal(true);
    })
    it("forbids lock down mode to be deactivated w/ purgatory time bypass by unauthorized 2FA wallet approver", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await users[2].Purgatory.toggleLockDownMode();
      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.toggleLockDownMode();
      await expect(users[2].TestERC1155.setApprovalForAll(users[3].address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "LockDownModeEnabled");
      expect(await (await users[2].Purgatory.approvals(deployer.TestERC1155.address, users[2].address, users[3].address)).approved).to.equal(false);

      await expect(users[4].Purgatory.setApprovalForDeactivatingLockDown(users[2].address)).to.be.revertedWithCustomError(deployer.Purgatory, "Unauthorized");
      await expect(users[2].TestERC1155.setApprovalForAll(users[3].address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "LockDownModeEnabled");
      expect(await (await users[2].Purgatory.approvals(deployer.TestERC1155.address, users[2].address, users[3].address)).approved).to.equal(false);
    })
    it("forbids lock down mode to be approved by 2FA wallet when being activated", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.toggleLockDownMode();
      await expect(users[2].TestERC1155.setApprovalForAll(users[3].address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "LockDownModeEnabled");
      expect(await (await users[2].Purgatory.approvals(deployer.TestERC1155.address, users[2].address, users[3].address)).approved).to.equal(false);

      await expect(users[3].Purgatory.setApprovalForDeactivatingLockDown(users[2].address)).to.be.revertedWithCustomError(deployer.Purgatory, "RequestNotFound");
      await expect(users[2].TestERC1155.setApprovalForAll(users[3].address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "LockDownModeEnabled");
      expect(await (await users[2].Purgatory.approvals(deployer.TestERC1155.address, users[2].address, users[3].address)).approved).to.equal(false);
    })
    it("forbids lock down mode to be deactivated w/ purgatory time bypass by 2FA wallet approver once purgatory time is already complete", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);
      await users[2].Purgatory.toggleLockDownMode();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.toggleLockDownMode();
      await users[3].Purgatory.setApprovalForDeactivatingLockDown(users[2].address);

      await expect(users[3].Purgatory.setApprovalForDeactivatingLockDown(users[2].address)).to.be.revertedWithCustomError(deployer.Purgatory, "RequestAlreadyCompleted");
    })
    it("allows lock down mode from two factor wallet AKA 2FA", async function () {
      await deployer.TestERC1155.mint([2], [1], [users[2].address]);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);
      
      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      /// set 2FA wallet with lockdown permissions
      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, true, true, false);
     
      /// wait the purgatory time
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      /// performing a lock down from the 2FA wallet
      await users[4].Purgatory.enableLockDownModeFromTwoFactorWalletApprover(users[2].address);

      await expect(users[2].TestERC1155.setApprovalForAll(users[3].address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "LockDownModeEnabled");
    })
    /// two factor wallet Lock Down Mode 
    it("forbids approval in lock down mode from two factor wallet", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, true, false);
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);
      /// enable lock down Mode from 2FA Wallet
      await users[3].Purgatory.enableLockDownModeFromTwoFactorWalletApprover(users[2].address);

      await expect(users[2].TestERC1155.setApprovalForAll(users[3].address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "LockDownModeEnabled");
    });
    it("forbids transfer in lock down mode from two factor wallet", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, true, false);
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);
      /// enable lock down Mode from 2FA Wallet
      await users[3].Purgatory.enableLockDownModeFromTwoFactorWalletApprover(users[2].address);
      await expect(users[2].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x")).to.be.revertedWithCustomError(deployer.Purgatory, "LockDownModeEnabled");
    });
    it("forbids enabling lockdown mode from two factor wallet if not authorized 2FA wallet", async function () {
      await expect(users[3].Purgatory.enableLockDownModeFromTwoFactorWalletApprover(users[2].address)).to.be.revertedWithCustomError(deployer.Purgatory, "Unauthorized");
    });
    it("forbids enabling lockdown mode from two factor wallet if authorized 2FA wallet but WITHOUT enableLockDownMode permission", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      /// enable lock down Mode from 2FA Wallet
      await expect(users[3].Purgatory.enableLockDownModeFromTwoFactorWalletApprover(users[2].address)).to.be.revertedWithCustomError(deployer.Purgatory, "Unauthorized");
    });
    it("forbids enabling lockdown mode from two factor wallet when lockdown mode is already enabled from 2FA wallet", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, true, false);
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      // enable lock down Mode from 2FA Wallet
      await users[3].Purgatory.enableLockDownModeFromTwoFactorWalletApprover(users[2].address);

      // enable it again
      await expect(users[3].Purgatory.enableLockDownModeFromTwoFactorWalletApprover(users[2].address)).to.be.revertedWithCustomError(deployer.Purgatory, "ApprovalAlreadySetToSameStatus");
    });
    it("forbids enabling lockdown mode from two factor wallet when lockdown mode is already enabled from main wallet", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, true, false);
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      // toggle lock down Mode from main wallet
      await users[2].Purgatory.toggleLockDownMode();

      // enable it again from 2FA wallet
      await expect(users[3].Purgatory.enableLockDownModeFromTwoFactorWalletApprover(users[2].address)).to.be.revertedWithCustomError(deployer.Purgatory, "ApprovalAlreadySetToSameStatus");
    });
    // EXTERNAL VIEW FUNCTION TESTS
    it("allows operatorApprovalStatus to correctly show no approval or time remaining for unapproved operator", async function () {
      const requestStatus = await deployer.Purgatory.operatorApprovalStatus(deployer.TestERC1155.address, users[2].address, users[3].address);
      expect(requestStatus.timeRemaining).to.equal(0);
      expect(requestStatus.approvalStatus).to.equal(2);
    });
    it("allows operatorApprovalStatus to correctly show pending approval with time remaining and status while purgatory time is not complete", async function () {
      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);
      const requestStatus = await deployer.Purgatory.operatorApprovalStatus(deployer.TestERC1155.address, users[2].address, users[3].address);
      expect(requestStatus.timeRemaining).to.not.equal(0);
      expect(requestStatus.approvalStatus).to.equal(1);
    });
    it("allows operatorApprovalStatus to correctly show completed approval with no time remaining once purgatory time is complete", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      const requestStatus = await deployer.Purgatory.operatorApprovalStatus(deployer.TestERC1155.address, users[2].address, users[3].address);
      expect(requestStatus.timeRemaining).to.equal(0);
      expect(requestStatus.approvalStatus).to.equal(0);
    });
    it("allows transferRecipientApprovalStatus to correctly show no approval or time remaining for unapproved recipient", async function () {
      const requestStatus = await deployer.Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[3].address);
      expect(requestStatus.timeRemaining).to.equal(0);
      expect(requestStatus.approvalStatus).to.equal(2);
    });
    it("allows transferRecipientApprovalStatus to correctly show pending approval with time remaining and status while purgatory time is not complete", async function () {
      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC1155.address, users[3].address, true);
      const requestStatus = await deployer.Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[3].address);
      expect(requestStatus.timeRemaining).to.not.equal(0);
      expect(requestStatus.approvalStatus).to.equal(1);
    });
    it("allows transferRecipientApprovalStatus to correctly show pending approval with time remaining and status while purgatory time is not complete for global recipient", async function () {
      await users[2].Purgatory.setApprovedGlobalRecipient(users[3].address, true);
      const requestStatus = await deployer.Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[3].address);
      expect(requestStatus.timeRemaining).to.not.equal(0);
      expect(requestStatus.approvalStatus).to.equal(1);
    });
    it("allows transferRecipientApprovalStatus to correctly show completed approval with no time remaining once purgatory time is complete", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC1155.address, users[3].address, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      const requestStatus = await deployer.Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[3].address);
      expect(requestStatus.timeRemaining).to.equal(0);
      expect(requestStatus.approvalStatus).to.equal(0);
    });
    it("allows transferRecipientApprovalStatus to correctly show completed approval with no time remaining once purgatory time is complete for global recipient", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      const requestStatus = await deployer.Purgatory.twoFactorWalletApprovalStatus(users[2].address, users[3].address);
      expect(requestStatus.timeRemaining).to.equal(0);
      expect(requestStatus.approvalStatus).to.equal(0);
    });
    it("allows twoFactorWalletApprovalStatus to correctly show no approval or time remaining for unapproved 2FA wallet", async function () {
      const requestStatus = await deployer.Purgatory.operatorApprovalStatus(deployer.TestERC1155.address, users[2].address, users[3].address);
      expect(requestStatus.timeRemaining).to.equal(0);
      expect(requestStatus.approvalStatus).to.equal(2);
    });
    it("allows twoFactorWalletApprovalStatus to correctly show pending approval with time remaining and status while purgatory time is not complete", async function () {
      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);
      const requestStatus = await deployer.Purgatory.twoFactorWalletApprovalStatus(users[2].address, users[3].address);
      expect(requestStatus.timeRemaining).to.not.equal(0);
      expect(requestStatus.approvalStatus).to.equal(1);
    });
    it("allows twoFactorWalletApprovalStatus to correctly show completed approval with no time remaining once purgatory time is complete", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      const requestStatus = await deployer.Purgatory.twoFactorWalletApprovalStatus(users[2].address, users[3].address);
      expect(requestStatus.timeRemaining).to.equal(0);
      expect(requestStatus.approvalStatus).to.equal(0);
    });
    it("allows lockDownStatus to correctly show no approval or time remaining for non-locked down wallet", async function () {
      const requestStatus = await deployer.Purgatory.lockDownStatus(users[2].address);
      expect(requestStatus.timeRemaining).to.equal(0);
      expect(requestStatus.approvalStatus).to.equal(2);
    });
    it("allows lockDownStatus to correctly show valid approval with time remaining and status while purgatory time is not complete for removing lockdown", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      // Lockdown then remove it
      await users[2].Purgatory.toggleLockDownMode();

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.toggleLockDownMode();

      const requestStatus = await deployer.Purgatory.lockDownStatus(users[2].address);
      expect(requestStatus.timeRemaining).to.not.equal(0);
      expect(requestStatus.approvalStatus).to.equal(0);
    });
    it("allows lockDownStatus to correctly show completed approval with no time remaining once lockdown is enabled (no purgatory time required for opt in)", async function () {
      await users[2].Purgatory.toggleLockDownMode();

      const requestStatus = await deployer.Purgatory.lockDownStatus(users[2].address);
      expect(requestStatus.timeRemaining).to.equal(0);
      expect(requestStatus.approvalStatus).to.equal(0);
    });
    it("allows optInStatus to correctly show no approval or time remaining for opted out wallet", async function () {
      const requestStatus = await deployer.Purgatory.optInStatus(users[3].address);
      expect(requestStatus.timeRemaining).to.equal(0);
      expect(requestStatus.approvalStatus).to.equal(2);
    });
    it("allows optInStatus to correctly show valid approval with time remaining and status while purgatory time is not complete for opting out", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[3].Purgatory.setOptStatus(true, 0);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await users[3].Purgatory.setOptStatus(false, 0);

      const requestStatus = await deployer.Purgatory.optInStatus(users[3].address);
      expect(requestStatus.timeRemaining).to.not.equal(0);
      expect(requestStatus.approvalStatus).to.equal(0);
    });
    it("allows optInStatus to correctly show completed approval with no time remaining once opt in is done (no purgatory time required for opt in)", async function () {
      await users[3].Purgatory.setOptStatus(true, 0);
      const requestStatus = await deployer.Purgatory.optInStatus(users[3].address);
      expect(requestStatus.timeRemaining).to.equal(0);
      expect(requestStatus.approvalStatus).to.equal(0);
    });
    it("allows getRemainingOperatorApprovalTime to correctly return 0 as remaining time if no approval exists", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[3].Purgatory.setOptStatus(true, 600);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.Purgatory.getRemainingOperatorApprovalTime(deployer.TestERC1155.address, users[3].address, users[2].address)).to.equal(0);
    });
    it("allows getRemainingOperatorApprovalTime to correctly revert if short-lived approvals is not activated", async function () {
      await users[3].Purgatory.setOptStatus(true, 0);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[3].TestERC1155.setApprovalForAll(users[2].address, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await expect(deployer.Purgatory.getRemainingOperatorApprovalTime(deployer.TestERC1155.address, users[3].address, users[2].address)).to.be.revertedWithCustomError(deployer.Purgatory, "ShortLivedApprovalsNotConfigured");
    });
    it("allows getRemainingOperatorApprovalTime to correctly return 0 as remaining time if Purgatory time is NOT complete", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[3].Purgatory.setOptStatus(true, 600);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await users[3].TestERC1155.setApprovalForAll(users[2].address, true);

      expect(await deployer.Purgatory.getRemainingOperatorApprovalTime(deployer.TestERC1155.address, users[3].address, users[2].address)).to.equal(0);
    });
    it("allows getRemainingOperatorApprovalTime to correctly return non-0 number as remaining time if Purgatory time is complete", async function () {
      await users[3].Purgatory.setOptStatus(true, 600);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[3].TestERC1155.setApprovalForAll(users[2].address, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.Purgatory.getRemainingOperatorApprovalTime(deployer.TestERC1155.address, users[3].address, users[2].address)).to.not.equal(0);
    });
    it("allows getRemainingOperatorApprovalTime to correctly return 0 as remaining time if approval is expired", async function () {
      await users[3].Purgatory.setOptStatus(true, 600);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[3].TestERC1155.setApprovalForAll(users[2].address, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 650)]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.Purgatory.getRemainingOperatorApprovalTime(deployer.TestERC1155.address, users[3].address, users[2].address)).to.equal(0);
    });
    it("allows user to update their short-lived approval length", async function () {
      expect(await (await users[2].Purgatory.optStatus(users[2].address)).shortLivedApprovalLength).to.equal(0);
      await users[2].Purgatory.setShortLivedApprovalLength(200);
      expect(await (await users[2].Purgatory.optStatus(users[2].address)).shortLivedApprovalLength).to.equal(200);
    });
    it("allows user to opt out of short-lived approval by setting to 0", async function () {
      await deployer.TestERC1155.mint([1], [1], [users[2].address]);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setShortLivedApprovalLength(300);
      await users[2].Purgatory.setShortLivedApprovalLength(0);
      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + 500000000]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
      await users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x");
      expect(await users[2].TestERC1155.balanceOf(users[3].address, 1)).to.equal(1);
    });
    it("forbids user to set themselves as 2FA wallet approver", async function () {
      await expect(users[2].Purgatory.setTwoFactorWalletApprover(users[2].address, true, false, false)).to.be.revertedWithCustomError(deployer.Purgatory, "TwoFactorApproverSetToSelf");
    });
    it("forbids user to set approval status to already existing status for two-factor approver", async function () {
      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);
      await expect(users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false)).to.be.revertedWithCustomError(deployer.Purgatory, "ApprovalAlreadySetToSameStatus");

      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, false, false, false);
      await expect(users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, false, false, false)).to.be.revertedWithCustomError(deployer.Purgatory, "ApprovalAlreadySetToSameStatus");
    });
    it("forbids user to set approval status to already existing status for authorized recipients", async function () {
      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC1155.address, users[3].address, true);
      await expect(users[2].Purgatory.setApprovedRecipient(deployer.TestERC1155.address, users[3].address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "ApprovalAlreadySetToSameStatus");

      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC1155.address, users[3].address, false);
      await expect(users[2].Purgatory.setApprovedRecipient(deployer.TestERC1155.address, users[3].address, false)).to.be.revertedWithCustomError(deployer.Purgatory, "ApprovalAlreadySetToSameStatus");
    });
    it("forbids user to set approval status to already existing status for global authorized recipients", async function () {
      await users[2].Purgatory.setApprovedGlobalRecipient(users[3].address, true);
      await expect(users[2].Purgatory.setApprovedGlobalRecipient(users[3].address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "ApprovalAlreadySetToSameStatus");

      await users[2].Purgatory.setApprovedGlobalRecipient(users[3].address, false);
      await expect(users[2].Purgatory.setApprovedGlobalRecipient(users[3].address, false)).to.be.revertedWithCustomError(deployer.Purgatory, "ApprovalAlreadySetToSameStatus");
    });
    it("forbids user to set approval status to already existing status for opt status", async function () {
      await users[3].Purgatory.setOptStatus(true, 0);
      await expect(users[3].Purgatory.setOptStatus(true, 0)).to.be.revertedWithCustomError(deployer.Purgatory, "ApprovalAlreadySetToSameStatus");

      await users[3].Purgatory.setOptStatus(false, 0);
      await expect(users[3].Purgatory.setOptStatus(false, 0)).to.be.revertedWithCustomError(deployer.Purgatory, "ApprovalAlreadySetToSameStatus");
    });
    it("forbids user to set approval status to already existing status for already completed operator approval", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].TestERC1155.setApprovalForAll(users[4].address, true);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await expect(users[3].Purgatory.setApprovalForOperatorApproval(users[2].address, users[4].address, deployer.TestERC1155.address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "RequestAlreadyCompleted");
    });
    it("forbids user to set approval status to already existing status for already completed transfer recipient", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC1155.address, users[3].address, true);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await expect(users[3].Purgatory.setApprovalForTransferRecipient(users[2].address, users[3].address, deployer.TestERC1155.address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "RequestAlreadyCompleted");
    });
    it("forbids user to set approval status to already existing status for already completed global transfer recipient", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setApprovedGlobalRecipient(users[3].address, true);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await expect(users[3].Purgatory.setApprovalForGlobalTransferRecipient(users[2].address, users[3].address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "RequestAlreadyCompleted");
    });
    it("forbids 2FA wallet from deactivating lockdown mode unless request has been made by main wallet", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.toggleLockDownMode();
      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      // No request has been made to disable lockdown mode
      await expect(users[3].Purgatory.setApprovalForDeactivatingLockDown(users[2].address)).to.be.revertedWithCustomError(deployer.Purgatory, "RequestNotFound");
    });
    it("forbids 2FA wallet from approving operator unless request has been made by main wallet", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      // No request has been made to setApprovalForAll
      await expect(users[3].Purgatory.setApprovalForOperatorApproval(users[2].address, users[4].address, deployer.TestERC1155.address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "RequestNotFound");
    });
    it("forbids 2FA wallet from approving transfer recipient unless request has been made by main wallet", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      // No request has been made to setApprovalForAll
      await expect(users[3].Purgatory.setApprovalForTransferRecipient(users[2].address, users[4].address, deployer.TestERC1155.address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "RequestNotFound");
    });
    it("forbids 2FA wallet from approving global transfer recipient unless request has been made by main wallet", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      // No request has been made to setApprovalForAll
      await expect(users[3].Purgatory.setApprovalForGlobalTransferRecipient(users[2].address, users[4].address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "RequestNotFound");
    });
    it("forbids short-lived approval refresh if not fully validated or already expired approval (i.e. in Purgatory time or doesn't exist)", async function () {
      await users[2].Purgatory.setOptStatus(false, 0);
      await users[2].Purgatory.setOptStatus(true, 6000);

      // Still in Purgatory time
      await expect(users[2].Purgatory.refreshApproval(deployer.TestERC1155.address, users[4].address)).to.be.revertedWithCustomError(deployer.Purgatory, "RequestNotFullyCompleted");
      // Non-existent request
      await expect(users[2].Purgatory.refreshApproval(deployer.TestERC1155.address, users[3].address)).to.be.revertedWithCustomError(deployer.Purgatory, "RequestNotFullyCompleted");
    });
    it("forbids short-lived approval refresh if not expired", async function () {
      await users[2].Purgatory.setOptStatus(false, 0);
      await users[2].Purgatory.setOptStatus(true, 6000);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].TestERC1155.setApprovalForAll(users[4].address, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await expect(users[2].Purgatory.refreshApproval(deployer.TestERC1155.address, users[4].address)).to.be.revertedWithCustomError(deployer.Purgatory, "OperatorApprovalNotExpired");
    });
    it("forbids short-lived approval refresh if not enrolled in short-lived approvals", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].TestERC1155.setApprovalForAll(users[4].address, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await expect(users[2].Purgatory.refreshApproval(deployer.TestERC1155.address, users[4].address)).to.be.revertedWithCustomError(deployer.Purgatory, "ShortLivedApprovalsNotConfigured");
    });
    it("forbids short-lived approval refresh if collection not already approved or expired", async function () {
      await users[2].Purgatory.setOptStatus(false, 0);
      await users[2].Purgatory.setOptStatus(true, 30);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].TestERC1155.setApprovalForAll(users[4].address, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await expect(users[2].Purgatory.refreshApproval(deployer.TestERC1155.address, users[3].address)).to.be.revertedWithCustomError(deployer.Purgatory, "RequestNotFullyCompleted");
      await expect(users[2].Purgatory.refreshApproval(deployer.TestERC721A.address, users[4].address)).to.be.revertedWithCustomError(deployer.Purgatory, "RequestNotFullyCompleted");
    });
    it("forbids two factor wallet approval of non-existent request for operator approval", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, true, false, false);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);
      await expect(users[4].Purgatory.setApprovalForOperatorApproval(users[2].address, users[4].address, deployer.TestERC1155.address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "RequestNotFound");
      await expect(users[4].Purgatory.setApprovalForOperatorApproval(users[2].address, users[3].address, deployer.TestERC20.address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "RequestNotFound");
    })
    it("forbids two factor wallet approval of non-existent request for transfer recipient approval", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, true, false, false);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC1155.address, users[3].address, true);
      await expect(users[4].Purgatory.setApprovalForTransferRecipient(users[2].address, users[4].address, deployer.TestERC1155.address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "RequestNotFound");
      await expect(users[4].Purgatory.setApprovalForTransferRecipient(users[2].address, users[3].address, deployer.TestERC20.address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "RequestNotFound");
    })
    it("forbids two factor wallet approval of non-existent request for global transfer recipient approval", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, true, false, false);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setApprovedGlobalRecipient(users[3].address, true);
      await expect(users[4].Purgatory.setApprovalForGlobalTransferRecipient(users[2].address, users[4].address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "RequestNotFound");
    })
    it("forbids issue where old revoked (past purgatory time) 2FA approval can be instantly approved without purgatory state with approve then unapprove", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.twoFactorWalletApprovalStatus(users[2].address, users[4].address)).approvalStatus).to.equal(2);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, true, false, false);
      expect(await (await users[2].Purgatory.twoFactorWalletApprovalStatus(users[2].address, users[4].address)).approvalStatus).to.equal(1);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.twoFactorWalletApprovalStatus(users[2].address, users[4].address)).approvalStatus).to.equal(0);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, false, false, false);
      expect(await (await users[2].Purgatory.twoFactorWalletApprovalStatus(users[2].address, users[4].address)).approvalStatus).to.equal(0);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + ((purgatoryTimeInSeconds + 10) * 2)]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.twoFactorWalletApprovalStatus(users[2].address, users[4].address)).approvalStatus).to.equal(2);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, true, false, false);
      expect(await (await users[2].Purgatory.twoFactorWalletApprovalStatus(users[2].address, users[4].address)).approvalStatus).to.equal(1);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, false, false, false);
      expect(await (await users[2].Purgatory.twoFactorWalletApprovalStatus(users[2].address, users[4].address)).approvalStatus).to.equal(2);
    })
    it("forbids issue where old revoked (past purgatory time) transfer recipients can be instantly approved without purgatory state with approve then unapprove", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(2);
      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC1155.address, users[4].address, true);
      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(1);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(0);
      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC1155.address, users[4].address, false);
      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(0);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + ((purgatoryTimeInSeconds + 10) * 2)]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(2);
      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC1155.address, users[4].address, true);
      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(1);
      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC1155.address, users[4].address, false);
      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(2);
    })
    it("forbids issue where old revoked (past purgatory time) global transfer recipients can be instantly approved without purgatory state with approve then unapprove", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(2);
      await users[2].Purgatory.setApprovedGlobalRecipient(users[4].address, true);
      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(1);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(0);
      await users[2].Purgatory.setApprovedGlobalRecipient(users[4].address, false);
      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(0);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + ((purgatoryTimeInSeconds + 10) * 2)]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(2);
      await users[2].Purgatory.setApprovedGlobalRecipient(users[4].address, true);
      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(1);
      await users[2].Purgatory.setApprovedGlobalRecipient(users[4].address, false);
      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(2);
    })
    it("forbids issue where old revoked (past purgatory time) is not instantly enabled without purgatory state with approve then unapprove", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.lockDownStatus(users[2].address)).approvalStatus).to.equal(2);
      await users[2].Purgatory.toggleLockDownMode();
      expect(await (await users[2].Purgatory.lockDownStatus(users[2].address)).approvalStatus).to.equal(0);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.lockDownStatus(users[2].address)).approvalStatus).to.equal(0);
      await users[2].Purgatory.toggleLockDownMode();
      expect(await (await users[2].Purgatory.lockDownStatus(users[2].address)).approvalStatus).to.equal(0);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + ((purgatoryTimeInSeconds + 10) * 2)]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.lockDownStatus(users[2].address)).approvalStatus).to.equal(2);
      await users[2].Purgatory.toggleLockDownMode();
      expect(await (await users[2].Purgatory.lockDownStatus(users[2].address)).approvalStatus).to.equal(0);
      await users[2].Purgatory.toggleLockDownMode();
      expect(await (await users[2].Purgatory.lockDownStatus(users[2].address)).approvalStatus).to.equal(0);
    })
    it("forbids issue where approving, revoking, then approving again would bypass Purgatory state to revoke 2FA wallets sooner than Purgatory time", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.twoFactorWalletApprovalStatus(users[2].address, users[4].address)).approvalStatus).to.equal(2);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, true, false, false);
      expect(await (await users[2].Purgatory.twoFactorWalletApprovalStatus(users[2].address, users[4].address)).approvalStatus).to.equal(1);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.twoFactorWalletApprovalStatus(users[2].address, users[4].address)).approvalStatus).to.equal(0);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, false, false, false);
      expect(await (await users[2].Purgatory.twoFactorWalletApprovalStatus(users[2].address, users[4].address)).approvalStatus).to.equal(0);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, true, false, false);
      expect(await (await users[2].Purgatory.twoFactorWalletApprovalStatus(users[2].address, users[4].address)).approvalStatus).to.equal(0);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, false, false, false);
      expect(await (await users[2].Purgatory.twoFactorWalletApprovalStatus(users[2].address, users[4].address)).approvalStatus).to.equal(0);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + ((purgatoryTimeInSeconds + 10) * 2)]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.twoFactorWalletApprovalStatus(users[2].address, users[4].address)).approvalStatus).to.equal(2);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, true, false, false);
      expect(await (await users[2].Purgatory.twoFactorWalletApprovalStatus(users[2].address, users[4].address)).approvalStatus).to.equal(1);

    })
    it("forbids issue where approving, revoking, then approving again would bypass Purgatory state to revoke transfer recipients sooner than Purgatory time", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(2);
      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC1155.address, users[4].address, true);
      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(1);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(0);
      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC1155.address, users[4].address, false);
      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(0);
      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC1155.address, users[4].address, true);
      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(0);
      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC1155.address, users[4].address, false);
      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(0);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + ((purgatoryTimeInSeconds + 10) * 2)]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(2);
      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC1155.address, users[4].address, true);
      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(1);

    })
    it("forbids issue where approving, revoking, then approving again would bypass Purgatory state to revoke global transfer recipients sooner than Purgatory time", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(2);
      await users[2].Purgatory.setApprovedGlobalRecipient(users[4].address, true);
      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(1);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(0);
      await users[2].Purgatory.setApprovedGlobalRecipient(users[4].address, false);
      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(0);
      await users[2].Purgatory.setApprovedGlobalRecipient(users[4].address, true);
      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(0);
      await users[2].Purgatory.setApprovedGlobalRecipient(users[4].address, false);
      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(0);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + ((purgatoryTimeInSeconds + 10) * 2)]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(2);
      await users[2].Purgatory.setApprovedGlobalRecipient(users[4].address, true);
      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(1);
    })
    it("forbids 2FA approver from revoking already approved operators past Purgatory time from initial request", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.operatorApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(2);
      await users[2].TestERC1155.setApprovalForAll(users[4].address, true);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);
      expect(await (await users[2].Purgatory.operatorApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(1);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.operatorApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(0);
      await expect(users[3].Purgatory.setApprovalForOperatorApproval(users[2].address, users[4].address, deployer.TestERC1155.address, false)).to.be.revertedWithCustomError(deployer.Purgatory, "RequestAlreadyCompleted");
      expect(await (await users[2].Purgatory.operatorApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(0);
    })
    it("forbids 2FA approver from revoking already approved transfers past Purgatory time from initial request", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(2);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);
      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC1155.address, users[4].address, true);
      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(1);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(0);
      await expect(users[3].Purgatory.setApprovalForTransferRecipient(users[2].address, users[4].address, deployer.TestERC1155.address, false)).to.be.revertedWithCustomError(deployer.Purgatory, "RequestAlreadyCompleted");
      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(0);
    })
    it("forbids 2FA approver from revoking already approved global transfers past Purgatory time from initial request", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(2);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);
      await users[2].Purgatory.setApprovedGlobalRecipient(users[4].address, true);
      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(1);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(0);
      await expect(users[3].Purgatory.setApprovalForGlobalTransferRecipient(users[2].address, users[4].address, false)).to.be.revertedWithCustomError(deployer.Purgatory, "RequestAlreadyCompleted");
      expect(await (await users[2].Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[4].address)).approvalStatus).to.equal(0);
    })
    it("forbids short-lived approvals from being deactivated without Purgatory state completion", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.shortLivedApprovalStatus(users[2].address)).approvalStatus).to.equal(2);
      await users[2].Purgatory.setShortLivedApprovalLength(300);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.shortLivedApprovalStatus(users[2].address)).approvalStatus).to.equal(0);
      // Deactivate
      await users[2].Purgatory.setShortLivedApprovalLength(0);
      expect(await (await users[2].Purgatory.shortLivedApprovalStatus(users[2].address)).approvalStatus).to.equal(0);
    })
    it("forbids 2FA properties from being upgraded during revokal of 2FA wallet", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await users[2].Purgatory.twoFactorWalletApprovals(users[2].address, users[3].address)).canEnableLockDown).to.equal(false);
      expect(await (await users[2].Purgatory.twoFactorWalletApprovals(users[2].address, users[3].address)).isApprovedRecipient).to.equal(true);
      expect(await (await users[2].Purgatory.twoFactorWalletApprovals(users[2].address, users[3].address)).approved).to.equal(true);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, false, true, false);

      // Properties besides approved should not change
      expect(await (await users[2].Purgatory.twoFactorWalletApprovals(users[2].address, users[3].address)).canEnableLockDown).to.equal(false);
      expect(await (await users[2].Purgatory.twoFactorWalletApprovals(users[2].address, users[3].address)).isApprovedRecipient).to.equal(true);
      expect(await (await users[2].Purgatory.twoFactorWalletApprovals(users[2].address, users[3].address)).approved).to.equal(false);
    })
    it("allows shortLivedApprovalLength true value only be active after Purgatory state is complete via setter function (purgatoryTime value used if in purgatory state)", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);
      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setShortLivedApprovalLength(5000000);

      // Short-lived approval length defaults to Purgatory time while in Purgatory state
      expect(await users[3].Purgatory.getRemainingOperatorApprovalTime(deployer.TestERC1155.address, users[2].address, users[3].address)).to.equal(purgatoryTimeInSeconds - 10);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + ((purgatoryTimeInSeconds + 10) * 2)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[3].Purgatory.getRemainingOperatorApprovalTime(deployer.TestERC1155.address, users[2].address, users[3].address)).to.be.greaterThan(5000);
    })
    it("allows shortLivedApprovalLength true value to only be active after Purgatory state is complete via opt-in function (purgatoryTime value used if in purgatory state)", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);
      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setOptStatus(false, 5000000);
      await users[2].Purgatory.setOptStatus(true, 5000000);

      // Short-lived approval length defaults to Purgatory time while in Purgatory state
      expect(await users[2].Purgatory.getRemainingOperatorApprovalTime(deployer.TestERC1155.address, users[2].address, users[3].address)).to.be.greaterThan(purgatoryTimeInSeconds - 100);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + ((purgatoryTimeInSeconds + 10) * 2)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].Purgatory.getRemainingOperatorApprovalTime(deployer.TestERC1155.address, users[2].address, users[3].address)).to.be.greaterThan(5000);
    })
    it("forbids shortLivedApprovalLength from being updated until Purgatory state is complete", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setShortLivedApprovalLength(5000000);
      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      let firstValue = await users[3].Purgatory.getRemainingOperatorApprovalTime(deployer.TestERC1155.address, users[2].address, users[3].address);
      await users[2].Purgatory.setShortLivedApprovalLength(100000000);

      let secondValue = await users[3].Purgatory.getRemainingOperatorApprovalTime(deployer.TestERC1155.address, users[2].address, users[3].address);
      expect(firstValue == secondValue);
    })
    it("forbids updating 2FA attributes when already approved through Purgatory state via unapprove then approve while updating attributes", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, true, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await (await deployer.Purgatory.twoFactorWalletApprovalStatus(users[2].address, users[3].address)).approvalStatus).to.equal(0);
      expect(await (await deployer.Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[3].address)).approvalStatus).to.equal(0);
      expect(await (await deployer.Purgatory.twoFactorWalletApprovalStatus(users[2].address, users[3].address)).timeRemaining).to.equal(0);
      expect(await (await deployer.Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[3].address)).timeRemaining).to.equal(0);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, false, false, false);

      expect(await (await deployer.Purgatory.twoFactorWalletApprovalStatus(users[2].address, users[3].address)).approvalStatus).to.equal(0);
      expect(await (await deployer.Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[3].address)).approvalStatus).to.equal(0);
      expect(await (await deployer.Purgatory.twoFactorWalletApprovalStatus(users[2].address, users[3].address)).timeRemaining).to.not.equal(0);
      expect(await (await deployer.Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[3].address)).timeRemaining).to.not.equal(0);

      expect(await (await deployer.Purgatory.twoFactorWalletApprovals(users[2].address, users[3].address)).canEnableLockDown).to.equal(true);
      expect(await (await deployer.Purgatory.twoFactorWalletApprovals(users[2].address, users[3].address)).isApprovedRecipient).to.equal(true);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);

      expect(await (await deployer.Purgatory.twoFactorWalletApprovalStatus(users[2].address, users[3].address)).approvalStatus).to.equal(0);
      expect(await (await deployer.Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[3].address)).approvalStatus).to.equal(0);
      expect(await (await deployer.Purgatory.twoFactorWalletApprovalStatus(users[2].address, users[3].address)).timeRemaining).to.equal(0);
      expect(await (await deployer.Purgatory.transferRecipientApprovalStatus(deployer.TestERC1155.address, users[2].address, users[3].address)).timeRemaining).to.equal(0);

      expect(await (await deployer.Purgatory.twoFactorWalletApprovals(users[2].address, users[3].address)).canEnableLockDown).to.equal(true);
      expect(await (await deployer.Purgatory.twoFactorWalletApprovals(users[2].address, users[3].address)).isApprovedRecipient).to.equal(true);
    })
  });

  // ------------------------------------- Purgatory ERC1155 ---------------------------------------

  describe("Purgatory ERC1155 tests", async function () {
    it("allows minting of tokens without Purgatory blocking/reverting", async function () {
      await deployer.TestERC1155.mint([1], [1], [users[2].address]);
      expect(await deployer.TestERC1155.balanceOf(users[2].address, 1)).to.equal(1);
    })
    it("forbids transfer by approved operator within purgatory time", async function () {
      await deployer.TestERC1155.mint([1], [1], [users[2].address]);
      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);

      await expect(users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x")).to.be.rejectedWith("ERC1155: caller is not token owner nor approved");
    })
    it("allows transfer by approved operator after purgatory time is complete", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await deployer.TestERC1155.mint([1], [1], [users[2].address]);
      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
      await users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x");
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(1);
    })
    it("allows instant removal of approval status (without purgatory time) when setApprovalForAll is revoked", async function () {
      await deployer.TestERC1155.mint([2], [1], [users[2].address]);
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC1155.isApprovedForAll(users[2].address, users[3].address)).to.equal(true);
      expect((await deployer.Purgatory.approvals(deployer.TestERC1155.address, users[2].address, users[3].address)).approved).to.equal(true);
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
      expect(await users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x"));
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(1);

      await users[2].TestERC1155.setApprovalForAll(users[3].address, false);
      expect(await deployer.TestERC1155.isApprovedForAll(users[2].address, users[3].address)).to.equal(false);
      expect((await deployer.Purgatory.approvals(deployer.TestERC1155.address, users[2].address, users[3].address)).approved).to.equal(false);
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(1);
      await expect(users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x")).to.be.rejectedWith("ERC1155: caller is not token owner nor approved");
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(1);
    })
    // TRANSFER TESTS
    it("allows transfer to approved recipient after purgatory time is complete", async function () {
      await deployer.TestERC1155.mint([1], [1], [users[2].address]);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);
      
      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      
      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC1155.address, users[3].address, true);
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);
      
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
      await users[2].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x");
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(1);
    })
    it("forbids transfer to recipient within purgatory time", async function () {
      await deployer.TestERC1155.mint([1], [1], [users[2].address]);
      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC1155.address, users[3].address, true);

      await expect(users[2].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x")).to.be.revertedWithCustomError(deployer.Purgatory, "UnauthorizedTransferRecipient");
    })
    it("forbids bypassing with unapproved recipient by setting then revoking to bypass griefing protection for 0 timestamp on recently revoked recipients", async function () {
      await deployer.TestERC1155.mint([2], [1], [users[2].address]);
      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC1155.address, users[3].address, true);
      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC1155.address, users[3].address, false);
      
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
      await expect(users[2].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x")).to.be.revertedWithCustomError(deployer.Purgatory, "UnauthorizedTransferRecipient");
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
    })
    it("allows transfer to approved global recipient after purgatory time is complete", async function () {
      await deployer.TestERC1155.mint([1], [1], [users[2].address]);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);
      
      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      
      await users[2].Purgatory.setApprovedGlobalRecipient(users[3].address, true);
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);
      
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
      await users[2].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x");
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(1);
    })
    it("forbids transfer to global recipient within purgatory time", async function () {
      await deployer.TestERC1155.mint([1], [1], [users[2].address]);
      await users[2].Purgatory.setApprovedGlobalRecipient(users[3].address, true);
      await expect(users[2].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x")).to.be.revertedWithCustomError(deployer.Purgatory, "UnauthorizedTransferRecipient");
    })
    it("forbids bypassing with unapproved global recipient by setting then revoking to bypass griefing protection for 0 timestamp on recently revoked global recipients", async function () {
      await deployer.TestERC1155.mint([2], [1], [users[2].address]);
      await users[2].Purgatory.setApprovedGlobalRecipient(users[3].address, true);
      await users[2].Purgatory.setApprovedGlobalRecipient(users[3].address, false);
      
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
      await expect(users[2].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x")).to.be.revertedWithCustomError(deployer.Purgatory, "UnauthorizedTransferRecipient");
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
    })
    it("forbids bypassing with unapproved operator by setting then revoking to bypass griefing protection for 0 timestamp on recently revoked operators", async function () {
      await deployer.TestERC1155.mint([2], [1], [users[2].address]);
      await users[2].TestERC1155.setApprovalForAll(users[4].address, true);
      await users[2].TestERC1155.setApprovalForAll(users[4].address, false);
      
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
      await expect(users[4].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x")).to.be.rejectedWith("ERC1155: caller is not token owner nor approved");
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
    })
    it("forbids bypassing with unapproved two factor wallet approver by setting then revoking to bypass griefing protection for 0 timestamp on recently revoked approvers", async function () {
      await deployer.TestERC1155.mint([2], [1], [users[2].address]);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, false, false, false);
      await users[2].TestERC1155.setApprovalForAll(users[4].address, false);
      
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
      await expect(users[3].Purgatory.setApprovalForOperatorApproval(users[2].address, users[4].address, deployer.TestERC1155.address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "Unauthorized");
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
    })
    it("forbids bypassing with unapproved two factor wallet approver by double revoking an approved approver to bypass griefing protection for 0 timestamp on recently revoked approvers", async function () {
      await deployer.TestERC1155.mint([2], [1], [users[2].address]);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);
      
      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      
      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, false, false, false);
      await users[2].TestERC1155.setApprovalForAll(users[4].address, false);
      
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
      await expect(users[3].Purgatory.setApprovalForOperatorApproval(users[2].address, users[4].address, deployer.TestERC1155.address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "RequestNotFound");
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
    })
    it("forbids approval in lock down mode", async function () {
      await users[2].Purgatory.toggleLockDownMode();
      await expect(users[2].TestERC1155.setApprovalForAll(users[3].address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "LockDownModeEnabled");
    })
    it("forbids transfer in lock down mode", async function () {
      await deployer.TestERC1155.mint([2], [1], [users[2].address]);
      await users[2].Purgatory.toggleLockDownMode();
      await expect(users[2].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x")).to.be.revertedWithCustomError(deployer.Purgatory, "LockDownModeEnabled");
    })
    it("forbids isApprovedForAll from being true when in lock down mode", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await deployer.TestERC1155.mint([1], [1], [users[2].address]);
      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);
      expect(await users[2].TestERC1155.isApprovedForAll(users[2].address, users[3].address)).to.equal(true);

      await users[2].Purgatory.toggleLockDownMode();
      expect(await users[2].TestERC1155.isApprovedForAll(users[2].address, users[3].address)).to.equal(false);
    })
    it("allows temporary approval to be valid during approval length", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await deployer.TestERC1155.mint([2], [1], [users[2].address]);
      await users[2].Purgatory.setOptStatus(false, 0);
      await users[2].Purgatory.setOptStatus(true, 600);
      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      let newTime = 1663122559 + (purgatoryTimeInSeconds + 10);
      await ethers.provider.send("evm_setNextBlockTimestamp", [newTime]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
      await users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x");
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(1);
    })
    it("allows temporary approval to be EXPIRED after approval length is complete", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await deployer.TestERC1155.mint([2], [1], [users[2].address]);
      await users[2].Purgatory.setOptStatus(false, 0);
      await users[2].Purgatory.setOptStatus(true, 600);
      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      let newTime = 1663122559 + (purgatoryTimeInSeconds + 10);
      await ethers.provider.send("evm_setNextBlockTimestamp", [newTime]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
      await users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x");
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(1);

      newTime = newTime + (600 + 10);
      await ethers.provider.send("evm_setNextBlockTimestamp", [newTime]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(1);
      await expect(users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x")).to.be.rejectedWith("ERC1155: caller is not token owner nor approved");
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(1);
    })
    it("allows temporary approval to be refreshed after approval length is complete and is valid again", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await deployer.TestERC1155.mint([2], [1], [users[2].address]);
      await users[2].Purgatory.setOptStatus(false, 0);
      await users[2].Purgatory.setOptStatus(true, 600);
      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      let newTime = 1663122559 + (purgatoryTimeInSeconds + 10);
      await ethers.provider.send("evm_setNextBlockTimestamp", [newTime]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
      await users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x");
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(1);

      newTime = newTime + (600 + 10);
      await ethers.provider.send("evm_setNextBlockTimestamp", [newTime]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(1);
      await expect(users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x")).to.be.rejectedWith("ERC1155: caller is not token owner nor approved");
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(1);

      await users[2].Purgatory.refreshApproval(deployer.TestERC1155.address, users[3].address);
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(1);
      await users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x");
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(2);
    })
    it("allows transfer to 2FA wallet marked as approved recipient", async function () {
      await deployer.TestERC1155.mint([1], [1], [users[2].address]);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, true, false, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC1155.balanceOf(users[4].address, 1)).to.equal(0);
      await users[2].TestERC1155.safeTransferFrom(users[2].address, users[4].address, 1, 1, "0x");
      expect(await deployer.TestERC1155.balanceOf(users[4].address, 1)).to.equal(1);
    })
    it("forbids transfer to 2FA wallet NOT marked as approved recipient", async function () {
      await deployer.TestERC1155.mint([1], [1], [users[2].address]);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, true, false, false);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await expect(users[2].TestERC1155.safeTransferFrom(users[2].address, users[4].address, 1, 1, "0x")).to.be.revertedWithCustomError(deployer.Purgatory, "UnauthorizedTransferRecipient");
    })
    it("forbids transfer to 2FA wallet marked as approved recipient but without completed Purgatory state", async function () {
      await deployer.TestERC1155.mint([1], [1], [users[2].address]);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, true, false, true);
      await expect(users[2].TestERC1155.safeTransferFrom(users[2].address, users[4].address, 1, 1, "0x")).to.be.revertedWithCustomError(deployer.Purgatory, "UnauthorizedTransferRecipient");
    })
    it("allows opting into short-lived approvals to invalidate existing approvals if past short-lived approval time", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);
      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC1155.isApprovedForAll(users[2].address, users[3].address)).to.equal(true);
      await users[2].Purgatory.setShortLivedApprovalLength(600);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + ((purgatoryTimeInSeconds + 10) * 2)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC1155.isApprovedForAll(users[2].address, users[3].address)).to.equal(false);
    });
    it("allows deployer to update the Purgatory address", async function () {
      await deployer.TestERC1155.setPurgatoryAddress(users[2].address);
    })
    it("forbids non-deployer to update the Purgatory address", async function () {
      await expect(users[2].TestERC1155.setPurgatoryAddress(users[2].address)).to.be.revertedWithCustomError(deployer.Purgatory, "Unauthorized");
    })
    it("forbids deployer from update the Purgatory address after locking", async function () {
      await deployer.TestERC1155.lockPurgatoryContract();
      await expect(deployer.TestERC1155.setPurgatoryAddress(users[2].address)).to.be.revertedWithCustomError(deployer.TestERC1155, "ContractLocked");
    })
    it("allows burning of tokens to not be impacted by Purgatory checks", async function () {
      await deployer.TestERC1155Burnable.mint([1], [1], [users[2].address]);
      expect(await deployer.TestERC1155Burnable.balanceOf(users[2].address, 1)).to.equal(1);

      await expect(users[2].TestERC1155Burnable.burn(users[2].address, 1, 1)).to.not.be.revertedWithCustomError(deployer.Purgatory, "UnauthorizedTransferRecipient");
      expect(await deployer.TestERC1155Burnable.balanceOf(users[2].address, 1)).to.equal(0);
    })
    it("forbids burning of tokens when in lockdown mode", async function () {
      await deployer.TestERC1155Burnable.mint([1], [1], [users[2].address]);
      expect(await deployer.TestERC1155Burnable.balanceOf(users[2].address, 1)).to.equal(1);

      await users[2].Purgatory.toggleLockDownMode();

      await expect(users[2].TestERC1155Burnable.burn(users[2].address, 1, 1)).to.be.revertedWithCustomError(deployer.Purgatory, "LockDownModeEnabled");
      expect(await deployer.TestERC1155Burnable.balanceOf(users[2].address, 1)).to.equal(1);
    })
    it("allows minting of tokens when in lockdown mode", async function () {
      await users[2].Purgatory.toggleLockDownMode();
      expect(await deployer.Purgatory.isLockedDown(users[2].address)).to.equal(true);

      expect(await deployer.TestERC1155Burnable.balanceOf(users[2].address, 1)).to.equal(0);
      await deployer.TestERC1155Burnable.mint([1], [1], [users[2].address]);
      expect(await deployer.TestERC1155Burnable.balanceOf(users[2].address, 1)).to.equal(1);
    })
    it("requires re-approval for approval that was set when user was opted out", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);
            
      await deployer.TestERC1155.mint([2], [1], [users[3].address]);
      await users[3].TestERC1155.setApprovalForAll(users[2].address, true);

      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(2);
      await users[2].TestERC1155.safeTransferFrom(users[3].address, users[2].address, 1, 1, "0x");
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(1);

      // Opt in
      await users[3].Purgatory.setOptStatus(true, 0);

      await expect(users[2].TestERC1155.safeTransferFrom(users[3].address, users[2].address, 1, 1, "0x")).to.be.rejectedWith("ERC1155: caller is not token owner nor approved");
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(1);

      await users[3].TestERC1155.setApprovalForAll(users[2].address, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await users[2].TestERC1155.safeTransferFrom(users[3].address, users[2].address, 1, 1, "0x");
      expect(await deployer.TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
    })
    it("requires re-approval for approval that was set when collection was un-enrolled", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);
      
      // Un-enroll collection
      await deployer.Purgatory.toggleCollectionEnroll(deployer.TestERC1155.address);

      await deployer.TestERC1155.mint([2], [1], [users[2].address]);
      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);

      expect(await deployer.TestERC1155.balanceOf(users[2].address, 1)).to.equal(2);
      await users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x");
      expect(await deployer.TestERC1155.balanceOf(users[2].address, 1)).to.equal(1);

      // Enroll the collection
      await deployer.Purgatory.toggleCollectionEnroll(deployer.TestERC1155.address);
      await expect(users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x")).to.be.rejectedWith("ERC1155: caller is not token owner nor approved");
      expect(await deployer.TestERC1155.balanceOf(users[2].address, 1)).to.equal(1);

      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x");
      expect(await deployer.TestERC1155.balanceOf(users[2].address, 1)).to.equal(0);
    })
    it("forbids approval from being valid after short-lived approval has expired", async function () {
      await deployer.TestERC1155.mint([2], [1], [users[2].address]);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setShortLivedApprovalLength(300);
      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC1155.isApprovedForAll(users[2].address, users[3].address)).to.equal(true);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10 + 500)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC1155.isApprovedForAll(users[2].address, users[3].address)).to.equal(false);
      await expect(users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x")).to.be.rejectedWith("ERC1155: caller is not token owner nor approved");
    });
    it("allows setApprovalForAll from being called again if approval is expired without throwing AlreadyApproved() error", async function () {
      await deployer.TestERC1155.mint([2], [1], [users[2].address]);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setShortLivedApprovalLength(300);
      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC1155.isApprovedForAll(users[2].address, users[3].address)).to.equal(true);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10 + 500)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC1155.isApprovedForAll(users[2].address, users[3].address)).to.equal(false);
      await expect(users[2].TestERC1155.setApprovalForAll(users[3].address, true)).to.not.be.revertedWithCustomError(deployer.Purgatory, "AlreadyApproved");
    });
    it("forbids expired short-lived approvals renew until Purgatory state is complete when short-lived approvals are deactivated", async function () {
      await deployer.TestERC1155.mint([2], [1], [users[2].address]);
      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setShortLivedApprovalLength(300);
      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC1155.isApprovedForAll(users[2].address, users[3].address)).to.equal(true);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + ((purgatoryTimeInSeconds + 310) * 2)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC1155.isApprovedForAll(users[2].address, users[3].address)).to.equal(false);

      expect(await users[3].TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
      await expect(users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x")).to.be.rejectedWith("ERC1155: caller is not token owner nor approved");
      expect(await users[3].TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);

      // Deactivating short-lived approvals should not renew expired approvals unless Purgatory state is complete
      await users[2].Purgatory.setShortLivedApprovalLength(0);
      expect(await users[3].TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
      await expect(users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x")).to.be.rejectedWith("ERC1155: caller is not token owner nor approved");
      expect(await users[3].TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
    });
    it("allows still valid short-lived approvals to remain valid while Purgatory state is pending when short-lived approvals are deactivated", async function () {
      await deployer.TestERC1155.mint([2], [1], [users[2].address]);
      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setShortLivedApprovalLength(300);
      await users[2].TestERC1155.setApprovalForAll(users[3].address, true);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[3].TestERC1155.balanceOf(users[3].address, 1)).to.equal(0);
      await users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x");
      expect(await users[3].TestERC1155.balanceOf(users[3].address, 1)).to.equal(1);

      // Deactivating short-lived approvals should not renew expired approvals unless Purgatory state is complete
      await users[2].Purgatory.setShortLivedApprovalLength(0);
      expect(await users[3].TestERC1155.balanceOf(users[3].address, 1)).to.equal(1);
      await users[3].TestERC1155.safeTransferFrom(users[2].address, users[3].address, 1, 1, "0x");
      expect(await users[3].TestERC1155.balanceOf(users[3].address, 1)).to.equal(2);
    });
  });

  // ------------------------------------- Purgatory ERC721 ---------------------------------------

  describe("Purgatory ERC721 tests", async function () {
    it("allows minting of tokens without Purgatory blocking/reverting", async function () {
      await deployer.TestERC721A.mint([1], users[2].address);
      expect(await deployer.TestERC721A.balanceOf(users[2].address)).to.equal(1);
    })
    it("forbids transfer by approved operator via setApprovalForAll within purgatory time", async function () {
      await deployer.TestERC721A.mint([1], users[2].address);
      await users[2].TestERC721A.setApprovalForAll(users[3].address, true);

      await expect(users[3].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 1)).to.be.revertedWithCustomError(deployer.TestERC721A, "TransferCallerNotOwnerNorApproved");
    })
    it("forbids transfer by approved operator via approve within purgatory time", async function () {
      await deployer.TestERC721A.mint([1], users[2].address);
      await users[2].TestERC721A.approve(users[3].address, 1);

      await expect(users[3].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 1)).to.be.revertedWithCustomError(deployer.Purgatory, "UnauthorizedOperatorApproval");
    })
    it("allows transfer by approved operator via setApprovalForAll after purgatory time is complete", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await deployer.TestERC721A.mint(1, users[2].address);
      await users[2].TestERC721A.setApprovalForAll(users[3].address, true);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(0);
      await users[3].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 1);
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(1);
    })
    it("allows transfer by approved operator via approve after purgatory time is complete", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await deployer.TestERC721A.mint(1, users[2].address);
      await users[2].TestERC721A.approve(users[3].address, 1);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(0);
      await users[3].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 1);
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(1);
    })
    it("allows correct getApproved return value for approvals made via approve before and after purgatory time is complete", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await deployer.TestERC721A.mint(1, users[2].address);
      await users[2].TestERC721A.approve(users[3].address, 1);

      expect(await users[2].TestERC721A.getApproved(1)).to.equal("0x0000000000000000000000000000000000000000");

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(0);
      expect(await users[2].TestERC721A.getApproved(1)).to.equal(users[3].address);
      await users[3].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 1);
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(1);
    })
    it("allows instant removal of approval status (without purgatory time) when setApprovalForAll is revoked", async function () {
      await deployer.TestERC721A.mint(2, users[2].address);
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].TestERC721A.setApprovalForAll(users[3].address, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC721A.isApprovedForAll(users[2].address, users[3].address)).to.equal(true);
      expect((await deployer.Purgatory.approvals(deployer.TestERC721A.address, users[2].address, users[3].address)).approved).to.equal(true);
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(0);
      expect(await users[3].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 1));
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(1);

      await users[2].TestERC721A.setApprovalForAll(users[3].address, false);
      expect(await deployer.TestERC721A.isApprovedForAll(users[2].address, users[3].address)).to.equal(false);
      expect((await deployer.Purgatory.approvals(deployer.TestERC721A.address, users[2].address, users[3].address)).approved).to.equal(false);
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(1);
      await expect(users[3].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 2)).to.be.revertedWithCustomError(deployer.TestERC721A, "TransferCallerNotOwnerNorApproved");
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(1);
    })
    it("allows instant removal of approval status (without purgatory time) when approve is revoked", async function () {
      await deployer.TestERC721A.mint(2, users[2].address);
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].TestERC721A.approve(users[3].address, 1);
      expect(await users[2].TestERC721A.getApproved(1)).to.equal("0x0000000000000000000000000000000000000000");

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC721A.getApproved(1)).to.equal(users[3].address);
      expect(await deployer.TestERC721A.isApprovedForAll(users[2].address, users[3].address)).to.equal(false);
      expect((await deployer.Purgatory.approvals(deployer.TestERC721A.address, users[2].address, users[3].address)).approved).to.equal(true);

      await users[2].TestERC721A.approve("0x0000000000000000000000000000000000000000", 1);
      expect(await users[2].TestERC721A.getApproved(1)).to.equal("0x0000000000000000000000000000000000000000");

      expect(await deployer.TestERC721A.isApprovedForAll(users[2].address, users[3].address)).to.equal(false);
      expect((await deployer.Purgatory.approvals(deployer.TestERC721A.address, users[2].address, users[3].address)).approved).to.equal(false);

      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(0);
      await expect(users[3].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 2)).to.be.revertedWithCustomError(deployer.TestERC721A, "TransferCallerNotOwnerNorApproved");
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(0);
    })
    it("allows instant removal of pending approval status when approve is revoked", async function () {
      await deployer.TestERC721A.mint(2, users[2].address);
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].TestERC721A.approve(users[3].address, 1);
      expect(await users[2].TestERC721A.getApproved(1)).to.equal("0x0000000000000000000000000000000000000000");
      expect((await deployer.Purgatory.approvals(deployer.TestERC721A.address, users[2].address, users[3].address)).approved).to.equal(true);

      await users[2].TestERC721A.approve("0x0000000000000000000000000000000000000000", 1);
      expect(await users[2].TestERC721A.getApproved(1)).to.equal("0x0000000000000000000000000000000000000000");
      expect((await deployer.Purgatory.approvals(deployer.TestERC721A.address, users[2].address, users[3].address)).approved).to.equal(false);

      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(0);
      await expect(users[3].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 2)).to.be.revertedWithCustomError(deployer.TestERC721A, "TransferCallerNotOwnerNorApproved");
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(0);
    })
    // TRANSFER TESTS
    it("allows transfer to approved recipient after purgatory time is complete", async function () {
      await deployer.TestERC721A.mint(1, users[2].address);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);
      
      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      
      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC721A.address, users[3].address, true);
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);
      
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(0);
      await users[2].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 1);
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(1);
    })
    it("forbids transfer to recipient within purgatory time", async function () {
      await deployer.TestERC721A.mint(1, users[2].address);
      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC721A.address, users[3].address, true);

      await expect(users[2].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 1)).to.be.revertedWithCustomError(deployer.Purgatory, "UnauthorizedTransferRecipient");
    })
    it("forbids bypassing with unapproved recipient by setting then revoking to bypass griefing protection for 0 timestamp on recently revoked recipients", async function () {
      await deployer.TestERC721A.mint(2, users[2].address);
      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC721A.address, users[3].address, true);
      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC721A.address, users[3].address, false);
      
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(0);
      await expect(users[2].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 1)).to.be.revertedWithCustomError(deployer.Purgatory, "UnauthorizedTransferRecipient");
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(0);
    })
    it("allows transfer to approved global recipient after purgatory time is complete", async function () {
      await deployer.TestERC721A.mint(1, users[2].address);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);
      
      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      
      await users[2].Purgatory.setApprovedGlobalRecipient(users[3].address, true);
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);
      
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(0);
      await users[2].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 1);
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(1);
    })
    it("forbids transfer to global recipient within purgatory time", async function () {
      await deployer.TestERC721A.mint(1, users[2].address);
      await users[2].Purgatory.setApprovedGlobalRecipient(users[3].address, true);
      await expect(users[2].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 1)).to.be.revertedWithCustomError(deployer.Purgatory, "UnauthorizedTransferRecipient");
    })
    it("forbids bypassing with unapproved global recipient by setting then revoking to bypass griefing protection for 0 timestamp on recently revoked global recipients", async function () {
      await deployer.TestERC721A.mint(2, users[2].address);
      await users[2].Purgatory.setApprovedGlobalRecipient(users[3].address, true);
      await users[2].Purgatory.setApprovedGlobalRecipient(users[3].address, false);
      
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(0);
      await expect(users[2].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 1)).to.be.revertedWithCustomError(deployer.Purgatory, "UnauthorizedTransferRecipient");
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(0);
    })
    it("forbids bypassing with unapproved operator by setting then revoking to bypass griefing protection for 0 timestamp on recently revoked operators", async function () {
      await deployer.TestERC721A.mint(2, users[2].address);
      await users[2].TestERC721A.setApprovalForAll(users[4].address, true);
      await users[2].TestERC721A.setApprovalForAll(users[4].address, false);
      
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(0);
      await expect(users[4].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 1)).to.be.revertedWithCustomError(deployer.TestERC721A, "TransferCallerNotOwnerNorApproved");
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(0);
    })
    it("forbids bypassing with unapproved two factor wallet approver by setting then revoking to bypass griefing protection for 0 timestamp on recently revoked approvers", async function () {
      await deployer.TestERC721A.mint(2, users[2].address);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, false, false, false);
      await users[2].TestERC721A.setApprovalForAll(users[4].address, false);
      
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(0);
      await expect(users[3].Purgatory.setApprovalForOperatorApproval(users[2].address, users[4].address, deployer.TestERC721A.address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "Unauthorized");
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(0);
    })
    it("forbids bypassing with unapproved two factor wallet approver by double revoking an approved approver to bypass griefing protection for 0 timestamp on recently revoked approvers", async function () {
      await deployer.TestERC721A.mint(2, users[2].address);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);
      
      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      
      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, false, false, false);
      await users[2].TestERC721A.setApprovalForAll(users[4].address, false);
      
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(0);
      await expect(users[3].Purgatory.setApprovalForOperatorApproval(users[2].address, users[4].address, deployer.TestERC721A.address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "RequestNotFound");
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(0);
    })
    it("forbids approval in lock down mode", async function () {
      await users[2].Purgatory.toggleLockDownMode();
      await expect(users[2].TestERC721A.setApprovalForAll(users[3].address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "LockDownModeEnabled");
    })
    it("forbids transfer in lock down mode", async function () {
      await deployer.TestERC721A.mint(2, users[2].address);
      await users[2].Purgatory.toggleLockDownMode();
      await expect(users[2].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 1)).to.be.revertedWithCustomError(deployer.Purgatory, "LockDownModeEnabled");
    })
    it("forbids isApprovedForAll from being true when in lock down mode", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await deployer.TestERC721A.mint(1, users[2].address);
      await users[2].TestERC721A.setApprovalForAll(users[3].address, true);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);
      expect(await users[2].TestERC721A.isApprovedForAll(users[2].address, users[3].address)).to.equal(true);

      await users[2].Purgatory.toggleLockDownMode();
      expect(await users[2].TestERC721A.isApprovedForAll(users[2].address, users[3].address)).to.equal(false);
    })
    it("allows temporary approval to be valid during approval length", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await deployer.TestERC721A.mint(2, users[2].address);
      await users[2].Purgatory.setOptStatus(false, 0);
      await users[2].Purgatory.setOptStatus(true, 600);
      await users[2].TestERC721A.setApprovalForAll(users[3].address, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      let newTime = 1663122559 + (purgatoryTimeInSeconds + 10);
      await ethers.provider.send("evm_setNextBlockTimestamp", [newTime]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(0);
      await users[3].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 1);
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(1);
    })
    it("allows temporary approval to be EXPIRED after approval length is complete", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await deployer.TestERC721A.mint(2, users[2].address);
      await users[2].Purgatory.setOptStatus(false, 0);
      await users[2].Purgatory.setOptStatus(true, 600);
      await users[2].TestERC721A.setApprovalForAll(users[3].address, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      let newTime = 1663122559 + (purgatoryTimeInSeconds + 10);
      await ethers.provider.send("evm_setNextBlockTimestamp", [newTime]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(0);
      await users[3].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 1);
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(1);

      newTime = newTime + (600 + 10);
      await ethers.provider.send("evm_setNextBlockTimestamp", [newTime]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(1);
      await expect(users[3].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 2)).to.be.revertedWithCustomError(deployer.TestERC721A, "TransferCallerNotOwnerNorApproved");
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(1);
    })
    it("allows temporary approval to be refreshed after approval length is complete and is valid again", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await deployer.TestERC721A.mint(3, users[2].address);
      await users[2].Purgatory.setOptStatus(false, 0);
      await users[2].Purgatory.setOptStatus(true, 600);
      await users[2].TestERC721A.setApprovalForAll(users[3].address, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      let newTime = 1663122559 + (purgatoryTimeInSeconds + 10);
      await ethers.provider.send("evm_setNextBlockTimestamp", [newTime]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(0);
      await users[3].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 1);
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(1);

      newTime = newTime + (600 + 10);
      await ethers.provider.send("evm_setNextBlockTimestamp", [newTime]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(1);
      await expect(users[3].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 2)).to.be.revertedWithCustomError(deployer.TestERC721A, "TransferCallerNotOwnerNorApproved");
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(1);

      await users[2].Purgatory.refreshApproval(deployer.TestERC721A.address, users[3].address);
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(1);
      await users[3].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 3);
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(2);
    })
    it("allows transfer to 2FA wallet marked as approved recipient", async function () {
      await deployer.TestERC721A.mint(1, users[2].address);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, true, false, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC721A.balanceOf(users[4].address)).to.equal(0);
      await users[2].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[4].address, 1);
      expect(await deployer.TestERC721A.balanceOf(users[4].address)).to.equal(1);
    })
    it("forbids transfer to 2FA wallet NOT marked as approved recipient", async function () {
      await deployer.TestERC721A.mint(1, users[2].address);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, true, false, false);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await expect(users[2].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[4].address, 1)).to.be.revertedWithCustomError(deployer.Purgatory, "UnauthorizedTransferRecipient");
    })
    it("forbids transfer to 2FA wallet marked as approved recipient but without completed Purgatory state", async function () {
      await deployer.TestERC721A.mint(1, users[2].address);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, true, false, true);
      await expect(users[2].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[4].address, 1)).to.be.revertedWithCustomError(deployer.Purgatory, "UnauthorizedTransferRecipient");
    })
    it("allows opting into short-lived approvals to invalidate existing approvals if past short-lived approval time", async function () {
      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);    

      await users[2].TestERC721A.setApprovalForAll(users[3].address, true);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC721A.isApprovedForAll(users[2].address, users[3].address)).to.equal(true);
      await users[2].Purgatory.setShortLivedApprovalLength(600);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + ((purgatoryTimeInSeconds + 10) * 2)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC721A.isApprovedForAll(users[2].address, users[3].address)).to.equal(false);
    });
    it("allows deployer to update the Purgatory address", async function () {
      await deployer.TestERC721A.setPurgatoryAddress(users[2].address);
    })
    it("forbids non-deployer to update the Purgatory address", async function () {
      await expect(users[2].TestERC721A.setPurgatoryAddress(users[2].address)).to.be.revertedWithCustomError(deployer.Purgatory, "Unauthorized");
    })
    it("forbids deployer from update the Purgatory address after locking", async function () {
      await deployer.TestERC721A.lockPurgatoryContract();
      await expect(deployer.TestERC721A.setPurgatoryAddress(users[2].address)).to.be.revertedWithCustomError(deployer.TestERC721A, "ContractLocked");
    })
    it("allows burning of tokens to not be impacted by Purgatory checks", async function () {
      await deployer.TestERC721ABurnable.mint(1, users[2].address);
      expect(await deployer.TestERC721ABurnable.balanceOf(users[2].address)).to.equal(1);

      await expect(users[2].TestERC721ABurnable.burn(1)).to.not.be.revertedWithCustomError(deployer.Purgatory, "UnauthorizedTransferRecipient")
      expect(await deployer.TestERC721ABurnable.balanceOf(users[2].address)).to.equal(0);
    })
    it("forbids burning of tokens when in lockdown mode", async function () {
      await deployer.TestERC721ABurnable.mint(1, users[2].address);
      expect(await deployer.TestERC721ABurnable.balanceOf(users[2].address)).to.equal(1);

      await users[2].Purgatory.toggleLockDownMode();

      await expect(users[2].TestERC721ABurnable.burn(1)).to.be.revertedWithCustomError(deployer.Purgatory, "LockDownModeEnabled")
      expect(await deployer.TestERC721ABurnable.balanceOf(users[2].address)).to.equal(1);
    })
    it("allows minting of tokens when in lockdown mode", async function () {
      await users[2].Purgatory.toggleLockDownMode();
      expect(await deployer.Purgatory.isLockedDown(users[2].address)).to.equal(true);

      expect(await deployer.TestERC721ABurnable.balanceOf(users[2].address)).to.equal(0);
      await deployer.TestERC721ABurnable.mint(1, users[2].address);
      expect(await deployer.TestERC721ABurnable.balanceOf(users[2].address)).to.equal(1);
    })
    it("requires re-approval for approval that was set when user was opted out", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);
            
      await deployer.TestERC721A.mint(2, users[3].address);
      await users[3].TestERC721A.setApprovalForAll(users[2].address, true);

      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(2);
      await users[2].TestERC721A["safeTransferFrom(address,address,uint256)"](users[3].address, users[2].address, 1);
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(1);

      // Opt in
      await users[3].Purgatory.setOptStatus(true, 0);

      await expect(users[2].TestERC721A["safeTransferFrom(address,address,uint256)"](users[3].address, users[2].address, 2)).to.be.revertedWithCustomError(deployer.TestERC721A, "TransferCallerNotOwnerNorApproved");
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(1);

      await users[3].TestERC721A.setApprovalForAll(users[2].address, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await users[2].TestERC721A["safeTransferFrom(address,address,uint256)"](users[3].address, users[2].address, 2);
      expect(await deployer.TestERC721A.balanceOf(users[3].address)).to.equal(0);
    })
    it("requires re-approval for approval that was set when collection was un-enrolled", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);
      
      // Un-enroll collection
      await deployer.Purgatory.toggleCollectionEnroll(deployer.TestERC721A.address);

      await deployer.TestERC721A.mint(2, users[2].address);
      await users[2].TestERC721A.setApprovalForAll(users[3].address, true);

      expect(await deployer.TestERC721A.balanceOf(users[2].address)).to.equal(2);
      await users[3].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 1);
      expect(await deployer.TestERC721A.balanceOf(users[2].address)).to.equal(1);

      // Enroll the collection
      await deployer.Purgatory.toggleCollectionEnroll(deployer.TestERC721A.address);
      await expect(users[3].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 2)).to.be.revertedWithCustomError(deployer.TestERC721A, "TransferCallerNotOwnerNorApproved");
      expect(await deployer.TestERC721A.balanceOf(users[2].address)).to.equal(1);

      await users[2].TestERC721A.setApprovalForAll(users[3].address, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await users[3].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 2);
      expect(await deployer.TestERC721A.balanceOf(users[2].address)).to.equal(0);
    })
    it("forbids approval from being valid after short-lived approval has expired", async function () {
      await deployer.TestERC721A.mint(2, users[2].address);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setShortLivedApprovalLength(300);
      await users[2].TestERC721A.setApprovalForAll(users[3].address, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC721A.isApprovedForAll(users[2].address, users[3].address)).to.equal(true);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10 + 500)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC721A.isApprovedForAll(users[2].address, users[3].address)).to.equal(false);
      await expect(users[3].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 1)).to.be.revertedWithCustomError(deployer.TestERC721A, "TransferCallerNotOwnerNorApproved");
    });
    it("allows setApprovalForAll from being called again if approval is expired without throwing AlreadyApproved() error", async function () {
      await deployer.TestERC721A.mint(2, users[2].address);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setShortLivedApprovalLength(300);
      await users[2].TestERC721A.setApprovalForAll(users[3].address, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC721A.isApprovedForAll(users[2].address, users[3].address)).to.equal(true);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10 + 500)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC721A.isApprovedForAll(users[2].address, users[3].address)).to.equal(false);
      await expect(users[2].TestERC721A.setApprovalForAll(users[3].address, true)).to.not.be.revertedWithCustomError(deployer.Purgatory, "AlreadyApproved");
    });
    it("forbids expired short-lived approvals renew until Purgatory state is complete when short-lived approvals are deactivated", async function () {
      await deployer.TestERC721A.mint(2, users[2].address);
      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setShortLivedApprovalLength(300);
      await users[2].TestERC721A.setApprovalForAll(users[3].address, true);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC721A.isApprovedForAll(users[2].address, users[3].address)).to.equal(true);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + ((purgatoryTimeInSeconds + 310) * 2)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC721A.isApprovedForAll(users[2].address, users[3].address)).to.equal(false);

      expect(await users[3].TestERC721A.balanceOf(users[3].address)).to.equal(0);
      await expect(users[3].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 1)).to.be.revertedWithCustomError(deployer.TestERC721A, "TransferCallerNotOwnerNorApproved");
      expect(await users[3].TestERC721A.balanceOf(users[3].address)).to.equal(0);

      // Deactivating short-lived approvals should not renew expired approvals unless Purgatory state is complete
      await users[2].Purgatory.setShortLivedApprovalLength(0);
      expect(await users[3].TestERC721A.balanceOf(users[3].address)).to.equal(0);
      await expect(users[3].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 1)).to.be.revertedWithCustomError(deployer.TestERC721A, "TransferCallerNotOwnerNorApproved");
      expect(await users[3].TestERC721A.balanceOf(users[3].address)).to.equal(0);
    });
    it("allows still valid short-lived approvals to remain valid while Purgatory state is pending when short-lived approvals are deactivated", async function () {
      await deployer.TestERC721A.mint(2, users[2].address);
      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setShortLivedApprovalLength(300);
      await users[2].TestERC721A.setApprovalForAll(users[3].address, true);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[3].TestERC721A.balanceOf(users[3].address)).to.equal(0);
      await users[3].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 1);
      expect(await users[3].TestERC721A.balanceOf(users[3].address)).to.equal(1);

      // Deactivating short-lived approvals should not renew expired approvals unless Purgatory state is complete
      await users[2].Purgatory.setShortLivedApprovalLength(0);
      expect(await users[3].TestERC721A.balanceOf(users[3].address)).to.equal(1);
      await users[3].TestERC721A["safeTransferFrom(address,address,uint256)"](users[2].address, users[3].address, 2);
      expect(await users[3].TestERC721A.balanceOf(users[3].address)).to.equal(2);
    });
  });

  // ------------------------------------- Purgatory ERC20 ---------------------------------------

  describe("Purgatory ERC20 tests", async function () {
    it("allows minting of tokens without Purgatory blocking/reverting", async function () {
      await deployer.TestERC20.mint([1], users[2].address);
      expect(await deployer.TestERC20.balanceOf(users[2].address)).to.equal(1);
    })
    it("forbids transfer by approved operator via approve within purgatory time", async function () {
      await deployer.TestERC20.mint([1], users[2].address);
      await users[2].TestERC20.approve(users[3].address, 1000000000);

      await expect(users[3].TestERC20.transferFrom(users[2].address, users[3].address, 1)).to.be.rejectedWith("ERC20: insufficient allowance");
    })
    it("allows transfer by approved operator via approve after purgatory time is complete", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await deployer.TestERC20.mint(10000000, users[2].address);
      await users[2].TestERC20.approve(users[3].address, 1000000000);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(0);
      await users[3].TestERC20.transferFrom(users[2].address, users[3].address, 1);
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(1);
    })
    it("allows transfer by approved operator via approve after purgatory time is complete", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await deployer.TestERC20.mint(10000000, users[2].address);
      await users[2].TestERC20.approve(users[3].address, 1000000000);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(0);
      await users[3].TestERC20.transferFrom(users[2].address, users[3].address, 1);
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(1);
    })
    it("allows instant removal of approval status (without purgatory time) when allowance is set to 0", async function () {
      await deployer.TestERC20.mint(10000000, users[2].address);
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].TestERC20.approve(users[3].address, 1000000000);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC20.allowance(users[2].address, users[3].address)).to.not.equal(0);
      expect((await deployer.Purgatory.approvals(deployer.TestERC20.address, users[2].address, users[3].address)).approved).to.equal(true);
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(0);
      expect(await users[3].TestERC20.transferFrom(users[2].address, users[3].address, 1));
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(1);

      await users[2].TestERC20.approve(users[3].address, 0);
      expect(await deployer.TestERC20.allowance(users[2].address, users[3].address)).to.equal(0);
      expect((await deployer.Purgatory.approvals(deployer.TestERC20.address, users[2].address, users[3].address)).approved).to.equal(false);
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(1);
      await expect(users[3].TestERC20.transferFrom(users[2].address, users[3].address, 2)).to.be.rejectedWith("ERC20: insufficient allowance");
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(1);
    })
    it("allows instant removal of approval status (without purgatory time) when approve is revoked", async function () {
      await deployer.TestERC20.mint(10000000, users[2].address);
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].TestERC20.approve(users[3].address, 1000000000);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC20.allowance(users[2].address, users[3].address)).to.not.equal(0);
      expect((await deployer.Purgatory.approvals(deployer.TestERC20.address, users[2].address, users[3].address)).approved).to.equal(true);

      await users[2].TestERC20.approve(users[3].address, 0);

      expect(await deployer.TestERC20.allowance(users[2].address, users[3].address)).to.equal(0);
      expect((await deployer.Purgatory.approvals(deployer.TestERC20.address, users[2].address, users[3].address)).approved).to.equal(false);

      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(0);
      await expect(users[3].TestERC20.transferFrom(users[2].address, users[3].address, 2)).to.be.rejectedWith("ERC20: insufficient allowance");
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(0);
    })
    // TRANSFER TESTS
    it("allows transfer to approved recipient after purgatory time is complete", async function () {
      await deployer.TestERC20.mint(10000000, users[2].address);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);
      
      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      
      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC20.address, users[3].address, true);
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);
      
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(0);
      await users[2].TestERC20.transfer(users[3].address, 1);
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(1);
    })
    it("forbids transfer to recipient within purgatory time", async function () {
      await deployer.TestERC20.mint(10000000, users[2].address);
      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC20.address, users[3].address, true);

      await expect(users[2].TestERC20.transfer(users[3].address, 1)).to.be.revertedWithCustomError(deployer.Purgatory, "UnauthorizedTransferRecipient");
    })
    it("forbids bypassing with unapproved recipient by setting then revoking to bypass griefing protection for 0 timestamp on recently revoked recipients", async function () {
      await deployer.TestERC20.mint(10000000, users[2].address);
      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC20.address, users[3].address, true);
      await users[2].Purgatory.setApprovedRecipient(deployer.TestERC20.address, users[3].address, false);
      
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(0);
      await expect(users[2].TestERC20.transfer(users[3].address, 1)).to.be.revertedWithCustomError(deployer.Purgatory, "UnauthorizedTransferRecipient");
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(0);
    })
    it("allows transfer to approved global recipient after purgatory time is complete", async function () {
      await deployer.TestERC20.mint(10000000, users[2].address);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);
      
      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      
      await users[2].Purgatory.setApprovedGlobalRecipient(users[3].address, true);
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);
      
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(0);
      await users[2].TestERC20.transfer(users[3].address, 1);
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(1);
    })
    it("forbids transfer to global recipient within purgatory time", async function () {
      await deployer.TestERC20.mint(10000000, users[2].address);
      await users[2].Purgatory.setApprovedGlobalRecipient(users[3].address, true);
      await expect(users[2].TestERC20.transfer(users[3].address, 1)).to.be.revertedWithCustomError(deployer.Purgatory, "UnauthorizedTransferRecipient");
    })
    it("forbids bypassing with unapproved global recipient by setting then revoking to bypass griefing protection for 0 timestamp on recently revoked global recipients", async function () {
      await deployer.TestERC20.mint(10000000, users[2].address);
      await users[2].Purgatory.setApprovedGlobalRecipient(users[3].address, true);
      await users[2].Purgatory.setApprovedGlobalRecipient(users[3].address, false);
      
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(0);
      await expect(users[2].TestERC20.transfer(users[3].address, 1)).to.be.revertedWithCustomError(deployer.Purgatory, "UnauthorizedTransferRecipient");
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(0);
    })
    it("forbids bypassing with unapproved operator by setting then revoking to bypass griefing protection for 0 timestamp on recently revoked operators", async function () {
      await deployer.TestERC20.mint(10000000, users[2].address);
      await users[2].TestERC20.approve(users[4].address, 10000000);
      await users[2].TestERC20.approve(users[4].address, 0);
      
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(0);
      await expect(users[4].TestERC20.transferFrom(users[2].address, users[3].address, 1)).to.be.rejectedWith("ERC20: insufficient allowance");
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(0);
    })
    it("forbids bypassing with unapproved two factor wallet approver by setting then revoking to bypass griefing protection for 0 timestamp on recently revoked approvers", async function () {
      await deployer.TestERC20.mint(10000000, users[2].address);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, false, false, false);
      await users[2].TestERC20.approve(users[4].address, 0);
      
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(0);
      await expect(users[3].Purgatory.setApprovalForOperatorApproval(users[2].address, users[4].address, deployer.TestERC20.address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "Unauthorized");
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(0);
    })
    it("forbids bypassing with unapproved two factor wallet approver by double revoking an approved approver to bypass griefing protection for 0 timestamp on recently revoked approvers", async function () {
      await deployer.TestERC20.mint(10000000, users[2].address);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);
      
      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      
      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, true, false, false);
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[3].address, false, false, false);
      await users[2].TestERC20.approve(users[4].address, 0);
      
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(0);
      await expect(users[3].Purgatory.setApprovalForOperatorApproval(users[2].address, users[4].address, deployer.TestERC20.address, true)).to.be.revertedWithCustomError(deployer.Purgatory, "RequestNotFound");
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(0);
    })
    it("forbids approval in lock down mode", async function () {
      await users[2].Purgatory.toggleLockDownMode();
      await expect(users[2].TestERC20.approve(users[3].address, 1000000000)).to.be.revertedWithCustomError(deployer.Purgatory, "LockDownModeEnabled");
    })
    it("forbids transfer in lock down mode", async function () {
      await deployer.TestERC20.mint(10000000, users[2].address);
      await users[2].Purgatory.toggleLockDownMode();
      await expect(users[2].TestERC20.transfer(users[3].address, 1)).to.be.revertedWithCustomError(deployer.Purgatory, "LockDownModeEnabled");
    })
    it("forbids allowances to be greater than 0 when in lock down mode", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await deployer.TestERC20.mint(10000000, users[2].address);
      await users[2].TestERC20.approve(users[3].address, 1000000000);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);
      expect(await users[2].TestERC20.allowance(users[2].address, users[3].address)).to.not.equal(0);

      await users[2].Purgatory.toggleLockDownMode();
      expect(await users[2].TestERC20.allowance(users[2].address, users[3].address)).to.equal(0);
    })
    it("allows temporary approval to be valid during approval length", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await deployer.TestERC20.mint(10000000, users[2].address);
      await users[2].Purgatory.setOptStatus(false, 0);
      await users[2].Purgatory.setOptStatus(true, 600);
      await users[2].TestERC20.approve(users[3].address, 1000000000);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      let newTime = 1663122559 + (purgatoryTimeInSeconds + 10);
      await ethers.provider.send("evm_setNextBlockTimestamp", [newTime]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(0);
      await users[3].TestERC20.transferFrom(users[2].address, users[3].address, 1);
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(1);
    })
    it("allows temporary approval to be EXPIRED after approval length is complete", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await deployer.TestERC20.mint(10000000, users[2].address);
      await users[2].Purgatory.setOptStatus(false, 0);
      await users[2].Purgatory.setOptStatus(true, 600);
      await users[2].TestERC20.approve(users[3].address, 1000000000);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      let newTime = 1663122559 + (purgatoryTimeInSeconds + 10);
      await ethers.provider.send("evm_setNextBlockTimestamp", [newTime]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(0);
      await users[3].TestERC20.transferFrom(users[2].address, users[3].address, 1);
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(1);

      newTime = newTime + (600 + 10);
      await ethers.provider.send("evm_setNextBlockTimestamp", [newTime]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(1);
      await expect(users[3].TestERC20.transferFrom(users[2].address, users[3].address, 2)).to.be.rejectedWith("ERC20: insufficient allowance");
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(1);
    })
    it("allows temporary approval to be refreshed after approval length is complete and is valid again", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await deployer.TestERC20.mint(1000000000, users[2].address);
      await users[2].Purgatory.setOptStatus(false, 0);
      await users[2].Purgatory.setOptStatus(true, 600);
      await users[2].TestERC20.approve(users[3].address, 1000000000);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      let newTime = 1663122559 + (purgatoryTimeInSeconds + 10);
      await ethers.provider.send("evm_setNextBlockTimestamp", [newTime]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(0);
      await users[3].TestERC20.transferFrom(users[2].address, users[3].address, 1);
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(1);

      newTime = newTime + (600 + 10);
      await ethers.provider.send("evm_setNextBlockTimestamp", [newTime]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(1);
      await expect(users[3].TestERC20.transferFrom(users[2].address, users[3].address, 2)).to.be.rejectedWith("ERC20: insufficient allowance");
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(1);

      await users[2].Purgatory.refreshApproval(deployer.TestERC20.address, users[3].address);
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(1);
      await users[3].TestERC20.transferFrom(users[2].address, users[3].address, 1);
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(2);
    })
    it("allows transfer to 2FA wallet marked as approved recipient", async function () {
      await deployer.TestERC20.mint(10000000, users[2].address);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, true, false, true);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await deployer.TestERC20.balanceOf(users[4].address)).to.equal(0);
      await users[2].TestERC20.transfer(users[4].address, 1);
      expect(await deployer.TestERC20.balanceOf(users[4].address)).to.equal(1);
    })
    it("forbids transfer to 2FA wallet NOT marked as approved recipient", async function () {
      await deployer.TestERC20.mint(10000000, users[2].address);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, true, false, false);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await expect(users[2].TestERC20.transfer(users[4].address, 1)).to.be.revertedWithCustomError(deployer.Purgatory, "UnauthorizedTransferRecipient");
    })
    it("forbids transfer to 2FA wallet marked as approved recipient but without completed Purgatory state", async function () {
      await deployer.TestERC20.mint(10000000, users[2].address);
      await users[2].Purgatory.setTwoFactorWalletApprover(users[4].address, true, false, true);
      await expect(users[2].TestERC20.transfer(users[4].address, 1)).to.be.revertedWithCustomError(deployer.Purgatory, "UnauthorizedTransferRecipient");
    })
    it("allows opting into short-lived approvals to invalidate existing approvals if past short-lived approval time", async function () {
      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].TestERC20.approve(users[3].address, 1000000000);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC20.allowance(users[2].address, users[3].address)).to.not.equal(0);
      await users[2].Purgatory.setShortLivedApprovalLength(600);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + ((purgatoryTimeInSeconds + 10) * 2)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC20.allowance(users[2].address, users[3].address)).to.equal(0);
    });
    it("allows deployer to update the Purgatory address", async function () {
      await deployer.TestERC20.setPurgatoryAddress(users[2].address);
    })
    it("forbids non-deployer to update the Purgatory address", async function () {
      await expect(users[2].TestERC20.setPurgatoryAddress(users[2].address)).to.be.revertedWithCustomError(deployer.Purgatory, "Unauthorized");
    })
    it("forbids deployer from update the Purgatory address after locking", async function () {
      await deployer.TestERC20.lockPurgatoryContract();
      await expect(deployer.TestERC20.setPurgatoryAddress(users[2].address)).to.be.revertedWithCustomError(deployer.TestERC20, "ContractLocked");
    })
    it("allows burning of tokens to not be impacted by Purgatory checks", async function () {
      await deployer.TestERC20Burnable.mint(10000000, users[2].address);
      expect(await deployer.TestERC20Burnable.balanceOf(users[2].address)).to.equal(10000000);

      await expect(users[2].TestERC20Burnable.burn(10000000)).to.not.be.revertedWithCustomError(deployer.Purgatory, "UnauthorizedTransferRecipient")
      expect(await deployer.TestERC20Burnable.balanceOf(users[2].address)).to.equal(0);
    })
    it("forbids burning of tokens when in lockdown mode", async function () {
      await deployer.TestERC20Burnable.mint(10000000, users[2].address);
      expect(await deployer.TestERC20Burnable.balanceOf(users[2].address)).to.equal(10000000);

      await users[2].Purgatory.toggleLockDownMode();

      await expect(users[2].TestERC20Burnable.burn(10000000)).to.be.revertedWithCustomError(deployer.Purgatory, "LockDownModeEnabled")
      expect(await deployer.TestERC20Burnable.balanceOf(users[2].address)).to.equal(10000000);
    })
    it("allows minting of tokens when in lockdown mode", async function () {
      await users[2].Purgatory.toggleLockDownMode();
      expect(await deployer.Purgatory.isLockedDown(users[2].address)).to.equal(true);

      expect(await deployer.TestERC20Burnable.balanceOf(users[2].address)).to.equal(0);
      await deployer.TestERC20Burnable.mint(10000000, users[2].address);
      expect(await deployer.TestERC20Burnable.balanceOf(users[2].address)).to.equal(10000000);
    })
    it("requires re-approval for approval that was set when user was opted out", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);
            
      await deployer.TestERC20.mint(10000000, users[3].address);
      await users[3].TestERC20.approve(users[2].address, 1000000000);

      expect(await deployer.TestERC20.balanceOf(users[2].address)).to.equal(0);
      await users[2].TestERC20.transferFrom(users[3].address, users[2].address, 1);
      expect(await deployer.TestERC20.balanceOf(users[2].address)).to.equal(1);

      // Opt in
      await users[3].Purgatory.setOptStatus(true, 0);

      await expect(users[2].TestERC20.transferFrom(users[2].address, users[3].address, 1)).to.be.rejectedWith("ERC20: insufficient allowance");
      expect(await deployer.TestERC20.balanceOf(users[2].address)).to.equal(1);

      await users[3].TestERC20.approve(users[2].address, 1000000000);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await users[2].TestERC20.transferFrom(users[3].address, users[2].address, 1);
      expect(await deployer.TestERC20.balanceOf(users[2].address)).to.equal(2);
    })
    it("requires re-approval for approval that was set when collection was un-enrolled", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);
      
      // Un-enroll collection
      await deployer.Purgatory.toggleCollectionEnroll(deployer.TestERC20.address);

      await deployer.TestERC20.mint(10000000, users[2].address);
      await users[2].TestERC20.approve(users[3].address, 1000000000);

      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(0);
      await users[3].TestERC20.transferFrom(users[2].address, users[3].address, 1);
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(1);

      // Enroll the collection
      await deployer.Purgatory.toggleCollectionEnroll(deployer.TestERC20.address);
      await expect(users[3].TestERC20.transferFrom(users[2].address, users[3].address, 1)).to.be.rejectedWith("ERC20: insufficient allowance");
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(1);

      await users[2].TestERC20.approve(users[3].address, 1000000000);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      await users[3].TestERC20.transferFrom(users[2].address, users[3].address, 1);
      expect(await deployer.TestERC20.balanceOf(users[3].address)).to.equal(2);
    })
    it("allowances approve to be called multiple times without AlreadyApproved() error", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559]);
      await ethers.provider.send("evm_mine", []);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await deployer.TestERC20.mint(10000000, users[2].address);
      await users[2].TestERC20.approve(users[3].address, 1000000000);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663122559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC20.allowance(users[2].address, users[3].address)).to.not.equal(0);
      await expect(users[2].TestERC20.approve(users[3].address, 500000)).to.not.be.revertedWithCustomError(deployer.Purgatory, "AlreadyApproved");
    })
    it("forbids increaseAllowance from being called", async function () {
      await expect(users[2].TestERC20.increaseAllowance(users[3].address, 500000)).to.be.revertedWithCustomError(deployer.TestERC20, "FunctionNotSupported");
    })
    it("forbids decreaseAllowanceAllowance from being called", async function () {
      await expect(users[2].TestERC20.decreaseAllowance(users[3].address, 500000)).to.be.revertedWithCustomError(deployer.TestERC20, "FunctionNotSupported");
    })
    it("forbids approval from being valid after short-lived approval has expired", async function () {
      await deployer.TestERC20.mint(10000000, users[2].address);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setShortLivedApprovalLength(300);
      await users[2].TestERC20.approve(users[3].address, 1000000000);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC20.allowance(users[2].address, users[3].address)).to.not.equal(0);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10 + 500)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC20.allowance(users[2].address, users[3].address)).to.equal(0);
      await expect(users[3].TestERC20.transferFrom(users[2].address, users[3].address, 1)).to.be.rejectedWith("ERC20: insufficient allowance");
    });
    it("allows setApprovalForAll from being called again if approval is expired without throwing AlreadyApproved() error", async function () {
      await deployer.TestERC20.mint(10000000, users[2].address);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setShortLivedApprovalLength(300);
      await users[2].TestERC20.approve(users[3].address, 1000000000);

      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC20.allowance(users[2].address, users[3].address)).to.not.equal(0);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10 + 500)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC20.allowance(users[2].address, users[3].address)).to.equal(0);
      await expect(users[2].TestERC20.approve(users[3].address, 1000000000)).to.not.be.revertedWithCustomError(deployer.Purgatory, "AlreadyApproved");
    });
    it("forbids expired short-lived approvals renew until Purgatory state is complete when short-lived approvals are deactivated", async function () {
      await deployer.TestERC20.mint(10000000, users[2].address);
      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setShortLivedApprovalLength(300);
      await users[2].TestERC20.approve(users[3].address, 1000000000);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC20.allowance(users[2].address, users[3].address)).to.not.equal(0);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + ((purgatoryTimeInSeconds + 310) * 2)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[2].TestERC20.allowance(users[2].address, users[3].address)).to.equal(0);

      expect(await users[3].TestERC20.balanceOf(users[3].address)).to.equal(0);
      await expect(users[3].TestERC20.transferFrom(users[2].address, users[3].address, 1)).to.be.rejectedWith("ERC20: insufficient allowance");
      expect(await users[3].TestERC20.balanceOf(users[3].address)).to.equal(0);

      // Deactivating short-lived approvals should not renew expired approvals unless Purgatory state is complete
      await users[2].Purgatory.setShortLivedApprovalLength(0);
      expect(await users[3].TestERC20.balanceOf(users[3].address)).to.equal(0);
      await expect(users[3].TestERC20.transferFrom(users[2].address, users[3].address, 1)).to.be.rejectedWith("ERC20: insufficient allowance");
      expect(await users[3].TestERC20.balanceOf(users[3].address)).to.equal(0);
    });
    it("allows still valid short-lived approvals to remain valid while Purgatory state is pending when short-lived approvals are deactivated", async function () {
      await deployer.TestERC20.mint(10000000, users[2].address);
      const purgatoryTimeInSeconds = await deployer.Purgatory.purgatoryTime();

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559]);
      await ethers.provider.send("evm_mine", []);

      await users[2].Purgatory.setShortLivedApprovalLength(300);
      await users[2].TestERC20.approve(users[3].address, 1000000000);

      await ethers.provider.send("evm_setNextBlockTimestamp", [1663112559 + (purgatoryTimeInSeconds + 10)]);
      await ethers.provider.send("evm_mine", []);

      expect(await users[3].TestERC20.balanceOf(users[3].address)).to.equal(0);
      await users[3].TestERC20.transferFrom(users[2].address, users[3].address, 1);
      expect(await users[3].TestERC20.balanceOf(users[3].address)).to.equal(1);

      // Deactivating short-lived approvals should not renew expired approvals unless Purgatory state is complete
      await users[2].Purgatory.setShortLivedApprovalLength(0);
      expect(await users[3].TestERC20.balanceOf(users[3].address)).to.equal(1);
      await users[3].TestERC20.transferFrom(users[2].address, users[3].address, 1);
      expect(await users[3].TestERC20.balanceOf(users[3].address)).to.equal(2);
    });
  });
});
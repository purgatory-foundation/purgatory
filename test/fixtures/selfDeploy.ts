import {deployments, getNamedAccounts, getUnnamedAccounts} from "hardhat";
import {
  TestERC1155,
  TestERC721A,
  TestERC20,
  TestERC1155Burnable,
  TestERC721ABurnable,
  TestERC20Burnable,
  TestERC1155NonPurg,
  PurgatorySelfDeploy
} from "../../typechain";
import { setupUser, setupUsers } from "./users";

export interface Contracts {
  TestERC721A: TestERC721A;
  TestERC721ABurnable: TestERC721ABurnable;
  TestERC1155: TestERC1155;
  TestERC1155Burnable: TestERC1155Burnable;
  TestERC20: TestERC20;
  TestERC20Burnable: TestERC20Burnable;
  TestERC1155NonPurg: TestERC1155NonPurg;
  Purgatory: PurgatorySelfDeploy;
}

export interface User extends Contracts {
  address: string;
}

export const setupIntegration = deployments.createFixture(async ({ ethers }) => {
  const { deployer } = await getNamedAccounts();

  const purgatoryContractFactory = await ethers.getContractFactory("PurgatorySelfDeploy");
  const purgatoryContract = (await purgatoryContractFactory.deploy()) as PurgatorySelfDeploy;

  const test1155ContractFactory = await ethers.getContractFactory("TestERC1155");
  const test1155Contract = (await test1155ContractFactory.deploy(purgatoryContract.address)) as TestERC1155;

  const test721ContractFactory = await ethers.getContractFactory("TestERC721A");
  const test721Contract = (await test721ContractFactory.deploy(purgatoryContract.address)) as TestERC721A;

  const test20ContractFactory = await ethers.getContractFactory("TestERC20");
  const test20Contract = (await test20ContractFactory.deploy(purgatoryContract.address)) as TestERC20;

  const test1155BurnableContractFactory = await ethers.getContractFactory("TestERC1155Burnable");
  const test1155BurnableContract = (await test1155BurnableContractFactory.deploy(purgatoryContract.address)) as TestERC1155Burnable;

  const test721BurnableContractFactory = await ethers.getContractFactory("TestERC721ABurnable");
  const test721BurnableContract = (await test721BurnableContractFactory.deploy(purgatoryContract.address)) as TestERC721ABurnable;

  const test20BurnableContractFactory = await ethers.getContractFactory("TestERC20Burnable");
  const test20BurnableContract = (await test20BurnableContractFactory.deploy(purgatoryContract.address)) as TestERC20Burnable;

  const test1155NonPurgContractFactory = await ethers.getContractFactory("TestERC1155NonPurg");
  const test1155NonPurgContract = (await test1155NonPurgContractFactory.deploy()) as TestERC1155NonPurg;

  const contracts: Contracts = {
    TestERC1155: test1155Contract,
    TestERC1155Burnable: test1155BurnableContract,
    TestERC721A: test721Contract,
    TestERC721ABurnable: test721BurnableContract,
    TestERC20: test20Contract,
    TestERC20Burnable: test20BurnableContract,
    TestERC1155NonPurg: test1155NonPurgContract,
    Purgatory: purgatoryContract
  };

  const users: User[] = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    contracts,
    deployer: users[0],
    users,
  };
});

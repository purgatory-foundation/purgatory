import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const purgatory = await deployments.get("Purgatory");

  await deploy("TestERC721A", {
    from: deployer,
    log: true,
    args: [purgatory.address],
  });
};

export default func;
func.tags = [""];

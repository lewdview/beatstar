import hre from "hardhat";
const { ethers } = hre;

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  // Deploying PIM contract, passing deployer as initialOwner
  const Contract = await ethers.getContractFactory("PIM");
  const contract = await Contract.deploy(deployer.address);

  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log("PIM deployed to:", contractAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

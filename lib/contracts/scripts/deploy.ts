import hre from "hardhat";
const { ethers } = hre;

/**
 * Deploys the PIM contract.
 *
 * Required env vars:
 *   INITIAL_OWNER     - address that owns the contract (artist/ops wallet)
 *   MAX_SUPPLY        - hard cap on total mints, e.g. "36500"
 *   ROYALTY_RECEIVER  - address receiving ERC-2981 royalties
 *   ROYALTY_BPS       - royalty in basis points, e.g. "750" = 7.5%
 *   PRIVATE_KEY       - deployer key (see hardhat.config.ts)
 *
 * Example (Base Sepolia):
 *   INITIAL_OWNER=0x... MAX_SUPPLY=36500 ROYALTY_RECEIVER=0x... ROYALTY_BPS=750 \
 *     npx hardhat run scripts/deploy.ts --network base-sepolia
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  const initialOwner = process.env.INITIAL_OWNER;
  const maxSupply = process.env.MAX_SUPPLY;
  const royaltyReceiver = process.env.ROYALTY_RECEIVER;
  const royaltyBps = process.env.ROYALTY_BPS;

  if (!initialOwner || !maxSupply || !royaltyReceiver || !royaltyBps) {
    throw new Error(
      "Missing env vars: INITIAL_OWNER, MAX_SUPPLY, ROYALTY_RECEIVER, ROYALTY_BPS are all required."
    );
  }

  console.log("  initialOwner:   ", initialOwner);
  console.log("  maxSupply:      ", maxSupply);
  console.log("  royaltyReceiver:", royaltyReceiver);
  console.log("  royaltyBps:     ", royaltyBps);

  const Contract = await ethers.getContractFactory("PIM");
  const contract = await Contract.deploy(
    initialOwner,
    maxSupply,
    royaltyReceiver,
    royaltyBps
  );

  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log("PIM deployed to:", contractAddress);
  console.log(
    `Verify with: npx hardhat verify --network ${hre.network.name} ${contractAddress} ${initialOwner} ${maxSupply} ${royaltyReceiver} ${royaltyBps}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

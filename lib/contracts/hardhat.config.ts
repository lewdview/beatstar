import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const accounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [];
const basescanKey = process.env.BASESCAN_API_KEY || "PLACEHOLDER";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "cancun",
      viaIR: true,
    },
  },
  networks: {
    // Base Sepolia Testnet
    "base-sepolia": {
      url: "https://sepolia.base.org",
      accounts,
    },
    // Base Mainnet
    "base-mainnet": {
      url: "https://mainnet.base.org",
      accounts,
    },
  },
  etherscan: {
    apiKey: {
      "base-sepolia": basescanKey,
      "base-mainnet": basescanKey,
    },
    customChains: [
      {
        network: "base-sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
      {
        network: "base-mainnet",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
    ],
  },
};

export default config;

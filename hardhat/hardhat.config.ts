import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const RPC = process.env.SEPOLIA_RPC_URL || "";
const PK  = process.env.PRIVATE_KEY || "";

const config: HardhatUserConfig = {
  // FHEVM 需要 cancun EVM（0.8.27 + cancun）
  solidity: {
    version: "0.8.27",
    settings: {
      evmVersion: "cancun",
    },
  },
  networks: {
    sepolia: {
      url: RPC,                  // 直接使用 .env 里的 URL（如 publicnode）
      accounts: PK ? [PK] : [],  // 读取 .env 私钥
      chainId: 11155111,
    },
  },
  // 可选：如果以后要验证合约再填 etherscan key
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
};

export default config;

import { ethers } from "hardhat";

const ADDR = process.env.COUNTER_ADDR || "0x9F8069282814a1177C1f6b8D7d8f7cC11A663554";
const RELAYER_URL = process.env.RELAYER_URL || "https://relayer.zama.ai";
const GATEWAY_URL = process.env.GATEWAY_URL || "https://gateway.zama.ai";
const RPC_URL = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia.publicnode.com";

async function main() {
  // ✅ 关键：在 CJS 环境中用动态 import 载入 ESM 包
  const { createRelayer } = await import("@zama-fhe/relayer-sdk");

  // 1) 初始化 Relayer（拉公钥/WASM）
  const relayer = createRelayer({
    relayerUrl: RELAYER_URL,
    gatewayUrl: GATEWAY_URL,
    chainRpcUrl: RPC_URL,
  });
  await relayer.init();

  // 2) 把明文 1 注册成外部密文输入（得到 handle + inputProof）
  const reg = await relayer.registerInput({ value: 1, type: "euint32" });
  console.log("handle:", reg.handle.slice(0, 10) + "...", "proof bytes:", reg.inputProof.length);

  // 3) 上链调用 add(handle, proof)
  const c = await ethers.getContractAt("PrivateCounter", ADDR);
  const tx = await c.add(reg.handle, reg.inputProof);
  await tx.wait();
  console.log("✓ add(+1) tx:", tx.hash);
}

main().catch((e) => { console.error(e); process.exit(1); });

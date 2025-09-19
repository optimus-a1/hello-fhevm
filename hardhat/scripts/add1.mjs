import { createRelayer } from "@zama-fhe/relayer-sdk";
import { ethers } from "ethers";
import fs from "fs";

const ADDR = process.env.COUNTER_ADDR || "0x9F8069282814a1177C1f6b8D7d8f7cC11A663554";
const RELAYER_URL = process.env.RELAYER_URL || "https://relayer.zama.ai";
const GATEWAY_URL = process.env.GATEWAY_URL || "https://gateway.zama.ai";
const RPC_URL = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia.publicnode.com";
const PK = process.env.PRIVATE_KEY;
if (!PK) throw new Error("PRIVATE_KEY missing");

const artifact = JSON.parse(fs.readFileSync("./artifacts/contracts/PrivateCounter.sol/PrivateCounter.json","utf8"));
const ABI = artifact.abi;

async function main() {
  const relayer = createRelayer({ relayerUrl: RELAYER_URL, gatewayUrl: GATEWAY_URL, chainRpcUrl: RPC_URL });
  await relayer.init();
  const reg = await relayer.registerInput({ value: 1, type: "euint32" });
  console.log("handle:", reg.handle.slice(0,10)+"...", "proof bytes:", reg.inputProof.length);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PK, provider);
  const c = new ethers.Contract(ADDR, ABI, wallet);

  const tx = await c.add(reg.handle, reg.inputProof);
  console.log("→ sending add(+1):", tx.hash);
  await tx.wait();
  console.log("✓ mined:", tx.hash);
}
main().catch(e=>{ console.error(e); process.exit(1); });

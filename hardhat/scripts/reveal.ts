import { ethers } from "hardhat";

const ADDR = process.env.COUNTER_ADDR || "0x9F8069282814a1177C1f6b8D7d8f7cC11A663554";

async function main() {
  const c = await ethers.getContractAt("PrivateCounter", ADDR);

  console.log("→ requestReveal()...");
  const tx = await c.requestReveal();
  await tx.wait();
  console.log("✓ tx:", tx.hash);

  console.log("…waiting ~30s for decryption callback...");
  await new Promise(r => setTimeout(r, 30_000));

  const val: bigint = await c.totalPlain();
  console.log("🔎 totalPlain =", val.toString());
}
main().catch((e)=>{ console.error(e); process.exit(1); });

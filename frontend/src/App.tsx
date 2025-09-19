import { useEffect, useRef, useState } from "react";
import { ethers } from "ethers";

// ✅ 正确的 ABI：第1个参数是 bytes32（密文句柄）
const ABI = [
  "function add(bytes32 encryptedDelta, bytes inputProof)",
  "function requestReveal()",
  "function totalPlain() view returns (uint32)",
] as const;

const COUNTER_ADDR =
  (import.meta.env.VITE_COUNTER_ADDRESS as `0x${string}`) ||
  "0x9F8069282814a1177C1f6b8D7d8f7cC11A663554";

export default function App() {
  const [status, setStatus] = useState("idle");
  const [plain, setPlain] = useState<number | null>(null);
  const [relayerShown, setRelayerShown] = useState<string | undefined>(undefined);
  const instRef = useRef<any>(null);

  // SDK 初始化：CDN -> initSDK() -> createInstance({ ...SepoliaConfig, network, chainId })
  useEffect(() => {
    (async () => {
      try {
        setStatus("加载 FHEVM SDK…");
        const mod = await import(
          /* @vite-ignore */ "https://cdn.zama.ai/relayer-sdk-js/0.2.0/relayer-sdk-js.js"
        );
        const { initSDK, createInstance, SepoliaConfig } = mod as {
          initSDK: () => Promise<void>;
          createInstance: (cfg: any) => Promise<any>;
          SepoliaConfig: any;
        };

        await initSDK(); // 加载 WASM

        const cfg: any = {
          ...SepoliaConfig,             // 用内置 Sepolia 配置
          network: (window as any).ethereum, // EIP-1193 provider（MetaMask）
          chainId: 11155111,            // Sepolia
        };

        setStatus("创建 FHE 实例…");
        const inst = await createInstance(cfg);
        if (typeof inst.init === "function") await inst.init();

        instRef.current = inst;
        setRelayerShown(cfg.relayerUrl);
        setStatus("SDK 就绪 ✅");
      } catch (e: any) {
        console.error(e);
        setStatus("❌ SDK 初始化失败: " + (e?.message || e));
      }
    })();
  }, []);

  async function getSignerAndContract() {
    if (!(window as any).ethereum) throw new Error("请安装 MetaMask");
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(COUNTER_ADDR, ABI, signer);
    return { signer, contract, addr: await signer.getAddress() };
  }

  // ➕ 加 1（注册密文输入 → 调合约）
  async function handleAddOne() {
    try {
      if (!instRef.current) throw new Error("SDK 未初始化");
      setStatus("连接钱包…");
      const { addr, contract } = await getSignerAndContract();

      setStatus("注册加密输入…");
      const buf = instRef.current.createEncryptedInput(COUNTER_ADDR, addr);
      buf.add32(1n); // ✅ 用 BigInt；并保持 32-bit
      const cipher = await buf.encrypt(); // { handles: bytes32[], inputProof: bytes }

      setStatus("发送交易 add(+1)…");
      const tx = await contract.add(cipher.handles[0], cipher.inputProof);
      await tx.wait();
      setStatus("已提交 +1 ✅");
    } catch (e: any) {
      console.error(e);
      setStatus("❌ 失败: " + (e?.message || e));
    }
  }

  // 🔓 解密总数
  async function handleReveal() {
    try {
      setStatus("请求解密…");
      const { contract } = await getSignerAndContract();
      const tx = await contract.requestReveal();
      await tx.wait();

      setStatus("等待回调（~30s）…");
      await new Promise((r) => setTimeout(r, 30_000));

      const v: bigint = await contract.totalPlain();
      setPlain(Number(v));
      setStatus("完成 ✅");
    } catch (e: any) {
      console.error(e);
      setStatus("❌ 失败: " + (e?.message || e));
    }
  }

  return (
    <div style={{ maxWidth: 860, margin: "48px auto", fontFamily: "system-ui" }}>
      <h1>Hello FHEVM: 私密计数器</h1>
      <p>合约地址：<code>{COUNTER_ADDR}</code></p>
      {relayerShown && (
        <p style={{ fontSize: 12, opacity: .75 }}>
          使用的 relayer：<code>{relayerShown}</code>
        </p>
      )}
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button onClick={handleAddOne}>➕ 加 1（加密提交）</button>
        <button onClick={handleReveal}>🔓 解密总数</button>
      </div>
      <p style={{ marginTop: 16 }}>状态：{status}</p>
      <p>明文总数：{plain === null ? "（未解密）" : plain}</p>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { ethers } from "ethers";

// ✅ 正确的 ABI（第1参是 bytes32 句柄）
const ABI = [
  "function add(bytes32 encryptedDelta, bytes inputProof)",
  "function requestReveal()",
  "function totalPlain() view returns (uint32)",
] as const;

// 合约地址从 .env 读取，可覆盖
const COUNTER_ADDR =
  (import.meta.env.VITE_COUNTER_ADDRESS as `0x${string}`) ||
  "0x9F8069282814a1177C1f6b8D7d8f7cC11A663554";

export default function App() {
  const [status, setStatus] = useState("idle");
  const [plain, setPlain] = useState<number | null>(null);
  const [relayerShown, setRelayerShown] = useState<string | undefined>(undefined);
  const instRef = useRef<any>(null);

  // —— 工具：连接钱包 & 切到 Sepolia ——
  async function connectWallet(): Promise<string> {
    const eth = (window as any).ethereum;
    if (!eth) throw new Error("请先安装 MetaMask");

    // 请求账户授权（这一步会弹窗）
    const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
    if (!accounts || accounts.length === 0) throw new Error("未授权任何账户");

    // 切换到 Sepolia（11155111）
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xaa36a7" }],
      });
    } catch (e: any) {
      // 如果钱包里没 Sepolia，补充添加一次
      if (e?.code === 4902) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: "0xaa36a7",
            chainName: "Sepolia",
            nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: [ (import.meta.env.VITE_RPC_URL as string) || "https://ethereum-sepolia.publicnode.com" ],
            blockExplorerUrls: ["https://sepolia.etherscan.io/"]
          }]
        });
      } else {
        throw e;
      }
    }
    return accounts[0];
  }

  // —— 页面加载：先连钱包，再初始化 SDK ——
  useEffect(() => {
    (async () => {
      try {
        setStatus("连接钱包…");
        const addr = await connectWallet();
        console.log("Connected:", addr);

        setStatus("加载 FHEVM SDK…");
        // 用官方 CDN ESM 包 & initSDK
        const mod = await import(
          /* @vite-ignore */ "https://cdn.zama.ai/relayer-sdk-js/0.2.0/relayer-sdk-js.js"
        );
        const { initSDK, createInstance, SepoliaConfig } = mod as {
          initSDK: () => Promise<void>;
          createInstance: (cfg: any) => Promise<any>;
          SepoliaConfig: any;
        };

        await initSDK(); // 加载 TFHE WASM（必须）

        const cfg: any = {
          ...SepoliaConfig,                 // 走内置的 Sepolia 配置
          network: (window as any).ethereum, // EIP-1193 provider（MetaMask）
          chainId: 11155111,
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

  // —— 工具：拿 signer + 合约实例 ——
  async function getSignerAndContract() {
    if (!(window as any).ethereum) throw new Error("请安装 MetaMask");
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    await provider.send("eth_requestAccounts", []); // 确保有账户
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(COUNTER_ADDR, ABI, signer);
    return { signer, contract, addr: await signer.getAddress() };
  }

  // —— 业务：加 1（注册密文输入 → 调合约） ——
  async function handleAddOne() {
    try {
      if (!instRef.current) throw new Error("SDK 未初始化");
      setStatus("连接钱包…");
      const { addr, contract } = await getSignerAndContract();

      setStatus("注册加密输入…");
      const buf = instRef.current.createEncryptedInput(COUNTER_ADDR, addr);
      buf.add32(1n); // 用 BigInt，保持 32-bit
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

  // —— 业务：请求解密、等待回调、读取明文 ——
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

  // —— 备用：手动“重新连接钱包”按钮（可选） ——
  async function forceReconnect() {
    try {
      setStatus("连接钱包…");
      await connectWallet();
      location.reload();
    } catch (e: any) {
      alert(e?.message || e);
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

      <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
        <button onClick={handleAddOne}>➕ 加 1（加密提交）</button>
        <button onClick={handleReveal}>🔓 解密总数</button>
        <button onClick={forceReconnect} style={{ background:"#f3f4f6" }}>🔌 重新连接钱包</button>
      </div>

      <p style={{ marginTop: 16 }}>状态：{status}</p>
      <p>明文总数：{plain === null ? "（未解密）" : plain}</p>
    </div>
  );
}

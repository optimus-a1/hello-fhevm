import { useRef, useState } from "react";
import { ethers } from "ethers";

/**
 * PrivateCounter ABI
 * 第1个参数是 bytes32（加密句柄），第2个参数是 bytes（inputProof）
 */
const ABI = [
  "function add(bytes32 encryptedDelta, bytes inputProof)",
  "function requestReveal()",
  "function totalPlain() view returns (uint32)",
] as const;

// 合约地址：优先用 .env，缺省为你的已部署地址
const COUNTER_ADDR =
  (import.meta.env.VITE_COUNTER_ADDRESS as `0x${string}`) ||
  "0x9F8069282814a1177C1f6b8D7d8f7cC11A663554";

// 选一个 EIP-1193 provider（不强制 MetaMask，任何钱包都可）
// 若存在多个注入（eth.providers），取第一个有 request 方法的
function pickProvider(): any {
  const eth = (window as any).ethereum;
  if (!eth) return null;
  if (Array.isArray(eth?.providers)) {
    const anyProv = eth.providers.find((p: any) => typeof p?.request === "function");
    if (anyProv) return anyProv;
  }
  return eth;
}

export default function App() {
  const [status, setStatus] = useState("尚未连接钱包");
  const [addr, setAddr] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [plain, setPlain] = useState<number | null>(null);
  const [relayerShown, setRelayerShown] = useState<string | undefined>(undefined);

  const providerRef = useRef<any>(null);
  const fheRef = useRef<any>(null); // SDK instance

  // —— 连接任意钱包并切换到 Sepolia（11155111），随后初始化 SDK ——
  async function connectAndInit() {
    try {
      const eth = pickProvider();
      if (!eth) throw new Error("未检测到钱包。请安装或启用任意以太坊钱包扩展后重试。");
      providerRef.current = eth;

      setStatus("请求账户授权…（请在钱包里点击同意）");
      const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
      if (!accounts?.length) throw new Error("未授权任何账户。");
      setAddr(accounts[0]);

      // 查询/记录 chainId
      const hexId: string = await eth.request({ method: "eth_chainId" });
      const currentId = parseInt(hexId, 16);
      setChainId(currentId);

      // 需要在 Sepolia（11155111）
      if (currentId !== 11155111) {
        setStatus("切换到 Sepolia…");
        try {
          await eth.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0xaa36a7" }],
          });
          setChainId(11155111);
        } catch (e: any) {
          // 钱包里没有该网络则尝试添加
          if (e?.code === 4902) {
            await eth.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: "0xaa36a7",
                chainName: "Sepolia",
                nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
                rpcUrls: [
                  (import.meta.env.VITE_RPC_URL as string) ||
                  "https://ethereum-sepolia.publicnode.com"
                ],
                blockExplorerUrls: ["https://sepolia.etherscan.io/"]
              }]
            });
            setChainId(11155111);
          } else {
            throw e;
          }
        }
      }

      setStatus("加载 FHEVM SDK…");
      // 通过官方 CDN 按需加载（需要有类型声明：src/types/zama-relayer-cdn.d.ts）
      const mod = await import(
        /* @vite-ignore */ "https://cdn.zama.ai/relayer-sdk-js/0.2.0/relayer-sdk-js.js"
      );
      const { initSDK, createInstance, SepoliaConfig } = mod as {
        initSDK: () => Promise<void>;
        createInstance: (cfg: any) => Promise<any>;
        SepoliaConfig: any;
      };

      await initSDK(); // 加载 TFHE WASM

      setStatus("创建 FHE 实例…");
      const cfg: any = {
        ...SepoliaConfig,                    // 使用内置的 Sepolia 配置
        network: providerRef.current,        // 任意钱包的 EIP-1193 provider
        chainId: 11155111,
      };
      const inst = await createInstance(cfg);
      if (typeof inst.init === "function") await inst.init();

      fheRef.current = inst;
      setRelayerShown(cfg.relayerUrl);
      setStatus("✅ 已连接 & SDK 就绪");
    } catch (e: any) {
      console.error(e);
      setStatus("❌ 连接/初始化失败: " + (e?.message || e));
    }
  }

  // —— 获取 signer + 合约实例（基于当前 provider） ——
  async function getSignerAndContract() {
    const eth = providerRef.current || pickProvider();
    if (!eth) throw new Error("未检测到钱包。");
    const browserProvider = new ethers.BrowserProvider(eth);
    await browserProvider.send("eth_requestAccounts", []);
    const signer = await browserProvider.getSigner();
    const contract = new ethers.Contract(COUNTER_ADDR, ABI, signer);
    return { signer, contract, addr: await signer.getAddress() };
  }

  // —— 加 1（注册密文输入 → 调合约） ——
  async function handleAddOne() {
    try {
      if (!fheRef.current) throw new Error("SDK 未就绪，请先连接钱包。");
      setStatus("注册加密输入…");
      const { addr, contract } = await getSignerAndContract();

      const buf = fheRef.current.createEncryptedInput(COUNTER_ADDR, addr);
      buf.add32(1n); // BigInt，确保 32-bit
      const cipher = await buf.encrypt(); // { handles: bytes32[], inputProof: bytes }

      setStatus("发送交易 add(+1)…");
      const tx = await contract.add(cipher.handles[0], cipher.inputProof);
      await tx.wait();
      setStatus("✅ 已提交 +1");
    } catch (e: any) {
      console.error(e);
      setStatus("❌ 失败: " + (e?.message || e));
    }
  }

  // —— 解密总数（requestReveal → 等回调 → 读 totalPlain） ——
  async function handleReveal() {
    try {
      if (!fheRef.current) throw new Error("SDK 未就绪，请先连接钱包。");
      setStatus("请求解密…");
      const { contract } = await getSignerAndContract();
      const tx = await contract.requestReveal();
      await tx.wait();

      setStatus("等待回调（~30s）…");
      await new Promise((r) => setTimeout(r, 30_000));

      const v: bigint = await contract.totalPlain();
      setPlain(Number(v));
      setStatus("✅ 完成");
    } catch (e: any) {
      console.error(e);
      setStatus("❌ 失败: " + (e?.message || e));
    }
  }

  return (
    <div style={{ maxWidth: 880, margin: "48px auto", fontFamily: "system-ui" }}>
      <h1>Hello FHEVM: 私密计数器</h1>
      <p>合约地址：<code>{COUNTER_ADDR}</code></p>
      {!!relayerShown && (
        <p style={{ fontSize: 12, opacity: .7 }}>
          使用的 relayer：<code>{relayerShown}</code>
        </p>
      )}

      {/* 顶部动作区 */}
      <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
        {!addr ? (
          <button onClick={connectAndInit} style={{ background: "#e5f0ff" }}>
            🔌 连接钱包并初始化
          </button>
        ) : (
          <>
            <button onClick={handleAddOne}>➕ 加 1（加密提交）</button>
            <button onClick={handleReveal}>🔓 解密总数</button>
            <button onClick={connectAndInit} style={{ background: "#f3f4f6" }}>
              ♻️ 重新连接/重新初始化
            </button>
          </>
        )}
      </div>

      {/* 状态信息 */}
      <p style={{ marginTop: 16 }}>
        状态：{status}
        {addr && (
          <>
            {"  |  "}账户：<code>{addr}</code>
          </>
        )}
        {chainId !== null && (
          <>
            {"  |  "}ChainId：<code>{chainId}</code>
          </>
        )}
      </p>
      <p>明文总数：{plain === null ? "（未解密）" : plain}</p>
    </div>
  );
}

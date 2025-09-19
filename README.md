# Hello FHEVM 私密计数器（完整教程）

本教程展示如何用 Zama FHEVM 在链上进行“私密加法”，并通过前端发起加密输入、调用合约与解密回调。

## 环境
- Node 18+ / pnpm
- MetaMask（Sepolia）
- 少量 Sepolia 测试 ETH

## 合约（hardhat）
1. 配置 `.env`：
SEPOLIA_RPC_URL=https://ethereum-sepolia.publicnode.com
PRIVATE_KEY=0x你的私钥

arduino
复制代码
2. 编译与部署：
```bash
pnpm hardhat compile
pnpm hardhat run scripts/deploy.ts --network sepolia
记录输出的合约地址（填入前端 .env）。

前端（frontend）
复制示例环境：

bash
复制代码
cp .env.example .env
# 把 VITE_COUNTER_ADDRESS 改为你的地址
运行预览：

bash
复制代码
pnpm build
npx vite preview --host 0.0.0.0 --port 5173
操作步骤：

连接钱包（Sepolia）

点击 “➕ 加 1（加密提交）”

点击 “🔓 解密总数”，等待 ~30s 回调后看到最新计数

常见问题
wrong relayer url / KMS address empty：用 SDK 内置 SepoliaConfig + network: window.ethereum + chainId: 11155111，不要随意覆盖 relayer/gateway。

b.add is not a function：buf.add32(1n) 用 BigInt；ABI 中 add 的第1参数为 bytes32（密文句柄）。

读不到明文：requestReveal() 后等待 ~30s 再读 totalPlain()。

提交物
仓库链接

Sepolia 合约地址

演示视频（或 GIF）

关键命令与交易哈希截图

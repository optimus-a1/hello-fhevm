// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * PrivateCounter：最小"私密计数器"示例
 * - add(): 接收加密输入并在密文上累加
 * - requestReveal(): 发起解密请求
 * - onReveal(): 校验签名并写入明文 totalPlain
 */
contract PrivateCounter is SepoliaConfig {
    euint32 private total;      // 密文存储
    uint32  public  totalPlain; // 明文展示
    bool    private pending;    // 防重复解密
    uint256 private lastReqId;  // 回调匹配

    constructor() {
        total = FHE.asEuint32(0);
        FHE.allowThis(total);
    }

    function add(
        externalEuint32 encryptedDelta,
        bytes calldata inputProof
    ) external {
        euint32 delta = FHE.fromExternal(encryptedDelta, inputProof);
        total = FHE.add(total, delta);
        FHE.allowThis(total);
    }

    function requestReveal() external {
        require(!pending, "Decrypting in progress");

        // ✅ 正确声明并分配句柄数组（长度 1）
        bytes32[] memory handles = new bytes32[](1);

        // ✅ 把密文 total 转成句柄
        handles[0] = FHE.toBytes32(total);

        // ✅ 发起解密请求，指定回调选择器
        lastReqId = FHE.requestDecryption(handles, this.onReveal.selector);
        pending = true;
    }

    function onReveal(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory decryptionProof
    ) external returns (bool) {
        require(requestId == lastReqId, "Invalid request id");

        // 验证签名，防伪造/重放
        FHE.checkSignatures(requestId, cleartexts, decryptionProof);

        // 我们只解了一个值，对应 uint32
        (uint32 value) = abi.decode(cleartexts, (uint32));
        totalPlain = value;
        pending = false;
        return true;
    }
}

// scripts/read-test-key.mjs
// 测试私钥唯一源:src/lib/license/testKey.ts。scripts/ 下三个涉钥脚本
// (genLicense / mock-redeem / verify-license)统一从这里 import——换测试钥
// 只改 testKey.ts 一处。node 无法直接 import .ts,故读源码文本正则抠取;
// 若 testKey.ts 格式改了不再是单行十六进制字面量,会在此显式报错,
// 而不是静默拿到错钥导致"mock 签的凭证前端验不过"式难查问题。
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../src/lib/license/testKey.ts', import.meta.url))
const m = fs.readFileSync(SRC, 'utf8').match(/TEST_PRIVATE_KEY_HEX\s*=\s*'([0-9a-fA-F]{64})'/)
if (!m) throw new Error(`无法从 ${SRC} 抠出 TEST_PRIVATE_KEY_HEX(64 位 hex 字面量),请检查格式`)
export const TEST_PRIVATE_KEY_HEX = m[1]

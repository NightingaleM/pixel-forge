// scripts/genLicense.mjs
// 开发自测造码工具:只产未兑换码 {v:1,tier,iat}(链式方案;凭证 {v:2,...} 由 redeem 换得)。
// 测试密钥对与 src/lib/license/testKey.ts 是同一对(换钥两处同步)。
// 生产签发在后端(micro_server_nest_ai),本脚本不接触生产私钥。
// 用法: node scripts/genLicense.mjs --tier day [--count 5]
import { ed25519 } from '@noble/curves/ed25519'
const TEST_PRIVATE_KEY_HEX = '585a87b0a5f2c4304597fcd18bd78368851de086b1ab126830bb961fc7fc2ff3'
const TIERS = ['day', 'week', 'month', 'year', 'lifetime']

const args = process.argv.slice(2)
const get = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined }
const tier = get('tier') ?? 'day'
const count = Number(get('count') ?? 1)
if (!TIERS.includes(tier)) { console.error(`未知 tier: ${tier}`); process.exit(1) }

const toB64Url = (bytes) => Buffer.from(bytes).toString('base64url')
for (let i = 0; i < count; i++) {
  // 键序 v/tier/iat 与后端契约逐字节一致
  const msg = Buffer.from(JSON.stringify({ v: 1, tier, iat: Math.floor(Date.now() / 1000) }), 'utf8')
  const sig = ed25519.sign(msg, TEST_PRIVATE_KEY_HEX)
  console.log(`PF1.${toB64Url(msg)}.${toB64Url(sig)}`)
}

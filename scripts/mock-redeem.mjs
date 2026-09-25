// scripts/mock-redeem.mjs
// 本地 mock 后端 redeem 接口,供浏览器回归(scripts/verify-license.mjs)与手动联调。
// 契约:POST /api/license/redeem {code, deviceId?, email?} → 200 {code:<已兑换PF1码>, tier, expAt}
//   幂等:同码重复 redeem 返回同一张已兑换码(内存 Map)
//   不验签(mock 简化):信任请求里的 code,按其 payload 的 tier 签发
// 测试密钥对与 src/lib/license/testKey.ts 是同一对(换钥两处同步)——仅 dev 回归用。
// 用法: node scripts/mock-redeem.mjs [port=3999]
import http from 'node:http'
import { ed25519 } from '@noble/curves/ed25519'

const TEST_PRIVATE_KEY_HEX = '585a87b0a5f2c4304597fcd18bd78368851de086b1ab126830bb961fc7fc2ff3'
// 时长映射与后端契约一致(redeem 时刻起算;lifetime 为固定 exp 值)
const DURATIONS = { day: 86400, week: 604800, month: 2592000, year: 31536000, lifetime: 4102444800 }
const PORT = Number(process.argv[2] || 3999)

const toB64Url = (bytes) => Buffer.from(bytes).toString('base64url')
const redeemed = new Map()   // code(未兑换) → 已兑换码,幂等语义

const server = http.createServer((req, res) => {
  // vite dev(5173)跨源调用,必须放行 CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return }
  if (req.method === 'GET') { res.writeHead(200).end('mock-redeem ok'); return }   // 存活探测
  if (req.method !== 'POST' || !req.url.startsWith('/api/license/redeem')) {
    res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'not_found' }))
    return
  }
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => {
    try {
      const { code } = JSON.parse(body)
      const payload = JSON.parse(Buffer.from(code.split('.')[1], 'base64url').toString('utf8'))
      let outCode = redeemed.get(code)
      if (!outCode) {
        const tier = payload.tier
        const expAt = tier === 'lifetime' ? DURATIONS.lifetime : Math.floor(Date.now() / 1000) + DURATIONS[tier]
        const msg = Buffer.from(JSON.stringify({ v: 1, tier, exp: expAt }), 'utf8')
        outCode = `PF1.${toB64Url(msg)}.${toB64Url(ed25519.sign(msg, TEST_PRIVATE_KEY_HEX))}`
        redeemed.set(code, outCode)
      }
      const out = JSON.parse(Buffer.from(outCode.split('.')[1], 'base64url').toString('utf8'))
      res.writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ code: outCode, tier: out.tier, expAt: out.exp }))
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'invalid_code' }))
    }
  })
})

server.listen(PORT, () => console.log(`mock-redeem listening on http://localhost:${PORT}`))

// scripts/mock-redeem.mjs
// 本地 mock 后端链式兑换接口,供浏览器回归(scripts/verify-license.mjs)与手动联调。
// 契约:docs/2026-09-25-backend-license-api.md 第 3 节(链式方案 2026-09-26 修订):
//   POST /api/license/redeem  {code, deviceId, credential?} → 200 {code:<凭证>, expAt, count}
//   POST /api/license/refresh {credential, deviceId}        → 200 同上 / 410 expired|voided
//   400 invalid_code / 409 device_exhausted|identity_conflict(body.error)
// 410 voided(2026-10-01 契约):退款作废终态,附 voidedAt/reason;mock 专用控制端点
//   POST /api/license/void {code?|cid?, reason?, at?} 标记链或未用码为已作废(回归用)。
// 状态机:未使用码 × 无凭证 → 建链成身份码(绑设备,次数-1);未使用码 × 带凭证 →
//   消耗为补充包(链 exp+=时长,次数+1);身份码重输 → 幂等重签(已知设备 0 次)。
// 不验签(mock 简化):信任请求里的码,按其 payload 处理——真后端必须验签。
// 测试密钥对与 src/lib/license/testKey.ts 是同一对(换钥两处同步)——仅 dev 回归用。
// 用法: node scripts/mock-redeem.mjs [port=3999]
import http from 'node:http'
import crypto from 'node:crypto'
import { ed25519 } from '@noble/curves/ed25519'

const TEST_PRIVATE_KEY_HEX = '585a87b0a5f2c4304597fcd18bd78368851de086b1ab126830bb961fc7fc2ff3'
const DURATIONS = { day: 86400, week: 604800, month: 2592000, year: 31536000, lifetime: 4102444800 }
const INITIAL_COUNT = 5
const PORT = Number(process.argv[2] || 3999)

const toB64Url = (bytes) => Buffer.from(bytes).toString('base64url')
const b64urlJson = (s) => JSON.parse(Buffer.from(s.split('.')[1], 'base64url').toString('utf8'))
const signCredential = (cid, exp, did) => {
  const msg = Buffer.from(JSON.stringify({ v: 2, cid, exp, did }), 'utf8')
  return `PF1.${toB64Url(msg)}.${toB64Url(ed25519.sign(msg, TEST_PRIVATE_KEY_HEX))}`
}

// 内存库:码(code→{tier,status,cid})与链(cid→{exp,count,devices})
const codes = new Map()
const chains = new Map()
const nowS = () => Math.floor(Date.now() / 1000)
const cidOf = (code) => crypto.createHash('sha256').update(code).digest('hex').slice(0, 16)
// 退款作废:链/未用码记录上挂 {at, reason},命中即 410 voided(voidedAt=at)
const voidedThrow = (v) => ({ status: 410, error: 'voided', voidedAt: v.at, reason: v.reason })

const json = (res, status, body) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body))

/** 兑换核心(纯逻辑,无 res 依赖):返回 {cid,exp,count} 供签发,或抛 {status,error}。 */
function redeem({ code, deviceId, credential }) {
  if (!deviceId || typeof deviceId !== 'string') throw { status: 400, error: 'invalid_code' }

  // 未兑换形态解析(code 在 refresh 时缺省):v1 + iat(身份码与补充包同形态,服务端按 status 区分)
  const parseCode = () => {
    if (typeof code !== 'string') throw { status: 400, error: 'invalid_code' }
    let payload
    try { payload = b64urlJson(code) } catch { throw { status: 400, error: 'invalid_code' } }
    if (payload.v !== 1 || payload.iat === undefined || payload.exp !== undefined) throw { status: 400, error: 'invalid_code' }
    if (!codes.has(code)) codes.set(code, { tier: payload.tier, status: 'unused', cid: null })
    return { payload, rec: codes.get(code) }
  }

  if (credential) {
    // 续费/刷新入口:凭证定位链(轻校验:形态与 did;真后端需验签)
    let cred
    try { cred = b64urlJson(credential) } catch { throw { status: 400, error: 'invalid_code' } }
    if (cred.v !== 2 || !cred.cid || cred.did !== deviceId) throw { status: 400, error: 'invalid_code' }
    const chain = chains.get(cred.cid)
    if (!chain) throw { status: 400, error: 'invalid_code' }
    if (chain.voided) throw voidedThrow(chain.voided)
    if (chain.exp <= nowS()) throw { status: 410, error: 'expired' }
    if (!chain.devices.has(deviceId)) throw { status: 400, error: 'invalid_code' }   // 未绑定设备不得续费(堵凭证复制洗牌)
    if (code === undefined) return { cid: cred.cid, exp: chain.exp, count: chain.count }   // refresh:幂等重签
    const { payload, rec } = parseCode()
    if (rec.voided) throw voidedThrow(rec.voided)   // 补充码本身已被退款作废
    if (rec.status === 'unused') {
      // 消耗为补充包:链 exp 延长、次数 +1
      if (payload.tier === 'lifetime') chain.exp = DURATIONS.lifetime
      else chain.exp += DURATIONS[payload.tier]
      chain.count += 1
      Object.assign(rec, { status: 'supplement', cid: cred.cid })
      return { cid: cred.cid, exp: chain.exp, count: chain.count }
    }
    if (rec.status === 'identity') {
      if (rec.cid !== cred.cid) throw { status: 409, error: 'identity_conflict' }   // 他链身份码
      return { cid: cred.cid, exp: chain.exp, count: chain.count }                  // 同链重输:幂等
    }
    throw { status: 400, error: 'invalid_code' }   // 已消耗补充包
  }

  // 激活入口(无凭证):新码建链成身份码,或身份码迁移/幂等
  const { payload, rec } = parseCode()
  if (rec.voided) throw voidedThrow(rec.voided)   // 未用码已被退款作废
  if (rec.status === 'supplement') throw { status: 400, error: 'invalid_code' }
  if (rec.status === 'unused') {
    const cid = cidOf(code)
    const exp = payload.tier === 'lifetime' ? DURATIONS.lifetime : nowS() + DURATIONS[payload.tier]
    chains.set(cid, { exp, count: INITIAL_COUNT - 1, devices: new Set([deviceId]) })   // 初始 5,首台绑定后余 4
    Object.assign(rec, { status: 'identity', cid })
    return { cid, exp, count: chains.get(cid).count }
  }
  // status=identity:幂等或绑新设备
  const chain = chains.get(rec.cid)
  if (chain.voided) throw voidedThrow(chain.voided)
  if (chain.exp <= nowS()) throw { status: 410, error: 'expired' }
  if (!chain.devices.has(deviceId)) {
    if (chain.count <= 0) throw { status: 409, error: 'device_exhausted' }
    chain.devices.add(deviceId)
    chain.count -= 1
  }
  return { cid: rec.cid, exp: chain.exp, count: chain.count }
}

/** mock 专用控制端点:标记链(按 code 或 cid)或未用码为已作废(回归场景 C5 用)。 */
function voidTarget({ code, cid, reason, at }) {
  const v = { at: at ?? new Date().toISOString(), reason: reason ?? '退款' }
  if (typeof code === 'string') {
    const rec = codes.get(code)
    if (!rec) throw { status: 404, error: 'not_found' }
    if (rec.status === 'unused') { rec.voided = v; return { cid: null } }
    cid = rec.cid   // identity/supplement 码 → 作废其所属链
  }
  if (typeof cid !== 'string') throw { status: 400, error: 'invalid_code' }
  const chain = chains.get(cid)
  if (!chain) throw { status: 404, error: 'not_found' }
  chain.voided = v
  return { cid }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return }
  if (req.method === 'GET') { res.writeHead(200).end('mock-redeem ok'); return }   // 存活探测
  const route = req.method === 'POST' && (req.url.startsWith('/api/license/redeem') || req.url.startsWith('/api/license/refresh') || req.url.startsWith('/api/license/void'))
    ? req.url.split('?')[0] : null
  if (!route) {
    res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'not_found' }))
    return
  }
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body || '{}')
      if (route.endsWith('/void')) { json(res, 200, { ok: true, ...voidTarget(parsed) }); return }
      if (route.endsWith('/refresh')) parsed.code = undefined   // refresh 只凭 credential
      const r = redeem(parsed)
      json(res, 200, { code: signCredential(r.cid, r.exp, parsed.deviceId), expAt: r.exp, count: r.count })
    } catch (e) {
      json(res, e?.status ?? 400, e?.error === 'voided'
        ? { error: 'voided', voidedAt: e.voidedAt, reason: e.reason }
        : { error: e?.error ?? 'invalid_code' })
    }
  })
})

server.listen(PORT, () => console.log(`mock-redeem(chain) listening on http://localhost:${PORT}`))

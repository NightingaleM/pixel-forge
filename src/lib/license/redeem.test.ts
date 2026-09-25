// src/lib/license/redeem.test.ts
// 兑换码方案网络流程:redeemCode(mock fetch 各分支)与 activateCode 兑换全链路
// (已兑换码离线路径 / 未兑换码 redeem / 错误分类 / 多码策略 / deviceId 持久化)。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ed25519 } from '@noble/curves/ed25519'
import { signLicense, signUnredeemed } from './emit'
import { activateCode, loadStoredCode, setLicenseStorage, setLicensePublicKey } from './verify'
import { redeemCode } from './redeem'
import { TEST_PRIVATE_KEY_HEX, TEST_PUBLIC_KEY_HEX } from './testKey'

// 内存 storage(node 无 window),同 emit.test.ts 模式
class MemStorage {
  m = new Map<string, string>()
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, v) }
  removeItem(k: string) { this.m.delete(k) }
}

const priv = TEST_PRIVATE_KEY_HEX
const NOW = 1_750_000_000_000
const IAT = 1_759_300_000

const unredeemed = signUnredeemed({ v: 1, tier: 'day', iat: IAT }, priv)
const redeemedDay = signLicense({ v: 1, tier: 'day', exp: Math.floor(NOW / 1000) + 86400 }, priv)

// mock Response:只暴露 redeemCode 依赖的形状(status/ok/json)
const res = (status: number, body?: unknown) => ({
  ok: status < 400, status, json: () => Promise.resolve(body),
})

beforeEach(() => {
  setLicenseStorage(new MemStorage())
  setLicensePublicKey(TEST_PUBLIC_KEY_HEX)
})

afterEach(() => { vi.unstubAllGlobals() })

describe('redeemCode', () => {
  it('200 → 返回响应中的已兑换码原文;请求为 POST 且 body 含 code 与 deviceId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200, { code: redeemedDay, tier: 'day', expAt: NOW / 1000 + 86400 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await redeemCode(unredeemed, 'dev-1')
    expect(r).toEqual({ ok: true, code: redeemedDay })
    const [url, init] = fetchMock.mock.calls[0]
    // vitest 会加载 .env.local 的 VITE_API_BASE,断言只锚定路径部分(与 env 注入与否无关)
    expect(url).toMatch(/^(?:http:\/\/localhost:3999)?\/api\/license\/redeem$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ code: unredeemed, deviceId: 'dev-1', email: undefined })
  })

  it('400 invalid_code → invalid_code;409 → device_limit;429 → rate_limited', async () => {
    vi.stubGlobal('fetch',
      vi.fn().mockResolvedValueOnce(res(400, { error: 'invalid_code' }))
        .mockResolvedValueOnce(res(409, { error: 'device_limit' }))
        .mockResolvedValueOnce(res(429, { error: 'too_many_requests' })))
    expect(await redeemCode(unredeemed, 'dev-1')).toEqual({ ok: false, reason: 'invalid_code' })
    expect(await redeemCode(unredeemed, 'dev-1')).toEqual({ ok: false, reason: 'device_limit' })
    expect(await redeemCode(unredeemed, 'dev-1')).toEqual({ ok: false, reason: 'rate_limited' })
  })

  it('fetch reject / 500 / 200 但响应缺 code → network', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockRejectedValueOnce(new Error('net down'))
      .mockResolvedValueOnce(res(500, { error: 'internal' }))
      .mockResolvedValueOnce(res(200, { tier: 'day', expAt: 1 })))
    expect(await redeemCode(unredeemed, 'dev-1')).toEqual({ ok: false, reason: 'network' })
    expect(await redeemCode(unredeemed, 'dev-1')).toEqual({ ok: false, reason: 'network' })
    expect(await redeemCode(unredeemed, 'dev-1')).toEqual({ ok: false, reason: 'network' })
  })
})

describe('activateCode(兑换码方案)', () => {
  it('已兑换码:离线直接存储,不发任何网络请求(客服手工签发兼容路径)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const r = await activateCode(redeemedDay, NOW)
    expect(r).toEqual({ ok: true, tier: 'day', expAt: Math.floor(NOW / 1000) + 86400 })
    expect(loadStoredCode()).toBe(redeemedDay)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('未兑换码:走 redeem,验返回码后存储并返回其 tier/expAt', async () => {
    const expAt = Math.floor(NOW / 1000) + 86400
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(200, { code: redeemedDay, tier: 'day', expAt })))
    const r = await activateCode(unredeemed, NOW)
    expect(r).toEqual({ ok: true, tier: 'day', expAt })
    expect(loadStoredCode()).toBe(redeemedDay)
  })

  it('未兑换码断网 → network 错误,不触碰存储', async () => {
    await activateCode(signLicense({ v: 1, tier: 'year', exp: Math.floor(NOW / 1000) + 3e7 }, priv), NOW)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net down')))
    expect(await activateCode(unredeemed, NOW)).toEqual({ ok: false, reason: 'network' })
    expect(loadStoredCode() !== unredeemed).toBe(true)   // 未兑换码绝不能入存储区
  })

  it('未兑换码 409 → device_limit;400 → signature(后端不认码=联系卖家)', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(res(409, { error: 'device_limit' }))
      .mockResolvedValueOnce(res(400, { error: 'invalid_code' })))
    expect(await activateCode(unredeemed, NOW)).toEqual({ ok: false, reason: 'device_limit' })
    expect(await activateCode(unredeemed, NOW)).toEqual({ ok: false, reason: 'signature' })
  })

  it('redeem 返回的码验签失败(另一把私钥签) → signature,不存储', async () => {
    // 动态生成"伪后端"私钥(hex):签出的码过不了前端公钥验签
    const rogue = Buffer.from(ed25519.utils.randomPrivateKey()).toString('hex')
    const rogueCode = signLicense({ v: 1, tier: 'day', exp: Math.floor(NOW / 1000) + 86400 }, rogue)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(200, { code: rogueCode, tier: 'day', expAt: 1 })))
    expect(await activateCode(unredeemed, NOW)).toEqual({ ok: false, reason: 'signature' })
    expect(loadStoredCode()).toBe(null)
  })

  it('deviceId:首次兑换生成并持久化,二次兑换复用同一 id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200, { code: redeemedDay, tier: 'day', expAt: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    await activateCode(unredeemed, NOW)
    const id1 = JSON.parse(fetchMock.mock.calls[0][1].body).deviceId
    expect(typeof id1).toBe('string')
    await activateCode(signUnredeemed({ v: 1, tier: 'week', iat: IAT }, priv), NOW)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).deviceId).toBe(id1)
  })

  it('多码策略:redeem 所得 exp 更晚 → 覆盖;更早 → 保留现存', async () => {
    const early = signLicense({ v: 1, tier: 'day', exp: Math.floor(NOW / 1000) + 100 }, priv)
    const late = signLicense({ v: 1, tier: 'year', exp: Math.floor(NOW / 1000) + 3e7 }, priv)
    await activateCode(late, NOW)   // 离线路径先存一张晚码
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(200, { code: early, tier: 'day', expAt: 1 })))
    await activateCode(unredeemed, NOW)
    expect(loadStoredCode()).toBe(late)   // 兑换所得更早,不覆盖
  })

  it('垃圾输入 → format,不发网络请求;过期已兑换码 → expired(不 redeem)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await activateCode('garbage', NOW)).toEqual({ ok: false, reason: 'format' })
    const expired = signLicense({ v: 1, tier: 'day', exp: Math.floor(NOW / 1000) - 1 }, priv)
    expect(await activateCode(expired, NOW)).toEqual({ ok: false, reason: 'expired' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('非安全上下文(http://局域网IP,无 crypto.randomUUID)下 deviceId 仍可生成并兑换', async () => {
    // 复现:浏览器仅在 secure context(https/localhost)提供 randomUUID
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) })
    const fetchMock = vi.fn().mockResolvedValue(res(200, { code: redeemedDay, tier: 'day', expAt: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await activateCode(unredeemed, NOW)
    expect(r.ok).toBe(true)
    const id = JSON.parse(fetchMock.mock.calls[0][1].body).deviceId
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(loadStoredCode()).toBe(redeemedDay)
  })
})

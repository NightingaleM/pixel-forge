// src/lib/license/redeem.test.ts
// 链式方案网络流程:redeemActivate/redeemRenew/redeemRefresh(mock fetch 各分支)、
// activateCode/renewCode/refreshCredential 全链路(错误分类、凭证存储、did 绑定)、
// getLicenseStatus 设备绑定判定、deviceId 持久化与非安全上下文降级;
// voided 退款作废终态(2026-10-01 契约:410 body.error 区分,标记失效与短路)。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ed25519 } from '@noble/curves/ed25519'
import { signUnredeemed, signCredential } from './emit'
import {
  activateCode, renewCode, refreshCredential, getLicenseStatus, getVoidedInfo,
  loadStoredCredential, getOrCreateDeviceId, setLicenseStorage, setLicensePublicKey,
} from './verify'
import { redeemActivate, redeemRefresh } from './redeem'
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
const NOW_S = Math.floor(NOW / 1000)
const CID = 'abcdef0123456789'

const unredeemedA = signUnredeemed({ v: 1, tier: 'day', iat: NOW_S }, priv)
const unredeemedB = signUnredeemed({ v: 1, tier: 'week', iat: NOW_S }, priv)
// 后端应答凭证(mock 返回什么前端就验什么,由用例动态签发更真实)
const credentialFor = (did: string, exp: number) => signCredential({ v: 2, cid: CID, exp, did }, priv)

// mock Response:只暴露 redeem.ts 依赖的形状(status/ok/json)
const res = (status: number, body?: unknown) => ({
  ok: status < 400, status, json: () => Promise.resolve(body),
})

beforeEach(() => {
  setLicenseStorage(new MemStorage())
  setLicensePublicKey(TEST_PUBLIC_KEY_HEX)
})

afterEach(() => { vi.unstubAllGlobals() })

describe('redeem 三接口(mock fetch)', () => {
  it('redeemActivate:POST /api/license/redeem,body 只含 code 与 deviceId(无 credential)', async () => {
    const cred = credentialFor('dev-1', NOW_S + 86400)
    const fetchMock = vi.fn().mockResolvedValue(res(200, { code: cred, expAt: NOW_S + 86400, count: 4 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await redeemActivate(unredeemedA, 'dev-1')
    expect(r).toEqual({ ok: true, code: cred, expAt: NOW_S + 86400, count: 4 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/^(?:http:\/\/localhost:3999)?\/api\/license\/redeem$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ code: unredeemedA, deviceId: 'dev-1' })
  })

  it('redeemRenew:body 含 credential;redeemRefresh:打 /api/license/refresh', async () => {
    const did = getOrCreateDeviceId()
    const fetchMock = vi.fn().mockResolvedValueOnce(res(200, { code: credentialFor(did, NOW_S + 86400), expAt: NOW_S + 86400, count: 4 }))
    vi.stubGlobal('fetch', fetchMock)
    await activateCode(unredeemedA, NOW)   // 本地先持有效凭证,供 renew 自动携带
    const credentialAtRenew = loadStoredCredential()
    fetchMock.mockResolvedValue(res(200, { code: credentialFor(did, NOW_S + 2 * 86400), expAt: NOW_S + 2 * 86400, count: 5 }))
    const r = await renewCode(unredeemedB, NOW)
    expect(r).toEqual({ ok: true, expAt: NOW_S + 2 * 86400, count: 5 })
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toMatch(/\/api\/license\/redeem$/)
    expect(JSON.parse(init.body).credential).toBe(credentialAtRenew)

    fetchMock.mockResolvedValue(res(200, { code: credentialFor(did, NOW_S + 3 * 86400), expAt: NOW_S + 3 * 86400, count: 5 }))
    const rf = await refreshCredential(NOW)
    expect(rf).toEqual({ ok: true, expAt: NOW_S + 3 * 86400, count: 5 })
    expect(fetchMock.mock.calls[2][0]).toMatch(/\/api\/license\/refresh$/)
  })

  it('409 按 body.error 区分 device_exhausted / identity_conflict;400/429/410 映射', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(res(409, { error: 'device_exhausted' }))
      .mockResolvedValueOnce(res(409, { error: 'identity_conflict' }))
      .mockResolvedValueOnce(res(400, { error: 'invalid_code' }))
      .mockResolvedValueOnce(res(429, { error: 'too_many_requests' }))
      .mockResolvedValueOnce(res(410, { error: 'expired' })))
    expect(await redeemActivate(unredeemedA, 'dev-1')).toEqual({ ok: false, reason: 'device_exhausted' })
    expect(await redeemActivate(unredeemedA, 'dev-1')).toEqual({ ok: false, reason: 'identity_conflict' })
    expect(await redeemActivate(unredeemedA, 'dev-1')).toEqual({ ok: false, reason: 'invalid_code' })
    expect(await redeemActivate(unredeemedA, 'dev-1')).toEqual({ ok: false, reason: 'rate_limited' })
    expect(await redeemRefresh('PF1.x.y', 'dev-1')).toEqual({ ok: false, reason: 'expired' })
  })

  it('fetch reject / 500 / 200 但响应缺 code → network', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockRejectedValueOnce(new Error('net down'))
      .mockResolvedValueOnce(res(500, { error: 'internal' }))
      .mockResolvedValueOnce(res(200, { expAt: 1, count: 1 })))
    expect(await redeemActivate(unredeemedA, 'dev-1')).toEqual({ ok: false, reason: 'network' })
    expect(await redeemActivate(unredeemedA, 'dev-1')).toEqual({ ok: false, reason: 'network' })
    expect(await redeemActivate(unredeemedA, 'dev-1')).toEqual({ ok: false, reason: 'network' })
  })
})

describe('activateCode(激活入口)', () => {
  it('未兑换码 → redeem → 验返回凭证(did 匹配本机)→ 存储凭证与次数,返回 expAt/count', async () => {
    const cred = credentialFor(getOrCreateDeviceId(), NOW_S + 86400)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(200, { code: cred, expAt: NOW_S + 86400, count: 4 })))
    const r = await activateCode(unredeemedA, NOW)
    expect(r).toEqual({ ok: true, expAt: NOW_S + 86400, count: 4 })
    expect(loadStoredCredential()).toBe(cred)
  })

  it('返回凭证验签失败(另一把私钥签)→ signature,不存储', async () => {
    const rogue = Buffer.from(ed25519.utils.randomPrivateKey()).toString('hex')
    const rogueCred = signCredential({ v: 2, cid: CID, exp: NOW_S + 86400, did: getOrCreateDeviceId() }, rogue)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(200, { code: rogueCred, expAt: 1, count: 1 })))
    expect(await activateCode(unredeemedA, NOW)).toEqual({ ok: false, reason: 'signature' })
    expect(loadStoredCredential()).toBe(null)
  })

  it('返回凭证 did ≠ 本机 deviceId → signature,不存储(不信响应体)', async () => {
    const alien = credentialFor('another-device', NOW_S + 86400)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(200, { code: alien, expAt: 1, count: 1 })))
    expect(await activateCode(unredeemedA, NOW)).toEqual({ ok: false, reason: 'signature' })
    expect(loadStoredCredential()).toBe(null)
  })

  it('400 invalid_code → used(本地验签已过的码被后端拒=已消耗,提示"已被使用")', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(400, { error: 'invalid_code' })))
    expect(await activateCode(unredeemedA, NOW)).toEqual({ ok: false, reason: 'used' })
  })

  it('断网 → network;409 device_exhausted 直传;不触碰存储', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockRejectedValueOnce(new Error('net down'))
      .mockResolvedValueOnce(res(409, { error: 'device_exhausted' })))
    expect(await activateCode(unredeemedA, NOW)).toEqual({ ok: false, reason: 'network' })
    expect(await activateCode(unredeemedA, NOW)).toEqual({ ok: false, reason: 'device_exhausted' })
    expect(loadStoredCredential()).toBe(null)
  })

  it('垃圾输入 / v2 凭证文本 / 旧格式 v1 已兑换码 → format,不发网络请求', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await activateCode('garbage', NOW)).toEqual({ ok: false, reason: 'format' })
    expect(await activateCode(credentialFor('dev-1', NOW_S + 86400), NOW)).toEqual({ ok: false, reason: 'format' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('deviceId:首次兑换生成并持久化,二次兑换复用同一 id', async () => {
    const cred1 = credentialFor(getOrCreateDeviceId(), NOW_S + 86400)
    const fetchMock = vi.fn().mockResolvedValue(res(200, { code: cred1, expAt: 1, count: 4 }))
    vi.stubGlobal('fetch', fetchMock)
    await activateCode(unredeemedA, NOW)
    const id1 = JSON.parse(fetchMock.mock.calls[0][1].body).deviceId
    expect(typeof id1).toBe('string')
    const cred2 = signCredential({ v: 2, cid: CID, exp: NOW_S + 86400, did: id1 }, priv)
    fetchMock.mockResolvedValue(res(200, { code: cred2, expAt: 1, count: 4 }))
    await activateCode(unredeemedB, NOW)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).deviceId).toBe(id1)
  })

  it('非安全上下文(无 crypto.randomUUID)下 deviceId 仍可生成并兑换', async () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) })
    const id = getOrCreateDeviceId()
    const cred = credentialFor(id, NOW_S + 86400)
    const fetchMock = vi.fn().mockResolvedValue(res(200, { code: cred, expAt: 1, count: 4 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await activateCode(unredeemedA, NOW)
    expect(r.ok).toBe(true)
    const sentId = JSON.parse(fetchMock.mock.calls[0][1].body).deviceId
    expect(sentId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('renewCode / refreshCredential(续费与刷新,会员态)', () => {
  it('续费成功:新凭证覆盖存储(链 exp 延长),次数更新', async () => {
    const did = getOrCreateDeviceId()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(res(200, { code: credentialFor(did, NOW_S + 86400), expAt: NOW_S + 86400, count: 4 }))
      .mockResolvedValueOnce(res(200, { code: credentialFor(did, NOW_S + 86400 + 604800), expAt: NOW_S + 86400 + 604800, count: 5 })))
    await activateCode(unredeemedA, NOW)
    const r = await renewCode(unredeemedB, NOW)
    expect(r).toEqual({ ok: true, expAt: NOW_S + 86400 + 604800, count: 5 })
    expect(getLicenseStatus(NOW)).toEqual({ active: true, expAt: NOW_S + 86400 + 604800 })
  })

  it('无凭证续费 → format 不发网;凭证已过期 → expired 不发网', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await renewCode(unredeemedB, NOW)).toEqual({ ok: false, reason: 'format' })
    // 手塞一张过期凭证(绕过 activate),续费应离线拒绝
    const s = new MemStorage()
    s.setItem('pixel-forge.license.v2', credentialFor(getOrCreateDeviceId(), NOW_S - 1))
    setLicenseStorage(s)
    expect(await renewCode(unredeemedB, NOW)).toEqual({ ok: false, reason: 'expired' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('刷新:410 → expired;成功 → 凭证与到期日更新', async () => {
    const did = getOrCreateDeviceId()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(res(200, { code: credentialFor(did, NOW_S + 86400), expAt: NOW_S + 86400, count: 4 })))
    await activateCode(unredeemedA, NOW)
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(res(410, { error: 'expired' }))
      .mockResolvedValueOnce(res(200, { code: credentialFor(did, NOW_S + 172800), expAt: NOW_S + 172800, count: 4 })))
    expect(await refreshCredential(NOW)).toEqual({ ok: false, reason: 'expired' })
    expect(await refreshCredential(NOW)).toEqual({ ok: true, expAt: NOW_S + 172800, count: 4 })
  })
})

describe('voided 终态(退款作废,410 增补契约)', () => {
  const VOIDED_AT = '2026-09-28T10:00:00.000Z'
  const VOID_REASON = '退款 #1024'
  const voidedRes = () => res(410, { error: 'voided', voidedAt: VOIDED_AT, reason: VOID_REASON })

  it('410 按 body.error 区分:voided 携 voidedAt/voidReason;体不可读 → expired(向后兼容)', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(voidedRes())
      .mockResolvedValueOnce({ ok: false, status: 410, json: () => Promise.reject(new Error('bad body')) }))
    expect(await redeemRefresh('PF1.x.y', 'dev-1')).toEqual({
      ok: false, reason: 'voided', voidedAt: VOIDED_AT, voidReason: VOID_REASON,
    })
    expect(await redeemRefresh('PF1.x.y', 'dev-1')).toEqual({ ok: false, reason: 'expired' })
  })

  it('刷新遇 voided:返回作废信息,凭证与会员态标记失效;再次刷新不发网(终态停止重试)', async () => {
    const did = getOrCreateDeviceId()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(res(200, { code: credentialFor(did, NOW_S + 86400), expAt: NOW_S + 86400, count: 4 })))
    await activateCode(unredeemedA, NOW)
    expect(getLicenseStatus(NOW)).toEqual({ active: true, expAt: NOW_S + 86400 })

    const fetchMock = vi.fn().mockResolvedValue(voidedRes())
    vi.stubGlobal('fetch', fetchMock)
    expect(await refreshCredential(NOW)).toEqual({
      ok: false, reason: 'voided', voidedAt: VOIDED_AT, voidReason: VOID_REASON,
    })
    expect(getLicenseStatus(NOW)).toEqual({ active: false })
    expect(getVoidedInfo()).toEqual({ voidedAt: VOIDED_AT, reason: VOID_REASON })

    fetchMock.mockClear()
    expect(await refreshCredential(NOW)).toEqual({
      ok: false, reason: 'voided', voidedAt: VOIDED_AT, voidReason: VOID_REASON,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('续费遇 voided:同样标记本机凭证失效', async () => {
    const did = getOrCreateDeviceId()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(res(200, { code: credentialFor(did, NOW_S + 86400), expAt: NOW_S + 86400, count: 4 }))
      .mockResolvedValueOnce(voidedRes()))
    await activateCode(unredeemedA, NOW)
    expect(await renewCode(unredeemedB, NOW)).toEqual({
      ok: false, reason: 'voided', voidedAt: VOIDED_AT, voidReason: VOID_REASON,
    })
    expect(getLicenseStatus(NOW)).toEqual({ active: false })
    expect(getVoidedInfo()).toEqual({ voidedAt: VOIDED_AT, reason: VOID_REASON })
  })

  it('激活遇 voided:返回作废信息但不标记本机凭证(作废的是贴入的码,可能异链)', async () => {
    const did = getOrCreateDeviceId()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(res(200, { code: credentialFor(did, NOW_S + 86400), expAt: NOW_S + 86400, count: 4 }))
      .mockResolvedValueOnce(voidedRes()))
    await activateCode(unredeemedA, NOW)
    expect(await activateCode(unredeemedB, NOW)).toEqual({
      ok: false, reason: 'voided', voidedAt: VOIDED_AT, voidReason: VOID_REASON,
    })
    expect(getVoidedInfo()).toBe(null)
    expect(getLicenseStatus(NOW)).toEqual({ active: true, expAt: NOW_S + 86400 })
  })

  it('作废后成功激活新码:标记清除,会员态恢复', async () => {
    const did = getOrCreateDeviceId()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(res(200, { code: credentialFor(did, NOW_S + 86400), expAt: NOW_S + 86400, count: 4 })))
    await activateCode(unredeemedA, NOW)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(voidedRes()))
    await refreshCredential(NOW)
    expect(getLicenseStatus(NOW)).toEqual({ active: false })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      res(200, { code: credentialFor(did, NOW_S + 172800), expAt: NOW_S + 172800, count: 4 })))
    expect(await activateCode(unredeemedB, NOW)).toEqual({ ok: true, expAt: NOW_S + 172800, count: 4 })
    expect(getVoidedInfo()).toBe(null)
    expect(getLicenseStatus(NOW)).toEqual({ active: true, expAt: NOW_S + 172800 })
  })

  it('标记与当前凭证异链(cid 不匹配)不生效:防手改存储残留误伤', async () => {
    const did = getOrCreateDeviceId()
    const s = new MemStorage()
    s.setItem('pixel-forge.deviceId.v1', did)
    s.setItem('pixel-forge.license.v2', credentialFor(did, NOW_S + 86400))
    s.setItem('pixel-forge.licenseVoided.v1', JSON.stringify({ cid: '0000000000000000', at: VOIDED_AT, reason: VOID_REASON }))
    setLicenseStorage(s)
    expect(getLicenseStatus(NOW)).toEqual({ active: true, expAt: NOW_S + 86400 })
    expect(getVoidedInfo()).toBe(null)
  })
})

describe('getLicenseStatus(设备绑定判定)', () => {
  it('凭证有效且 did 匹配本机 → active;deviceId 丢失/被改 → inactive(凭证复制到别的设备无效)', async () => {
    const did = getOrCreateDeviceId()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(200, { code: credentialFor(did, NOW_S + 86400), expAt: NOW_S + 86400, count: 4 })))
    await activateCode(unredeemedA, NOW)
    expect(getLicenseStatus(NOW)).toEqual({ active: true, expAt: NOW_S + 86400 })
    // 模拟另一设备:同凭证、不同 deviceId(手改本地 deviceId 键)
    const s2 = new MemStorage()
    s2.setItem('pixel-forge.license.v2', loadStoredCredential() ?? '')
    s2.setItem('pixel-forge.deviceId.v1', 'another-device')
    setLicenseStorage(s2)
    expect(getLicenseStatus(NOW)).toEqual({ active: false })
  })

  it('storage 为 null 时一切安全回落', async () => {
    setLicenseStorage(null)
    expect(loadStoredCredential()).toBe(null)
    expect(getLicenseStatus(NOW)).toEqual({ active: false })
    expect((await activateCode('garbage', NOW)).ok).toBe(false)
  })
})

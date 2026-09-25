// src/lib/license/emit.test.ts
// 签发/验签 roundtrip 与三类失败(格式/签名/过期)、未兑换码契约(兑换码方案)、
// 激活存储策略、storage 健壮性。
import { describe, it, expect, beforeEach } from 'vitest'
import { signLicense, signUnredeemed, type LicensePayload, type UnredeemedPayload } from './emit'
import {
  parseLicenseCode, parseUnredeemedCode, activateCode, loadStoredCode,
  setLicenseStorage, setLicensePublicKey,
} from './verify'
import { TEST_PRIVATE_KEY_HEX, TEST_PUBLIC_KEY_HEX } from './testKey'

// 内存 storage(node 无 window),同 presetStore 测试模式
class MemStorage {
  m = new Map<string, string>()
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, v) }
  removeItem(k: string) { this.m.delete(k) }
}

const priv = TEST_PRIVATE_KEY_HEX
const NOW = 1_750_000_000_000

beforeEach(() => {
  setLicenseStorage(new MemStorage())
  setLicensePublicKey(TEST_PUBLIC_KEY_HEX)
})

const day: LicensePayload = { v: 1, tier: 'day', exp: Math.floor(NOW / 1000) + 86400 }

describe('signLicense / parseLicenseCode', () => {
  it('roundtrip:签发→解析回同 tier/exp', () => {
    const code = signLicense(day, priv)
    expect(code.startsWith('PF1.')).toBe(true)
    const r = parseLicenseCode(code, NOW)
    expect(r).toEqual({ ok: true, tier: 'day', expAt: day.exp })
  })

  it('篡改 payload 任一字符 → signature 失败', () => {
    const code = signLicense(day, priv)
    const parts = code.split('.')
    // 篡改 payload 段中间字符:尾字符仅高 2 位有效且 atob 宽容丢弃越界位,
    // 替换尾字符字节可能不变;中间字符每一位都映射到字节,必然改变
    const mid = 5
    parts[1] = parts[1].slice(0, mid) + (parts[1][mid] === 'A' ? 'B' : 'A') + parts[1].slice(mid + 1)
    const r = parseLicenseCode(parts.join('.'), NOW)
    expect(r).toEqual({ ok: false, reason: 'signature' })
  })

  it('篡改 signature → signature 失败', () => {
    const code = signLicense(day, priv)
    const parts = code.split('.')
    const mid = 5
    parts[2] = parts[2].slice(0, mid) + (parts[2][mid] === 'A' ? 'B' : 'A') + parts[2].slice(mid + 1)
    expect(parseLicenseCode(parts.join('.'), NOW)).toEqual({ ok: false, reason: 'signature' })
  })

  it('exp 已过 → expired', () => {
    const expired = signLicense({ v: 1, tier: 'day', exp: Math.floor(NOW / 1000) - 1 }, priv)
    expect(parseLicenseCode(expired, NOW)).toEqual({ ok: false, reason: 'expired' })
  })

  it('格式错:非 PF1 前缀 / 段数不对 / 非法 b64url / 非法 JSON', () => {
    expect(parseLicenseCode('XX1.a.b', NOW)).toEqual({ ok: false, reason: 'format' })
    expect(parseLicenseCode('PF1.only-two', NOW)).toEqual({ ok: false, reason: 'format' })
    expect(parseLicenseCode('PF1.!!??.zzzz', NOW)).toEqual({ ok: false, reason: 'format' })
    // 合法 b64url 但内容不是 JSON
    const notJson = Buffer.from('not json').toString('base64url')
    expect(parseLicenseCode(`PF1.${notJson}.x`, NOW)).toEqual({ ok: false, reason: 'format' })
  })
})

describe('signUnredeemed / parseUnredeemedCode', () => {
  const unredeemed: UnredeemedPayload = { v: 1, tier: 'week', iat: 1_759_300_000 }

  it('roundtrip:未兑换码解析回同 tier/iat(永不过期,无 expired 分支)', () => {
    const code = signUnredeemed(unredeemed, priv)
    expect(code.startsWith('PF1.')).toBe(true)
    expect(parseUnredeemedCode(code)).toEqual({ ok: true, tier: 'week', iat: 1_759_300_000 })
  })

  it('payload 键序 v/tier/iat 紧凑 JSON(与后端契约逐字节一致)', () => {
    const code = signUnredeemed({ v: 1, tier: 'day', iat: 1_759_300_000 }, priv)
    const b64 = code.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    expect(Buffer.from(b64, 'base64').toString('utf8')).toBe('{"v":1,"tier":"day","iat":1759300000}')
  })

  it('篡改 payload → signature 失败', () => {
    const code = signUnredeemed(unredeemed, priv)
    const parts = code.split('.')
    const mid = 5
    parts[1] = parts[1].slice(0, mid) + (parts[1][mid] === 'A' ? 'B' : 'A') + parts[1].slice(mid + 1)
    expect(parseUnredeemedCode(parts.join('.'))).toEqual({ ok: false, reason: 'signature' })
  })

  it('未兑换码交给 parseLicenseCode → format(存储区只认已兑换码,未兑换码永不判为活跃会员)', () => {
    expect(parseLicenseCode(signUnredeemed(unredeemed, priv), NOW)).toEqual({ ok: false, reason: 'format' })
  })

  it('已兑换码(有 exp 无 iat)交给 parseUnredeemedCode → format(两类码互斥)', () => {
    expect(parseUnredeemedCode(signLicense(day, priv))).toEqual({ ok: false, reason: 'format' })
  })
})

describe('activateCode', () => {
  it('首次激活存储码原文;重输同码幂等', async () => {
    const code = signLicense(day, priv)
    expect((await activateCode(code, NOW)).ok).toBe(true)
    expect(loadStoredCode()).toBe(code)
    expect((await activateCode(code, NOW)).ok).toBe(true)
    expect(loadStoredCode()).toBe(code)
  })

  it('新码 exp 更早 → 不覆盖现存;更晚 → 覆盖', async () => {
    const late = signLicense({ v: 1, tier: 'year', exp: Math.floor(NOW / 1000) + 3e7 }, priv)
    const early = day
    await activateCode(late, NOW)
    await activateCode(signLicense(early, priv), NOW)   // 更早,不覆盖
    expect(loadStoredCode()).toBe(late)
    const later = signLicense({ v: 1, tier: 'lifetime', exp: 4102444800 }, priv)
    await activateCode(later, NOW)
    expect(loadStoredCode()).toBe(later)
  })

  it('坏码不触碰已存码', async () => {
    const code = signLicense(day, priv)
    await activateCode(code, NOW)
    await activateCode('garbage', NOW)
    expect(loadStoredCode()).toBe(code)
  })
})

describe('storage 健壮性', () => {
  it('storage 为 null 时一切安全回落', async () => {
    setLicenseStorage(null)
    expect(loadStoredCode()).toBe(null)
    expect((await activateCode(signLicense(day, priv), NOW)).ok).toBe(true)  // 验签仍通过,只是不持久化
  })
})

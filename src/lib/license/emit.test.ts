// src/lib/license/emit.test.ts
// 签发/解析契约(链式方案):未兑换码 {v:1,tier,iat} 与隐藏凭证 {v:2,cid,exp,did}
// 的 roundtrip、键序逐字节一致、篡改/过期失败、两类码互斥、旧格式 v:1 凭证拒收。
import { describe, it, expect, beforeEach } from 'vitest'
import { ed25519 } from '@noble/curves/ed25519'
import { signUnredeemed, signCredential, type UnredeemedPayload, type CredentialPayload } from './emit'
import {
  parseUnredeemedCode, parseCredential, setLicenseStorage, setLicensePublicKey,
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

describe('signCredential / parseCredential(隐藏凭证 v2)', () => {
  const cred: CredentialPayload = { v: 2, cid: 'abcdef0123456789', exp: Math.floor(NOW / 1000) + 86400, did: 'dev-1' }

  it('roundtrip:签发→解析回同 cid/exp/did', () => {
    const code = signCredential(cred, priv)
    expect(code.startsWith('PF1.')).toBe(true)
    expect(parseCredential(code, NOW)).toEqual({ ok: true, cid: cred.cid, expAt: cred.exp, did: 'dev-1' })
  })

  it('payload 键序 v/cid/exp/did 紧凑 JSON(与后端契约逐字节一致)', () => {
    const code = signCredential(cred, priv)
    const b64 = code.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    expect(Buffer.from(b64, 'base64').toString('utf8'))
      .toBe('{"v":2,"cid":"abcdef0123456789","exp":1750086400,"did":"dev-1"}')
  })

  it('篡改 payload → signature 失败', () => {
    const parts = signCredential(cred, priv).split('.')
    const mid = 5
    parts[1] = parts[1].slice(0, mid) + (parts[1][mid] === 'A' ? 'B' : 'A') + parts[1].slice(mid + 1)
    expect(parseCredential(parts.join('.'), NOW)).toEqual({ ok: false, reason: 'signature' })
  })

  it('篡改 signature → signature 失败', () => {
    const parts = signCredential(cred, priv).split('.')
    const mid = 5
    parts[2] = parts[2].slice(0, mid) + (parts[2][mid] === 'A' ? 'B' : 'A') + parts[2].slice(mid + 1)
    expect(parseCredential(parts.join('.'), NOW)).toEqual({ ok: false, reason: 'signature' })
  })

  it('exp 已过 → expired', () => {
    const expired = signCredential({ ...cred, exp: Math.floor(NOW / 1000) - 1 }, priv)
    expect(parseCredential(expired, NOW)).toEqual({ ok: false, reason: 'expired' })
  })

  it('格式错:v≠2 / cid 非 16 hex / did 缺失 / exp 非数', () => {
    const mk = (payload: Record<string, unknown>) => {
      const msg = Buffer.from(JSON.stringify(payload), 'utf8')
      return `PF1.${msg.toString('base64url')}.${Buffer.from(ed25519.sign(msg, priv)).toString('base64url')}`
    }
    expect(parseCredential(mk({ v: 2, cid: 'XYZ', exp: cred.exp, did: 'dev-1' }), NOW)).toEqual({ ok: false, reason: 'format' })
    expect(parseCredential(mk({ v: 2, cid: cred.cid, exp: cred.exp }), NOW)).toEqual({ ok: false, reason: 'format' })
    expect(parseCredential(mk({ v: 2, cid: cred.cid, exp: 'soon', did: 'dev-1' }), NOW)).toEqual({ ok: false, reason: 'format' })
    expect(parseCredential(mk({ v: 1, tier: 'day', iat: 1 }), NOW)).toEqual({ ok: false, reason: 'format' })
  })

  it('旧格式 v1 已兑换码(有 tier 无 cid)→ format(链式方案清洁切换,旧码全部作废)', () => {
    const msg = Buffer.from(JSON.stringify({ v: 1, tier: 'day', exp: Math.floor(NOW / 1000) + 86400 }), 'utf8')
    const legacy = `PF1.${msg.toString('base64url')}.${Buffer.from(ed25519.sign(msg, priv)).toString('base64url')}`
    expect(parseCredential(legacy, NOW)).toEqual({ ok: false, reason: 'format' })
  })
})

describe('signUnredeemed / parseUnredeemedCode(未兑换码,契约不变)', () => {
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
    const parts = signUnredeemed(unredeemed, priv).split('.')
    const mid = 5
    parts[1] = parts[1].slice(0, mid) + (parts[1][mid] === 'A' ? 'B' : 'A') + parts[1].slice(mid + 1)
    expect(parseUnredeemedCode(parts.join('.'))).toEqual({ ok: false, reason: 'signature' })
  })

  it('隐藏凭证(v2)交给 parseUnredeemedCode → format(两类码互斥)', () => {
    const cred: CredentialPayload = { v: 2, cid: 'abcdef0123456789', exp: 1, did: 'dev-1' }
    expect(parseUnredeemedCode(signCredential(cred, priv))).toEqual({ ok: false, reason: 'format' })
  })
})

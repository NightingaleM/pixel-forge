// src/lib/license/gating.test.ts
// 导出决策:免费额度内无水印(逐次消耗)、超额角落、免费批量平铺不耗额度、会员全免。
import { describe, it, expect, beforeEach } from 'vitest'
import { signLicense } from './emit'
import { activateCode, setLicenseStorage, setLicensePublicKey } from './verify'
import { FREE_DAILY_NO_WATERMARK, setQuotaStorage } from './quota'
import { decideSingleExport, decideBatchExport } from './gating'
import { TEST_PRIVATE_KEY_HEX, TEST_PUBLIC_KEY_HEX } from './testKey'

class MemStorage {
  m = new Map<string, string>()
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, v) }
  removeItem(k: string) { this.m.delete(k) }
}

const NOW = new Date(2026, 8, 25, 10, 0).getTime()

beforeEach(() => {
  setLicenseStorage(new MemStorage())   // 码与额度同用一份存储,贴近真实 localStorage
  setQuotaStorage(new MemStorage())
  setLicensePublicKey(TEST_PUBLIC_KEY_HEX)
})

describe('decideSingleExport', () => {
  it('免费:前 5 次 none(逐次消耗),第 6 次起 corner', () => {
    for (let i = 0; i < FREE_DAILY_NO_WATERMARK; i++) {
      expect(decideSingleExport(NOW).mode).toBe('none')
    }
    expect(decideSingleExport(NOW).mode).toBe('corner')
  })

  it('会员:始终 none 且不消耗额度', () => {
    activateCode(signLicense({ v: 1, tier: 'month', exp: Math.floor(NOW / 1000) + 1 }, TEST_PRIVATE_KEY_HEX), NOW)
    for (let i = 0; i < FREE_DAILY_NO_WATERMARK + 3; i++) {
      expect(decideSingleExport(NOW).mode).toBe('none')
    }
  })

  it('过期会员回落免费逻辑', () => {
    activateCode(signLicense({ v: 1, tier: 'day', exp: Math.floor(NOW / 1000) - 1 }, TEST_PRIVATE_KEY_HEX), NOW)
    expect(decideSingleExport(NOW).mode).toBe('none')   // 免费第 1 次
    expect(decideSingleExport(NOW).mode).toBe('none')
  })
})

describe('decideBatchExport', () => {
  it('免费=tiled 且不消耗单图额度;会员=none', () => {
    expect(decideBatchExport(NOW).mode).toBe('tiled')
    expect(decideSingleExport(NOW).mode).toBe('none')   // 额度未被批量动过
    activateCode(signLicense({ v: 1, tier: 'day', exp: Math.floor(NOW / 1000) + 100 }, TEST_PRIVATE_KEY_HEX), NOW)
    expect(decideBatchExport(NOW).mode).toBe('none')
  })
})

// src/lib/license/gating.test.ts
// 导出决策:免费额度内无水印(逐次消耗)、超额角落、免费批量平铺不耗额度、会员全免。
// 会员态通过直写存储区凭证模拟(did 与本机一致),判定只依赖存储凭证,无需网络。
import { describe, it, expect, beforeEach } from 'vitest'
import { signCredential } from './emit'
import { getOrCreateDeviceId, setLicenseStorage, setLicensePublicKey } from './verify'
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
let mem: MemStorage

beforeEach(() => {
  mem = new MemStorage()
  setLicenseStorage(mem)   // 凭证与额度同用一份存储,贴近真实 localStorage
  setQuotaStorage(mem)
  setLicensePublicKey(TEST_PUBLIC_KEY_HEX)
})

/** 模拟已完成激活的本机会员:写 did 与本机一致的隐藏凭证(expOffset 相对 NOW,秒)。 */
const becomeMember = (expOffsetSec: number) => {
  const did = getOrCreateDeviceId()
  const cred = signCredential({ v: 2, cid: 'abcdef0123456789', exp: Math.floor(NOW / 1000) + expOffsetSec, did }, TEST_PRIVATE_KEY_HEX)
  mem.setItem('pixel-forge.license.v2', cred)
}

describe('decideSingleExport', () => {
  it('免费:前 5 次 none(逐次消耗),第 6 次起 corner', () => {
    for (let i = 0; i < FREE_DAILY_NO_WATERMARK; i++) {
      expect(decideSingleExport(NOW).mode).toBe('none')
    }
    expect(decideSingleExport(NOW).mode).toBe('corner')
  })

  it('会员:始终 none 且不消耗额度', () => {
    becomeMember(60)
    for (let i = 0; i < FREE_DAILY_NO_WATERMARK + 3; i++) {
      expect(decideSingleExport(NOW).mode).toBe('none')
    }
  })

  it('过期会员回落免费逻辑', () => {
    becomeMember(-1)
    expect(decideSingleExport(NOW).mode).toBe('none')   // 免费第 1 次
    expect(decideSingleExport(NOW).mode).toBe('none')
  })
})

describe('decideBatchExport', () => {
  it('免费=tiled 且不消耗单图额度;会员=none', () => {
    expect(decideBatchExport(NOW).mode).toBe('tiled')
    expect(decideSingleExport(NOW).mode).toBe('none')   // 额度未被批量动过
    becomeMember(100)
    expect(decideBatchExport(NOW).mode).toBe('none')
  })
})

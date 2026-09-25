// src/lib/license/quota.test.ts
// 每日免费无水印额度:递减/耗尽/跨本地自然日重置/坏存储容错。
import { describe, it, expect, beforeEach } from 'vitest'
import { FREE_DAILY_NO_WATERMARK, todayKey, remainingToday, consumeOne, setQuotaStorage } from './quota'

class MemStorage {
  m = new Map<string, string>()
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, v) }
  removeItem(k: string) { this.m.delete(k) }
}

beforeEach(() => setQuotaStorage(new MemStorage()))

describe('quota', () => {
  it('初始剩余 5,消耗递减,耗尽返回 false', () => {
    const now = new Date(2026, 8, 25, 10, 0).getTime()
    expect(remainingToday(now)).toBe(FREE_DAILY_NO_WATERMARK)
    for (let i = 0; i < FREE_DAILY_NO_WATERMARK; i++) expect(consumeOne(now)).toBe(true)
    expect(remainingToday(now)).toBe(0)
    expect(consumeOne(now)).toBe(false)
  })

  it('跨本地自然日重置(23:59 → 次日 00:01)', () => {
    const night = new Date(2026, 8, 25, 23, 59).getTime()
    const dawn = new Date(2026, 8, 26, 0, 1).getTime()
    for (let i = 0; i < FREE_DAILY_NO_WATERMARK; i++) consumeOne(night)
    expect(remainingToday(dawn)).toBe(FREE_DAILY_NO_WATERMARK)
  })

  it('todayKey 用本地时区日期(非 UTC)', () => {
    // 本地 2026-09-26 00:30;若用 UTC 在东八区会得到 09-25——断言取本地
    const t = new Date(2026, 8, 26, 0, 30).getTime()
    expect(todayKey(t)).toBe('2026-09-26')
  })

  it('坏 JSON / 坏结构 / 异常 storage 均安全回落为满额或原值', () => {
    const bad = new MemStorage()
    bad.setItem('pixel-forge.freeExports.v1', '{oops')
    setQuotaStorage(bad)
    expect(remainingToday(Date.now())).toBe(FREE_DAILY_NO_WATERMARK)
    bad.setItem('pixel-forge.freeExports.v1', JSON.stringify({ date: todayKey(Date.now()), count: 'x' }))
    expect(remainingToday(Date.now())).toBe(FREE_DAILY_NO_WATERMARK)
    setQuotaStorage(null)
    expect(remainingToday(Date.now())).toBe(0)   // 无存储视为不可享额度(不会在浏览器出现)
    expect(consumeOne(Date.now())).toBe(false)
  })
})

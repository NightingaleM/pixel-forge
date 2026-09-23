// src/lib/randomId.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { randomId } from './randomId'

describe('randomId', () => {
  it('返回非空且不重复的字符串', () => {
    const a = randomId()
    const b = randomId()
    expect(a.length).toBeGreaterThan(0)
    expect(a).not.toBe(b)
  })

  it('crypto.randomUUID 不可用时(非安全上下文)走时间戳+随机串回退', () => {
    vi.stubGlobal('crypto', {})   // 模拟 http 部署:无 randomUUID 方法
    try {
      expect(randomId()).toMatch(/^\d+-[0-9a-z]+$/)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

// afterEach 兜底:断言失败也恢复被替换的全局,避免污染后续用例
afterEach(() => vi.unstubAllGlobals())

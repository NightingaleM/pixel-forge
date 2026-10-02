import { describe, it, expect } from 'vitest'
import { settleSnap } from './sheetSnap'

describe('settleSnap', () => {
  const peek = 400, full = 700, closeTh = 80
  it('近 peek 且速度小 → peek', () => {
    expect(settleSnap(380, 0, peek, full, closeTh)).toBe('peek')
  })
  it('上抛速度大 → full', () => {
    expect(settleSnap(380, -900, peek, full, closeTh)).toBe('full')
  })
  it('下拉超关闭阈值 → close', () => {
    expect(settleSnap(80, 200, peek, full, closeTh)).toBe('close')
  })
  it('下拉速度大也 close', () => {
    expect(settleSnap(300, 1200, peek, full, closeTh)).toBe('close')
  })
  it('近 full → full', () => {
    expect(settleSnap(650, 100, peek, full, closeTh)).toBe('full')
  })
})

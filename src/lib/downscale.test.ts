// src/lib/downscale.test.ts
import { describe, it, expect } from 'vitest'
import { MAX_IMAGE_EDGE, needsDownscale, scaledSize } from './downscale'

describe('needsDownscale', () => {
  it('最长边超阈值为 true', () => {
    expect(needsDownscale(5000, 3000)).toBe(true)
    expect(needsDownscale(3000, 5000)).toBe(true)
  })
  it('等于阈值为 false(边界含)', () => {
    expect(needsDownscale(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE)).toBe(false)
  })
  it('小于阈值为 false', () => {
    expect(needsDownscale(1920, 1080)).toBe(false)
  })
  it('自定义阈值生效', () => {
    expect(needsDownscale(3000, 2000, 2048)).toBe(true)
  })
})

describe('scaledSize', () => {
  it('按长边等比缩放', () => {
    expect(scaledSize(8192, 4096)).toEqual({ w: 4096, h: 2048 })
  })
  it('无需缩放时返回原尺寸', () => {
    expect(scaledSize(1000, 500)).toEqual({ w: 1000, h: 500 })
  })
})

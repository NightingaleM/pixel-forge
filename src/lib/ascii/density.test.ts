import { describe, it, expect } from 'vitest'
import { computeFillRate, sortToRamp, luminanceToIndex } from './density'

describe('computeFillRate', () => {
  it('returns 0 for fully transparent pixels', () => {
    const px = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(computeFillRate(px)).toBe(0)
  })

  it('returns 1 for fully opaque pixels', () => {
    const px = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255])
    expect(computeFillRate(px)).toBe(1)
  })

  it('returns 0.5 when half the pixels are above threshold', () => {
    const px = new Uint8ClampedArray([0, 0, 0, 0, 255, 255, 255, 255])
    expect(computeFillRate(px)).toBe(0.5)
  })

  it('returns 0 for empty input', () => {
    expect(computeFillRate(new Uint8ClampedArray(0))).toBe(0)
  })
})

describe('sortToRamp', () => {
  it('sorts chars by fillRate ascending (sparse -> dense)', () => {
    const measured = [
      { char: '#', fillRate: 0.8 },
      { char: '.', fillRate: 0.1 },
      { char: 'o', fillRate: 0.5 },
    ]
    expect(sortToRamp(measured)).toEqual(['.', 'o', '#'])
  })

  it('returns empty for empty input', () => {
    expect(sortToRamp([])).toEqual([])
  })
})

describe('luminanceToIndex', () => {
  it('bright (1) -> index 0 (sparsest)', () => {
    expect(luminanceToIndex(1, 10)).toBe(0)
  })

  it('dark (0) -> last index (densest)', () => {
    expect(luminanceToIndex(0, 10)).toBe(9)
  })

  it('clamps luminance above 1 and below 0', () => {
    expect(luminanceToIndex(2, 10)).toBe(0)
    expect(luminanceToIndex(-1, 10)).toBe(9)
  })

  it('returns 0 when ramp length <= 1', () => {
    expect(luminanceToIndex(0.5, 1)).toBe(0)
    expect(luminanceToIndex(0.5, 0)).toBe(0)
  })
})

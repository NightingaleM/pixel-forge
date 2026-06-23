import { describe, it, expect } from 'vitest'
import { rgbaToLuminance, cellAverageLuminance, cellContrast, shouldSkipCell } from './image'

describe('rgbaToLuminance', () => {
  it('white -> ~255', () => {
    expect(Math.round(rgbaToLuminance(255, 255, 255))).toBe(255)
  })

  it('black -> 0', () => {
    expect(rgbaToLuminance(0, 0, 0)).toBe(0)
  })
})

describe('cellAverageLuminance', () => {
  it('returns the normalized average luminance of a uniform cell', () => {
    const px = new Uint8ClampedArray([
      255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255,
    ])
    const lum = cellAverageLuminance(px, 2, { x: 0, y: 0, w: 2, h: 2 })
    expect(lum).toBeCloseTo(1, 2)
  })

  it('returns 0 for a black cell', () => {
    const px = new Uint8ClampedArray(16)
    expect(cellAverageLuminance(px, 2, { x: 0, y: 0, w: 2, h: 2 })).toBe(0)
  })
})

describe('cellContrast', () => {
  it('returns 0 for a uniform cell', () => {
    const px = new Uint8ClampedArray([
      128, 128, 128, 255, 128, 128, 128, 255,
      128, 128, 128, 255, 128, 128, 128, 255,
    ])
    expect(cellContrast(px, 2, { x: 0, y: 0, w: 2, h: 2 })).toBeCloseTo(0, 6)
  })

  it('returns > 0 for a varied cell', () => {
    const px = new Uint8ClampedArray([
      0, 0, 0, 255, 255, 255, 255, 255,
      0, 0, 0, 255, 255, 255, 255, 255,
    ])
    expect(cellContrast(px, 2, { x: 0, y: 0, w: 2, h: 2 })).toBeGreaterThan(0)
  })
})

describe('shouldSkipCell', () => {
  it('skips when contrast below threshold', () => {
    expect(shouldSkipCell(0.05, 0.12)).toBe(true)
  })

  it('keeps when contrast at/above threshold', () => {
    expect(shouldSkipCell(0.12, 0.12)).toBe(false)
    expect(shouldSkipCell(0.3, 0.12)).toBe(false)
  })
})

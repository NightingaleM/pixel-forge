import { describe, expect, it } from 'vitest'
import { estimateFocusBand } from './tiltshiftBand'

/** 构造 RGBA 缩略图: 指定行区间为「高饱和棋盘高频带」,其余为平坦灰底。 */
function bandThumb(w: number, h: number, row0: number, row1: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let p = 0; p < w * h; p++) {
    const j = Math.floor(p / w)
    const i = p % w
    const inBand = j >= row0 && j < row1
    if (inBand) {
      const on = (i + j) % 2 === 0
      d[p * 4] = on ? 255 : 0
      d[p * 4 + 1] = 0
      d[p * 4 + 2] = on ? 0 : 255
      d[p * 4 + 3] = 255
    } else {
      d[p * 4] = 128
      d[p * 4 + 1] = 128
      d[p * 4 + 2] = 128
      d[p * 4 + 3] = 255
    }
  }
  return d
}

describe('estimateFocusBand (tiltshift 智能焦带, 票04 口径)', () => {
  it('中央高饱和高频带 → y 翻转正确(行序→uv 向上)且置信', () => {
    const w = 64, h = 48
    // 带中心行 24/48 = 0.5(行序,向下) → 期望 y ≈ 0.5
    const est = estimateFocusBand(bandThumb(w, h, 18, 30), w, h)
    expect(est.confident).toBe(true)
    expect(Math.abs(est.y - 0.5)).toBeLessThan(0.12)
    expect(est.tilt).toBe(0)
  })

  it('带在画面顶部(行序 0-10) → y 接近 1(y 轴翻转语义)', () => {
    const w = 64, h = 48
    const est = estimateFocusBand(bandThumb(w, h, 0, 10), w, h)
    // 带中心行序 ≈ 5/48 ≈ 0.10(向下) → uv y = 1 - 0.10 ≈ 0.90
    expect(Math.abs(est.y - (1 - 5 / 48))).toBeLessThan(0.06)
    expect(est.y).toBeGreaterThan(0.75)
  })

  it('带在画面下部(行序 38-48) → y < 0.25', () => {
    const w = 64, h = 48
    const est = estimateFocusBand(bandThumb(w, h, 38, 48), w, h)
    expect(est.y).toBeLessThan(0.25)
  })

  it('平坦图 → 不置信,回退默认带', () => {
    const w = 64, h = 48
    const flat = new Uint8ClampedArray(w * h * 4).fill(128)
    const est = estimateFocusBand(flat, w, h)
    expect(est.confident).toBe(false)
    expect(est.y).toBe(0.5)
    expect(est.tilt).toBe(0)
  })

  it('过小图 → 回退', () => {
    const est = estimateFocusBand(new Uint8ClampedArray(3 * 3 * 4).fill(64), 3, 3)
    expect(est.confident).toBe(false)
    expect(est.y).toBe(0.5)
  })

  it('返回值域受控: y ∈ [0.15,0.85], tilt ∈ {0,±8,±16}', () => {
    const w = 64, h = 48
    const est = estimateFocusBand(bandThumb(w, h, 20, 28), w, h)
    expect(est.y).toBeGreaterThanOrEqual(0.15)
    expect(est.y).toBeLessThanOrEqual(0.85)
    expect([0, 8, -8, 16, -16]).toContain(est.tilt)
  })
})

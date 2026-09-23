import { describe, it, expect } from 'vitest'
import { buildRenderParams } from './renderImage'
import { getStyle } from './StyleRegistry'

const ascii = getStyle('ascii')!

describe('buildRenderParams', () => {
  it('color 参数拆 R/G/B(0..1 浮点)并入 merged', () => {
    const m = buildRenderParams(ascii, { uCellSize: 5 }, { uCharColor: '#ff8000' }, null)
    expect(m.uCellSize).toBe(5)
    expect(m.uCharColorR).toBeCloseTo(1)
    expect(m.uCharColorG).toBeCloseTo(0x80 / 255)
    expect(m.uCharColorB).toBe(0)
  })

  it('color 缺值回退 default', () => {
    const m = buildRenderParams(ascii, {}, {}, null)
    const d = ascii.params.find((p) => p.type === 'color') as { uniform: string; default: string }
    expect(m[`${d.uniform}R`].toString()).toBeTruthy()
  })

  it('uGodRayAuto=1 且有 brightest 时覆盖中心;无 brightest 不覆盖', () => {
    const base = { uGodRayAuto: 1, uCenterX: 0, uCenterY: 0 }
    const a = buildRenderParams(ascii, { ...base }, {}, { x: 0.3, y: -0.2 })
    expect(a.uCenterX).toBe(0.3)
    expect(a.uCenterY).toBe(-0.2)
    const b = buildRenderParams(ascii, { ...base }, {}, null)
    expect(b.uCenterX).toBe(0)
  })

  it('uGodRayAuto 非 1 时不覆盖(uGodRayAuto 键不存在也安全)', () => {
    const m = buildRenderParams(ascii, { uCenterX: 0.5 }, {}, { x: 0.9, y: 0.9 })
    expect(m.uCenterX).toBe(0.5)
  })

  it('不修改入参 params', () => {
    const base = { uCellSize: 5 }
    buildRenderParams(ascii, base, { uCharColor: '#ffffff' }, null)
    expect(base).toEqual({ uCellSize: 5 })
  })
})
